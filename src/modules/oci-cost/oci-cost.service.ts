import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BandwidthService } from '../bandwidth/bandwidth.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { OciService } from '../oci/oci.service';
import {
  ComponentAmount,
  CostComponentKey,
  OciCostMonthlyReport,
  OciRateCard,
  VmCostRow,
} from './oci-cost.types';

/**
 * Reconstructs Oracle's monthly bill for ICS from what the platform knows about
 * each VM, and sets it against what customers paid in the same month.
 *
 * Oracle bills per instance:
 *   OCPU     : billed OCPU (= OCPU × burstable baseline) × $/OCPU-h × RUNNING hours
 *   Memory   : GB × $/GB-h × RUNNING hours
 *   Windows  : OCPU (full, not baseline) × $/OCPU-h × RUNNING hours
 *   Storage  : boot volume GB × ($/GB-mo + VPU × $/VPU/GB-mo) × EXIST hours / hours in month
 *   Egress   : GB out × $/GB (per-tenancy free quota, configurable — the current
 *              dealer bills from the first GB, so the default quota is 0)
 *
 * "RUNNING hours" come from vm_state_history (a stopped instance keeps its boot
 * volume but stops billing compute); "EXIST hours" run from created_at to
 * terminated_at. Both are clipped to the calendar month in UTC — the same month
 * boundary BandwidthService uses, so egress and compute agree.
 *
 * Every rate has a sensible default (Oracle's published E5 list price and the
 * dealer discounts observed on the Jun/Jul 2026 invoices) and an env override,
 * so finance can re-tune the report without a deploy.
 */
@Injectable()
export class OciCostService {
  private readonly logger = new Logger(OciCostService.name);

  /** States in which Oracle does NOT bill OCPU / memory / Windows license. */
  private static readonly NON_BILLABLE_COMPUTE_STATES = new Set([
    'STOPPED',
    'TERMINATED',
    'TERMINATING',
  ]);

  /** Re-sync a live VM's shape config from OCI at most this often. */
  private static readonly SHAPE_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bandwidthService: BandwidthService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly ociService: OciService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Rate card
  // ───────────────────────────────────────────────────────────────────────────

