import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OciService } from '../oci/oci.service';
import { BandwidthSnapshot } from '../../entities/bandwidth-log.entity';
import { VmInstance } from '../../entities/vm-instance.entity';

const BANDWIDTH_LIMIT_TB = 10;
// OCI Monitoring retains raw metrics for 90 days
const OCI_RETENTION_DAYS = 90;

@Injectable()
export class BandwidthService {
  private readonly logger = new Logger(BandwidthService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    @InjectRepository(BandwidthSnapshot)
    private snapshotRepository: Repository<BandwidthSnapshot>,
    @InjectRepository(VmInstance)
    private vmInstanceRepository: Repository<VmInstance>,
    private readonly ociService: OciService,
  ) {}

  // ────────────────────────────────────────
  // Utility helpers
  // ────────────────────────────────────────

  /**
   * Parse "YYYY-MM" to start/end Date objects.
   * endTime is capped to now() for the current (incomplete) month.
   */
  private getMonthRange(yearMonth: string): { startTime: Date; endTime: Date } {
    const [year, month] = yearMonth.split('-').map(Number);
    const startTime = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, month, 0).getDate();
    const endTime = new Date(year, month - 1, lastDay, 23, 59, 59, 999);
    const now = new Date();
    return { startTime, endTime: endTime > now ? now : endTime };
  }

  /** Returns the current month as "YYYY-MM" */
  currentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Check whether a time window falls within OCI Monitoring’s 90-day retention.
   * If endTime is within the last 90 days we can still query OCI directly.
   */
  private isWithinOciRetention(endTime: Date): boolean {
    const cutoff = new Date(
      Date.now() - OCI_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    return endTime > cutoff;
  }

  // ────────────────────────────────────────
  // VNIC caching
  // ────────────────────────────────────────

  /**
   * Ensure the VM has its OCI VNIC ID cached in vm_instances.vnic_id.
   * Lazy-fetches from OCI and persists to DB on first call.
   * Returns the vnic_id or null if unavailable.
   */
  async ensureVnicIdCached(
    vm: { id: number; instance_id: string; compartment_id: string; vnic_id?: string | null },
  ): Promise<string | null> {
    if (vm.vnic_id) return vm.vnic_id;

    try {
      const vnicId = await this.ociService.getVnicIdForInstance(
        vm.instance_id,
        vm.compartment_id,
      );
      if (vnicId) {
        await this.dataSource.query(
          `UPDATE oracle.vm_instances SET vnic_id = $1 WHERE id = $2`,
          [vnicId, vm.id],
        );
        vm.vnic_id = vnicId;
        this.logger.log(`Cached vnic_id for VM ${vm.instance_id}`);
      }
      return vnicId;
    } catch (error) {
      this.logger.warn(
        `Could not fetch vnic_id for VM ${vm.instance_id}: ${error.message}`,
      );
      return null;
    }
  }

  // ────────────────────────────────────────
  // Core bandwidth query
  // ────────────────────────────────────────

  /**
   * Get egress + ingress bytes for a single VM for a given month.
   *
   * Priority:
   *   1. OCI oci_vcn.VnicBytesOut/In with .sum()  ← single source of truth
   *      (used when month is within 90-day OCI retention AND vnic_id is known)
   *   2. DB monthly snapshot  ← fallback for older months or missing VNIC
   *
   * There is NO mixing/adding of OCI + DB data for the same period.
   */
  async getVmMonthlyBandwidth(
    vm: any,
    yearMonth: string,
  ): Promise<{ bytesOut: number; bytesIn: number; dataSource: 'oci' | 'archived' | 'none' }> {
    const { startTime, endTime } = this.getMonthRange(yearMonth);

    // Lazily cache VNIC ID for active VMs
    const isTerminated = ['TERMINATED', 'TERMINATING'].includes(
      vm.lifecycle_state || '',
    );
    if (!isTerminated && !vm.vnic_id) {
      vm.vnic_id = await this.ensureVnicIdCached(vm);
    }

    const canQueryOci =
      this.isWithinOciRetention(endTime) && !!vm.vnic_id;

    if (canQueryOci) {
      try {
        const [bytesOut, bytesIn] = await Promise.all([
          this.ociService.getVnicEgressBytes(
            vm.vnic_id,
            vm.compartment_id,
            startTime,
            endTime,
          ),
          this.ociService.getVnicIngressBytes(
            vm.vnic_id,
            vm.compartment_id,
            startTime,
            endTime,
          ),
        ]);
        this.logger.debug(
          `VM ${vm.instance_id} | ${yearMonth}: egress=${bytesOut} B, ingress=${bytesIn} B`,
        );
        return { bytesOut, bytesIn, dataSource: 'oci' };
      } catch (error) {
        this.logger.warn(
          `OCI query failed for VM ${vm.instance_id}: ${error.message} — checking DB`,
        );
      }
    }

    // Fallback: DB monthly snapshot
    const snapshot = await this.snapshotRepository.findOne({
      where: { instance_id: vm.instance_id, year_month: yearMonth },
    });
    if (snapshot) {
      return {
        bytesOut: Number(snapshot.bytes_out_total),
        bytesIn: Number(snapshot.bytes_in_total),
        dataSource: 'archived',
      };
    }

    return { bytesOut: 0, bytesIn: 0, dataSource: 'none' };
  }

  // ────────────────────────────────────────
  // Public API methods
  // ────────────────────────────────────────

  /**
   * Get bandwidth usage for ALL VMs for a given calendar month.
   * yearMonth format: "YYYY-MM" (e.g. "2026-03").
   */
  async getAllVmsBandwidthUsage(yearMonth: string) {
    const { endTime } = this.getMonthRange(yearMonth);

    // All VMs created in or before the queried month
    const vms = await this.dataSource.query(
      `SELECT
          vi.id,
          vi.instance_id,
          vi.instance_name,
          vi.public_ip,
          vi.lifecycle_state,
          vi.compartment_id,
          vi.vnic_id,
          vi.user_id,
          vi.subscription_id,
          vi.created_at AS vm_created_at,
          u.email      AS user_email,
          u.first_name,
          u.last_name,
          u.company AS company_name,
          s.status     AS subscription_status,
          cp.name      AS package_name
       FROM oracle.vm_instances vi
       LEFT JOIN oracle.users u          ON vi.user_id          = u.id
       LEFT JOIN oracle.subscriptions s  ON vi.subscription_id  = s.id
       LEFT JOIN oracle.cloud_packages cp ON s.cloud_package_id = cp.id
       WHERE vi.instance_id IS NOT NULL
         AND vi.created_at <= $1
       ORDER BY vi.created_at DESC`,
      [endTime],
    );

    this.logger.log(
      `Bandwidth query — month: ${yearMonth}, VMs found: ${vms.length}`,
    );

    if (vms.length === 0) {
      return {
        summary: {
          totalVMs: 0,
          overLimitVMs: 0,
          nearLimitVMs: 0,
          totalEgressTB: 0,
          averageUsagePercentage: 0,
        },
        vms: [],
        month: yearMonth,
      };
    }

    // Xử lý tuần tự (không song song) để tránh OCI rate limit
    // 13 VM × 2 OCI calls = 26 concurrent calls → gây lỗi "Maximum rate exceeded"
    const vmData: any[] = [];
    for (const vm of vms) {
      await new Promise(r => setTimeout(r, 200)); // delay nhỏ giữa mỗi VM
      vmData.push(await (async (vm: any) => {
        try {
          const { bytesOut, bytesIn, dataSource } =
            await this.getVmMonthlyBandwidth(vm, yearMonth);

          const egressTB = bytesOut / 1024 ** 4;
          const usagePercentage = (egressTB / BANDWIDTH_LIMIT_TB) * 100;
          const remainingTB = Math.max(0, BANDWIDTH_LIMIT_TB - egressTB);
          const exceededTB =
            egressTB > BANDWIDTH_LIMIT_TB ? egressTB - BANDWIDTH_LIMIT_TB : 0;

          return {
            vmId: vm.id,
            instanceId: vm.instance_id,
            instanceName: vm.instance_name,
            publicIp: vm.public_ip,
            lifecycleState: vm.lifecycle_state,
            userId: vm.user_id,
            userEmail: vm.user_email,
            userName:
              vm.first_name && vm.last_name
                ? `${vm.first_name} ${vm.last_name}`
                : vm.user_email,
            companyName: vm.company_name,
            subscriptionId: vm.subscription_id,
            subscriptionStatus: vm.subscription_status,
            packageName: vm.package_name,
            vmCreatedAt: vm.vm_created_at,
            bandwidth: {
              bytesOut,
              bytesIn,
              egressTB: parseFloat(egressTB.toFixed(4)),
              ingressTB: parseFloat((bytesIn / 1024 ** 4).toFixed(4)),
              usagePercentage: parseFloat(usagePercentage.toFixed(2)),
              remainingTB: parseFloat(remainingTB.toFixed(4)),
              exceededTB: parseFloat(exceededTB.toFixed(4)),
              limitTB: BANDWIDTH_LIMIT_TB,
              isOverLimit: egressTB > BANDWIDTH_LIMIT_TB,
              isNearLimit:
                usagePercentage >= 80 && usagePercentage < 100,
              dataSource,
            },
            month: yearMonth,
          };
        } catch (error) {
          this.logger.error(
            `Error getting bandwidth for VM ${vm.instance_id}: ${error.message}`,
          );
          return {
            vmId: vm.id,
            instanceId: vm.instance_id,
            instanceName: vm.instance_name,
            publicIp: vm.public_ip,
            lifecycleState: vm.lifecycle_state,
            userId: vm.user_id,
            userEmail: vm.user_email,
            userName:
              vm.first_name && vm.last_name
                ? `${vm.first_name} ${vm.last_name}`
                : vm.user_email,
            companyName: vm.company_name,
            subscriptionId: vm.subscription_id,
            subscriptionStatus: vm.subscription_status,
            packageName: vm.package_name,
            vmCreatedAt: vm.vm_created_at,
            bandwidth: {
              error: error.message,
              bytesOut: 0,
              bytesIn: 0,
              egressTB: 0,
              usagePercentage: 0,
              isOverLimit: false,
              isNearLimit: false,
              dataSource: 'error',
            },
            month: yearMonth,
          };
        }
      })(vm));
    }

    // Sort: highest egress first
    vmData.sort(
      (a, b) =>
        (b.bandwidth.usagePercentage || 0) - (a.bandwidth.usagePercentage || 0),
    );

    const validVms = vmData.filter((v) => !(v.bandwidth as any).error);
    const summary = {
      totalVMs: vmData.length,
      overLimitVMs: vmData.filter((v) => v.bandwidth.isOverLimit).length,
      nearLimitVMs: vmData.filter((v) => v.bandwidth.isNearLimit).length,
      totalEgressTB: parseFloat(
        validVms
          .reduce((s, v) => s + (v.bandwidth.egressTB || 0), 0)
          .toFixed(4),
      ),
      averageUsagePercentage:
        validVms.length > 0
          ? parseFloat(
              (
                validVms.reduce(
                  (s, v) => s + (v.bandwidth.usagePercentage || 0),
                  0,
                ) / validVms.length
              ).toFixed(2),
            )
          : 0,
    };

    return { summary, vms: vmData, month: yearMonth };
  }

  // ────────────────────────────────────────
  // Monthly archiving (called by cron task)
  // ────────────────────────────────────────

  /**
   * Archive one VM’s bandwidth for a completed calendar month.
   * Inserts a single row into bandwidth_monthly_snapshots.
   * Skips if a snapshot already exists for that VM + month.
   */
  async archiveMonthlyBandwidth(vm: any, yearMonth: string): Promise<void> {
    const existing = await this.snapshotRepository.findOne({
      where: { instance_id: vm.instance_id, year_month: yearMonth },
    });
    if (existing) {
      this.logger.debug(
        `Snapshot already exists: VM ${vm.instance_id} / ${yearMonth}`,
      );
      return;
    }

    const vnicId = await this.ensureVnicIdCached(vm);
    if (!vnicId) {
      this.logger.warn(
        `No vnic_id for VM ${vm.instance_id} — skipping archive for ${yearMonth}`,
      );
      return;
    }

    const { startTime, endTime } = this.getMonthRange(yearMonth);
    const [bytesOut, bytesIn] = await Promise.all([
      this.ociService.getVnicEgressBytes(
        vnicId,
        vm.compartment_id,
        startTime,
        endTime,
      ),
      this.ociService.getVnicIngressBytes(
        vnicId,
        vm.compartment_id,
        startTime,
        endTime,
      ),
    ]);

    const snapshot = this.snapshotRepository.create({
      vm_instance_id: vm.id,
      instance_id: vm.instance_id,
      instance_name: vm.instance_name,
      user_id: vm.user_id,
      subscription_id: vm.subscription_id,
      year_month: yearMonth,
      bytes_out_total: bytesOut,
      bytes_in_total: bytesIn,
      data_source: 'oci',
    });

    await this.snapshotRepository.save(snapshot);
    this.logger.log(
      `Archived: VM ${vm.instance_id} / ${yearMonth} | egress=${bytesOut} B, ingress=${bytesIn} B`,
    );
  }
}