  private envNum(name: string, fallback: number): number {
    const v = parseFloat(process.env[name] || '');
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  /** Rate card without FX (FX is resolved per report). */
  baseRateCard(): Omit<OciRateCard, 'usdToVnd' | 'fxSource' | 'fxDate'> {
    return {
      ocpuHourUsd: {
        E5: this.envNum('OCI_COST_OCPU_HOUR_USD_E5', 0.03),
        E4: this.envNum('OCI_COST_OCPU_HOUR_USD_E4', 0.025),
        E3: this.envNum('OCI_COST_OCPU_HOUR_USD_E3', 0.025),
        A1: this.envNum('OCI_COST_OCPU_HOUR_USD_A1', 0.01),
        STANDARD3: this.envNum('OCI_COST_OCPU_HOUR_USD_STANDARD3', 0.04),
      },
      memoryGbHourUsd: {
        E5: this.envNum('OCI_COST_MEM_GB_HOUR_USD_E5', 0.002),
        E4: this.envNum('OCI_COST_MEM_GB_HOUR_USD_E4', 0.0015),
        E3: this.envNum('OCI_COST_MEM_GB_HOUR_USD_E3', 0.0015),
        A1: this.envNum('OCI_COST_MEM_GB_HOUR_USD_A1', 0.0015),
        STANDARD3: this.envNum('OCI_COST_MEM_GB_HOUR_USD_STANDARD3', 0.0015),
      },
      blockGbMonthUsd: this.envNum('OCI_COST_BLOCK_GB_MONTH_USD', 0.0255),
      blockVpuGbMonthUsd: this.envNum('OCI_COST_BLOCK_VPU_GB_MONTH_USD', 0.0017),
      defaultVpusPerGb: this.envNum('OCI_COST_DEFAULT_VPUS_PER_GB', 10),
      egressGbUsd: this.envNum('OCI_COST_EGRESS_GB_USD', 0.025),
      egressFreeGbPerMonth: this.envNum('OCI_COST_EGRESS_FREE_GB', 0),
      // Same env the subscription price uses for the Windows uplift, so cost and
      // sell price stay on one number.
      windowsLicenseOcpuHourUsd: this.envNum('WINDOWS_LICENSE_USD_PER_OCPU_HOUR', 0.092),
      discountPct: {
        cpu: this.envNum('OCI_COST_DISCOUNT_PCT_COMPUTE', 22),
        ram: this.envNum('OCI_COST_DISCOUNT_PCT_COMPUTE', 22),
        storage: this.envNum('OCI_COST_DISCOUNT_PCT_STORAGE', 8),
        egress: this.envNum('OCI_COST_DISCOUNT_PCT_EGRESS', 8),
        windows: this.envNum('OCI_COST_DISCOUNT_PCT_WINDOWS', 0),
        other: this.envNum('OCI_COST_DISCOUNT_PCT_OTHER', 0),
      },
    };
  }

  private async resolveFx(
    override?: number,
  ): Promise<Pick<OciRateCard, 'usdToVnd' | 'fxSource' | 'fxDate'>> {
    if (override && Number.isFinite(override) && override > 0) {
      return { usdToVnd: override, fxSource: 'query' };
    }
    try {
      // Sell rate: what ICS pays a Vietnamese bank to buy the USD it remits.
      const rows = await this.exchangeRateService.getTodayRates({
        currency_from: 'USD',
        currency_to: 'VND',
        direction: 'sell',
      });
      const r = rows?.[0];
      if (r && Number(r.rate) > 0) {
        return { usdToVnd: Number(r.rate), fxSource: 'exchange_rate_table', fxDate: String(r.date) };
      }
    } catch (e: any) {
      this.logger.warn(`FX lookup failed, falling back: ${e?.message ?? e}`);
    }
    const env = parseFloat(process.env.OCI_COST_USD_TO_VND || '');
    if (Number.isFinite(env) && env > 0) return { usdToVnd: env, fxSource: 'env' };
    return { usdToVnd: 26310, fxSource: 'default' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /** "YYYY-MM" → UTC month window, matching BandwidthService.getMonthRange. */
  private monthWindow(yearMonth: string): { start: Date; end: Date } {
    const m = /^(\d{4})-(\d{2})$/.exec(yearMonth || '');
    if (!m) throw new BadRequestException('month must be in YYYY-MM format');
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) throw new BadRequestException('month must be in YYYY-MM format');
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    return { start, end };
  }

  private shapeFamily(shape: string | null | undefined): string {
    const s = String(shape || '').toUpperCase();
    if (s.includes('GPU')) return 'GPU';
    if (s.includes('.E5.')) return 'E5';
    if (s.includes('.E4.')) return 'E4';
    if (s.includes('.E3.')) return 'E3';
    if (s.includes('.A1.')) return 'A1';
    if (s.includes('STANDARD3')) return 'STANDARD3';
    return 'E5';
  }

  private baselineFraction(baseline: string | null | undefined): number | null {
    switch (String(baseline || '').toUpperCase()) {
      case 'BASELINE_1_1':
        return 1;
      case 'BASELINE_1_2':
        return 0.5;
      case 'BASELINE_1_8':
        return 0.125;
      default:
        return null;
    }
  }

  private firstNumber(s: string | null | undefined): number | null {
    const m = String(s || '').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  private hours(from: Date, to: Date): number {
    return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
  }

  /**
   * Bind a Date to a TIMESTAMP (without time zone) column as an explicit UTC
   * wall-clock string. node-postgres would otherwise serialise the Date in the
   * Node process's local zone, and Postgres drops the offset when casting to
   * TIMESTAMP — a 7h shift on a server running Asia/Ho_Chi_Minh. Reads are
   * already forced to UTC in main.ts; this makes the writes/comparisons match.
   */
  private pgUtc(d: Date): string {
    return d.toISOString().replace('T', ' ').replace('Z', '');
  }

  private round(n: number, digits = 4): number {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }

  private componentAmount(listUsd: number, discountPct: number, usdToVnd: number): ComponentAmount {
    const netUsd = listUsd * (1 - discountPct / 100);
    return {
      listUsd: this.round(listUsd),
      discountPct,
      netUsd: this.round(netUsd),
      netVnd: Math.round(netUsd * usdToVnd),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OCI shape sync (live VMs only)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fill the cached shape / boot-volume columns from OCI for live VMs whose
   * cache is missing or stale. Best-effort and sequential (OCI rate limits).
   */
  private async syncShapeConfigs(vms: any[], warnings: string[]): Promise<void> {
    const now = Date.now();
    const candidates = vms.filter((vm) => {
      if (!vm.instance_id || vm.instance_id === 'PENDING') return false;
      if (['TERMINATED', 'TERMINATING'].includes(vm.lifecycle_state || '')) return false;
      if (!vm.shape_config_synced_at) return true;
      return now - new Date(vm.shape_config_synced_at).getTime() > OciCostService.SHAPE_SYNC_TTL_MS;
    });
    if (candidates.length === 0) return;

    let failed = 0;
    for (const vm of candidates) {
      await new Promise((r) => setTimeout(r, 150));
      try {
        const inst = await this.ociService.getInstance(vm.instance_id);
        const sc = (inst as any).shapeConfig as
          | { ocpus: number | null; memoryInGBs: number | null; baselineOcpuUtilization: string | null }
          | null;
        let boot: { sizeInGBs: number; vpusPerGB: number } | null = null;
        if (vm.availability_domain && vm.compartment_id) {
          try {
            boot = await this.ociService.getInstanceBootVolume(
              vm.instance_id,
              vm.compartment_id,
              vm.availability_domain,
            );
          } catch (e: any) {
            this.logger.debug(`boot volume lookup failed for ${vm.instance_id}: ${e?.message ?? e}`);
          }
        }
        const patch = {
          ocpus: sc?.ocpus ?? vm.ocpus ?? null,
          memory_gbs: sc?.memoryInGBs ?? vm.memory_gbs ?? null,
          baseline_ocpu_utilization: sc?.baselineOcpuUtilization ?? vm.baseline_ocpu_utilization ?? null,
          boot_volume_gbs: boot?.sizeInGBs || vm.boot_volume_gbs || null,
          boot_volume_vpus_per_gb: boot ? boot.vpusPerGB : vm.boot_volume_vpus_per_gb ?? null,
          shape_config_synced_at: new Date(),
        };
        await this.dataSource.query(
          `UPDATE oracle.vm_instances
              SET ocpus = $1, memory_gbs = $2, baseline_ocpu_utilization = $3,
                  boot_volume_gbs = $4, boot_volume_vpus_per_gb = $5, shape_config_synced_at = $6
            WHERE id = $7`,
          [
            patch.ocpus,
            patch.memory_gbs,
            patch.baseline_ocpu_utilization,
            patch.boot_volume_gbs,
            patch.boot_volume_vpus_per_gb,
            this.pgUtc(patch.shape_config_synced_at),
            vm.id,
          ],
        );
        Object.assign(vm, patch);
      } catch (e: any) {
        failed++;
        this.logger.warn(`shape sync failed for VM ${vm.instance_id}: ${e?.message ?? e}`);
      }
    }
    if (failed > 0) warnings.push(`shape_sync_failed:${failed}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Running / existing hours from state history
  // ───────────────────────────────────────────────────────────────────────────

  private computeHours(
    vm: any,
    history: Array<{ new_state: string; changed_at: Date }>,
    windowStart: Date,
    windowEnd: Date,
  ): { from: Date; to: Date; existHours: number; runningHours: number } {
    const createdAt = new Date(vm.created_at);
    const terminatedAt = vm.terminated_at ? new Date(vm.terminated_at) : null;
    const from = createdAt > windowStart ? createdAt : windowStart;
    let to = windowEnd;
    if (terminatedAt && terminatedAt < to) to = terminatedAt;
    if (to <= from) return { from, to: from, existHours: 0, runningHours: 0 };

    const existHours = this.hours(from, to);

    // State in force at `from`: the last transition at or before it. A VM with
    // no history (or none before `from`) is assumed to have been running.
    let state = 'RUNNING';
    for (const h of history) {
      if (h.changed_at <= from) state = h.new_state;
      else break;
    }

    let running = 0;
    let cursor = from;
    for (const h of history) {
      if (h.changed_at <= from) continue;
      if (h.changed_at >= to) break;
      if (!OciCostService.NON_BILLABLE_COMPUTE_STATES.has(state)) running += this.hours(cursor, h.changed_at);
      cursor = h.changed_at;
      state = h.new_state;
    }
    if (!OciCostService.NON_BILLABLE_COMPUTE_STATES.has(state)) running += this.hours(cursor, to);

    return { from, to, existHours, runningHours: Math.min(running, existHours) };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Report
  // ───────────────────────────────────────────────────────────────────────────

  async getMonthlyReport(
    yearMonth: string,
    opts: { sync?: boolean; usdToVnd?: number } = {},
  ): Promise<OciCostMonthlyReport> {
    const { start, end } = this.monthWindow(yearMonth);
    const now = new Date();
    const effectiveEnd = end > now ? now : end;
    const hoursInMonth = this.hours(start, end);
    const hoursElapsed = this.hours(start, effectiveEnd);
    const warnings: string[] = [];

    const rates: OciRateCard = { ...this.baseRateCard(), ...(await this.resolveFx(opts.usdToVnd)) };

    // ── VMs that existed at any point inside the month ─────────────────────
    const vms: any[] = await this.dataSource.query(
      `SELECT vi.id, vi.instance_id, vi.instance_name, vi.shape, vi.lifecycle_state,
              vi.compartment_id, vi.availability_domain, vi.operating_system,
              vi.created_at, vi.terminated_at,
              vi.ocpus, vi.memory_gbs, vi.boot_volume_gbs, vi.boot_volume_vpus_per_gb,
              vi.baseline_ocpu_utilization, vi.shape_config_synced_at,
              vi.user_id, vi.subscription_id,
              s.status        AS sub_status,
              s.os_type       AS sub_os_type,
              s.start_date    AS sub_start_date,
              s.end_date      AS sub_end_date,
              s.configuration AS sub_configuration,
              s.cloud_package_id,
              cp.name         AS package_name,
              cp.type         AS package_type,
              cp.cost         AS package_cost_usd,
              cp.cost_vnd     AS package_cost_vnd,
              cp.cpu          AS package_cpu,
              cp.ram          AS package_ram,
              cp.memory       AS package_storage,
              u.email, u.first_name, u.last_name, u.company
         FROM oracle.vm_instances vi
         LEFT JOIN oracle.subscriptions  s  ON s.id  = vi.subscription_id
         LEFT JOIN oracle.cloud_packages cp ON cp.id = s.cloud_package_id
         LEFT JOIN oracle.users          u  ON u.id  = vi.user_id
        WHERE vi.instance_id IS NOT NULL
          AND vi.instance_id <> 'PENDING'
          AND vi.created_at < $2
          AND (vi.terminated_at IS NULL OR vi.terminated_at >= $1)
        ORDER BY vi.created_at ASC`,
      [this.pgUtc(start), this.pgUtc(end)],
    );

    if (opts.sync !== false) await this.syncShapeConfigs(vms, warnings);

    // ── State history for those VMs ─────────────────────────────────────────
    const vmIds = vms.map((v) => v.id);
    const historyByVm = new Map<number, Array<{ new_state: string; changed_at: Date }>>();
    if (vmIds.length > 0) {
      const rows: any[] = await this.dataSource.query(
        `SELECT vm_instance_id, new_state, changed_at
           FROM oracle.vm_state_history
          WHERE vm_instance_id = ANY($1::int[])
            AND changed_at < $2
          ORDER BY changed_at ASC, id ASC`,
        [vmIds, this.pgUtc(effectiveEnd)],
      );
      for (const r of rows) {
        const list = historyByVm.get(r.vm_instance_id) || [];
        list.push({ new_state: r.new_state, changed_at: new Date(r.changed_at) });
        historyByVm.set(r.vm_instance_id, list);
      }
    }

    // ── Revenue: subscription debits that landed inside the month ──────────
    const paidBySub = new Map<string, number>();
    let totalCollectedVnd = 0;
    const paidRows: any[] = await this.dataSource.query(
      `SELECT wt.subscription_id, SUM(-wt.change_amount) AS paid
         FROM oracle.wallet_transactions wt
        WHERE wt.subscription_id IS NOT NULL
          AND wt.change_amount < 0
          AND wt.created_at >= $1 AND wt.created_at < $2
        GROUP BY wt.subscription_id`,
      [this.pgUtc(start), this.pgUtc(end)],
    );
    for (const r of paidRows) {
      const v = Number(r.paid) || 0;
      paidBySub.set(r.subscription_id, v);
      totalCollectedVnd += v;
    }

    // ── Egress from the bandwidth service (OCI Monitoring or archive) ──────
    const egressByVm = new Map<number, { gb: number; dataSource: string }>();
    let unattributedEgressGb = 0;
    try {
      const bw = await this.bandwidthService.getAllVmsBandwidthUsage(yearMonth);
      for (const v of bw.vms || []) {
        egressByVm.set(v.vmId, {
          gb: (Number(v.bandwidth?.bytesOut) || 0) / 1024 ** 3,
          dataSource: v.bandwidth?.dataSource || 'none',
        });
      }
      for (const c of bw.compartments || []) {
        unattributedEgressGb += (Number(c.deletedVmsSummary?.egressTB) || 0) * 1024;
      }
    } catch (e: any) {
      this.logger.error(`bandwidth lookup failed for ${yearMonth}: ${e?.message ?? e}`);
      warnings.push('egress_unavailable');
    }

    // ── Per-VM rows ─────────────────────────────────────────────────────────
    const rows: VmCostRow[] = [];
    for (const vm of vms) {
      const assumptions: string[] = [];
      const family = this.shapeFamily(vm.shape);
      const h = this.computeHours(vm, historyByVm.get(vm.id) || [], start, effectiveEnd);
      if (!historyByVm.has(vm.id)) assumptions.push('no_state_history');

      // Spec: OCI cache → launch cache → subscription.configuration → package text
      const cfg = (vm.sub_configuration && typeof vm.sub_configuration === 'object') ? vm.sub_configuration : {};
      let specSource: VmCostRow['spec']['source'] = 'package';
      let ocpus: number | null = vm.ocpus != null ? Number(vm.ocpus) : null;
      let memoryGb: number | null = vm.memory_gbs != null ? Number(vm.memory_gbs) : null;
      let bootGb: number | null = vm.boot_volume_gbs != null ? Number(vm.boot_volume_gbs) : null;
      if (ocpus != null || memoryGb != null) specSource = vm.shape_config_synced_at ? 'oci' : 'launch';
      if (ocpus == null && Number(cfg.ocpus) > 0) ocpus = Number(cfg.ocpus);
      if (memoryGb == null && Number(cfg.memoryInGBs) > 0) memoryGb = Number(cfg.memoryInGBs);
      if (bootGb == null && Number(cfg.bootVolumeSizeInGBs) > 0) bootGb = Number(cfg.bootVolumeSizeInGBs);
      if (ocpus == null) {
        const vcpu = this.firstNumber(vm.package_cpu) ?? 2;
        ocpus = Math.max(1, Math.ceil(vcpu / 2));
        assumptions.push('ocpus_from_package');
      }
      if (memoryGb == null) {
        memoryGb = this.firstNumber(vm.package_ram) ?? ocpus;
        assumptions.push('memory_from_package');
      }
      if (bootGb == null) {
        bootGb = Math.max(50, this.firstNumber(vm.package_storage) ?? 50);
        assumptions.push('boot_volume_from_package');
      }
      const vpusPerGb = vm.boot_volume_vpus_per_gb != null ? Number(vm.boot_volume_vpus_per_gb) : rates.defaultVpusPerGb;

      let baselineFraction = this.baselineFraction(vm.baseline_ocpu_utilization);
      if (baselineFraction == null) {
        // Unknown baseline: bill the full OCPU. Over-estimates for burstable
        // instances launched after 2026-09-09 that have not been synced yet —
        // conservative for finance, and the sync fixes it for live VMs.
        baselineFraction = 1;
        assumptions.push('baseline_unknown_assumed_100pct');
      }
      const billedOcpus = ocpus * baselineFraction;

      const isWindows =
        String(vm.sub_os_type || '').toLowerCase() === 'windows' ||
        /windows/i.test(String(vm.operating_system || ''));

      const egress = egressByVm.get(vm.id) || { gb: 0, dataSource: warnings.includes('egress_unavailable') ? 'error' : 'none' };

      const cost: VmCostRow['cost'] = {
        cpu: 0, ram: 0, storage: 0, egress: 0, windows: 0, other: 0, listUsd: 0, netUsd: 0, netVnd: 0,
      };
      if (family === 'GPU') {
        // GPU/BM shapes are billed per GPU-hour with CPU/RAM included; the
        // catalogue price is the only rate we hold, prorated by existence.
        const monthlyUsd = Number(vm.package_cost_usd) || 0;
        cost.other = monthlyUsd * (h.existHours / hoursInMonth);
        assumptions.push('gpu_priced_from_package');
      } else {
        const ocpuRate = rates.ocpuHourUsd[family] ?? rates.ocpuHourUsd.E5;
        const memRate = rates.memoryGbHourUsd[family] ?? rates.memoryGbHourUsd.E5;
        cost.cpu = billedOcpus * ocpuRate * h.runningHours;
        cost.ram = memoryGb * memRate * h.runningHours;
        cost.windows = isWindows ? ocpus * rates.windowsLicenseOcpuHourUsd * h.runningHours : 0;
      }
      cost.storage =
        bootGb * (rates.blockGbMonthUsd + vpusPerGb * rates.blockVpuGbMonthUsd) * (h.existHours / hoursInMonth);
      cost.egress = egress.gb * rates.egressGbUsd;

      const keys: CostComponentKey[] = ['cpu', 'ram', 'storage', 'egress', 'windows', 'other'];
      cost.listUsd = keys.reduce((s, k) => s + cost[k], 0);
      cost.netUsd = keys.reduce((s, k) => s + cost[k] * (1 - rates.discountPct[k] / 100), 0);
      cost.netVnd = Math.round(cost.netUsd * rates.usdToVnd);
      for (const k of keys) cost[k] = this.round(cost[k]);
      cost.listUsd = this.round(cost.listUsd);
      cost.netUsd = this.round(cost.netUsd);

      const paidInMonthVnd = vm.subscription_id ? paidBySub.get(vm.subscription_id) || 0 : 0;
      const name = [vm.first_name, vm.last_name].filter(Boolean).join(' ') || null;

      rows.push({
        vmId: vm.id,
        instanceId: vm.instance_id,
        instanceName: vm.instance_name,
        shape: vm.shape,
        shapeFamily: family,
        lifecycleState: vm.lifecycle_state,
        compartmentId: vm.compartment_id,
        createdAt: new Date(vm.created_at).toISOString(),
        terminatedAt: vm.terminated_at ? new Date(vm.terminated_at).toISOString() : null,
        user: { id: vm.user_id ?? null, email: vm.email ?? null, name, company: vm.company ?? null },
        subscription: {
          id: vm.subscription_id ?? null,
          status: vm.sub_status ?? null,
          osType: isWindows ? 'windows' : 'linux',
          startDate: vm.sub_start_date ? new Date(vm.sub_start_date).toISOString() : null,
          endDate: vm.sub_end_date ? new Date(vm.sub_end_date).toISOString() : null,
          packageId: vm.cloud_package_id ?? null,
          packageName: vm.package_name ?? null,
          packageMonthlyVnd: vm.package_cost_vnd != null ? Math.round(Number(vm.package_cost_vnd)) : null,
        },
        period: {
          from: h.from.toISOString(),
          to: h.to.toISOString(),
          existHours: this.round(h.existHours, 2),
          runningHours: this.round(h.runningHours, 2),
          stoppedHours: this.round(h.existHours - h.runningHours, 2),
          coveragePct: this.round((h.existHours / hoursInMonth) * 100, 1),
          runningPct: this.round((h.runningHours / hoursInMonth) * 100, 1),
        },
        spec: {
          ocpus,
          billedOcpus: this.round(billedOcpus, 3),
          baseline: vm.baseline_ocpu_utilization ?? null,
          baselineFraction,
          memoryGb,
          bootVolumeGb: bootGb,
          vpusPerGb,
          source: specSource,
        },
        egress: { gb: this.round(egress.gb, 3), dataSource: egress.dataSource },
        cost,
        revenue: { paidInMonthVnd: Math.round(paidInMonthVnd) },
        marginVnd: Math.round(paidInMonthVnd - cost.netVnd),
        assumptions,
      });
    }

    rows.sort((a, b) => b.cost.netUsd - a.cost.netUsd);

    // ── Summary ────────────────────────────────────────────────────────────
    const keys: CostComponentKey[] = ['cpu', 'ram', 'storage', 'egress', 'windows', 'other'];
    const listByKey: Record<CostComponentKey, number> = { cpu: 0, ram: 0, storage: 0, egress: 0, windows: 0, other: 0 };
    for (const r of rows) for (const k of keys) listByKey[k] += r.cost[k];

    // Egress: free quota (if any) applies per tenancy, so it is netted at the
    // summary level; deleted VMs' egress (no vm_instances row) is added here too.
    const attributedGb = rows.reduce((s, r) => s + r.egress.gb, 0);
    const totalGb = attributedGb + unattributedEgressGb;
    const billableGb = Math.max(0, totalGb - rates.egressFreeGbPerMonth);
    listByKey.egress = billableGb * rates.egressGbUsd;

    const components = {} as Record<CostComponentKey | 'total', ComponentAmount>;
    let totalList = 0;
    let totalNet = 0;
    for (const k of keys) {
      components[k] = this.componentAmount(listByKey[k], rates.discountPct[k], rates.usdToVnd);
      totalList += listByKey[k];
      totalNet += listByKey[k] * (1 - rates.discountPct[k] / 100);
    }
    components.total = {
      listUsd: this.round(totalList),
      discountPct: totalList > 0 ? this.round((1 - totalNet / totalList) * 100, 2) : 0,
      netUsd: this.round(totalNet),
      netVnd: Math.round(totalNet * rates.usdToVnd),
    };

    const attributedVnd = rows.reduce((s, r) => s + r.revenue.paidInMonthVnd, 0);
    const marginVnd = Math.round(totalCollectedVnd - components.total.netVnd);

    const byUserMap = new Map<string, OciCostMonthlyReport['byUser'][number]>();
    const byPkgMap = new Map<string, OciCostMonthlyReport['byPackage'][number]>();
    for (const r of rows) {
      const uk = String(r.user.id ?? 'none');
      const u = byUserMap.get(uk) || {
        userId: r.user.id, email: r.user.email, name: r.user.name, company: r.user.company,
        vmCount: 0, netUsd: 0, netVnd: 0, paidVnd: 0, marginVnd: 0,
      };
      u.vmCount++; u.netUsd += r.cost.netUsd; u.netVnd += r.cost.netVnd; u.paidVnd += r.revenue.paidInMonthVnd;
      u.marginVnd = u.paidVnd - u.netVnd;
      byUserMap.set(uk, u);

      const pk = String(r.subscription.packageId ?? 'none');
      const p = byPkgMap.get(pk) || {
        packageId: r.subscription.packageId, packageName: r.subscription.packageName,
        vmCount: 0, netUsd: 0, netVnd: 0, paidVnd: 0, marginVnd: 0,
      };
      p.vmCount++; p.netUsd += r.cost.netUsd; p.netVnd += r.cost.netVnd; p.paidVnd += r.revenue.paidInMonthVnd;
      p.marginVnd = p.paidVnd - p.netVnd;
      byPkgMap.set(pk, p);
    }
    const fin = <T extends { netUsd: number }>(x: T): T => ({ ...x, netUsd: this.round(x.netUsd) });

    return {
      month: yearMonth,
      generatedAt: now.toISOString(),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hoursInMonth,
        hoursElapsed: this.round(hoursElapsed, 2),
        isCurrentMonth: end > now,
      },
      rates,
      summary: {
        vmCount: rows.length,
        runningVmCount: rows.filter((r) => r.lifecycleState === 'RUNNING').length,
        terminatedInMonthCount: rows.filter((r) => r.terminatedAt && new Date(r.terminatedAt) >= start).length,
        windowsVmCount: rows.filter((r) => r.subscription.osType === 'windows').length,
        components,
        egress: {
          totalGb: this.round(totalGb, 3),
          attributedGb: this.round(attributedGb, 3),
          unattributedGb: this.round(unattributedEgressGb, 3),
          freeGb: rates.egressFreeGbPerMonth,
          billableGb: this.round(billableGb, 3),
        },
        revenue: {
          attributedVnd: Math.round(attributedVnd),
          totalCollectedVnd: Math.round(totalCollectedVnd),
          unattributedVnd: Math.round(totalCollectedVnd - attributedVnd),
        },
        marginVnd,
        marginPct: totalCollectedVnd > 0 ? this.round((marginVnd / totalCollectedVnd) * 100, 2) : null,
      },
      rows,
      byUser: Array.from(byUserMap.values()).map(fin).sort((a, b) => b.netVnd - a.netVnd),
      byPackage: Array.from(byPkgMap.values()).map(fin).sort((a, b) => b.netVnd - a.netVnd),
      warnings,
    };
  }
}
