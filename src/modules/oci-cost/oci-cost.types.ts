/**
 * Shapes returned by GET /oci-cost/monthly — the admin's month-end view of what
 * ICS owes Oracle, per VM and per cost component, against what customers paid.
 */

export type CostComponentKey = 'cpu' | 'ram' | 'storage' | 'egress' | 'windows' | 'other';

export interface ComponentAmount {
  /** Oracle list price, USD */
  listUsd: number;
  /** Dealer discount applied to this component, percent (0-100) */
  discountPct: number;
  /** After discount, USD */
  netUsd: number;
  /** After discount, VND at the report's FX rate */
  netVnd: number;
}

export interface OciRateCard {
  /** Per-OCPU-hour USD by shape family (E5, E4, E3, A1, STANDARD3) */
  ocpuHourUsd: Record<string, number>;
  /** Per-GB-hour USD by shape family */
  memoryGbHourUsd: Record<string, number>;
  /** Block volume storage, USD per GB-month */
  blockGbMonthUsd: number;
  /** Block volume performance, USD per VPU per GB-month (Balanced = 10 VPU) */
  blockVpuGbMonthUsd: number;
  /** Default VPUs/GB when the boot volume's tier is unknown */
  defaultVpusPerGb: number;
  /** Outbound data transfer, USD per GB (APAC SKU B93455) */
  egressGbUsd: number;
  /** Free egress per tenancy per month, GB. 0 = dealer bills from the first GB. */
  egressFreeGbPerMonth: number;
  /** Windows Server license, USD per OCPU-hour */
  windowsLicenseOcpuHourUsd: number;
  /** Dealer discounts, percent */
  discountPct: Record<CostComponentKey, number>;
  /** USD→VND used for this report */
  usdToVnd: number;
  /** Where the FX rate came from */
  fxSource: 'query' | 'exchange_rate_table' | 'env' | 'default';
  fxDate?: string;
}

export interface VmCostRow {
  vmId: number;
  instanceId: string;
  instanceName: string;
  shape: string | null;
  shapeFamily: string;
  lifecycleState: string | null;
  compartmentId: string;
  createdAt: string;
  terminatedAt: string | null;
  user: { id: number | null; email: string | null; name: string | null; company: string | null };
  subscription: {
    id: string | null;
    status: string | null;
    osType: 'linux' | 'windows';
    startDate: string | null;
    endDate: string | null;
    packageId: number | null;
    packageName: string | null;
    packageMonthlyVnd: number | null;
  };
  period: {
    from: string;
    to: string;
    /** Hours the instance existed inside the month window (storage billing) */
    existHours: number;
    /** Hours it was in a compute-billable state (OCPU/RAM/Windows billing) */
    runningHours: number;
    stoppedHours: number;
    /** existHours / hours in month, percent */
    coveragePct: number;
    /** runningHours / hours in month, percent */
    runningPct: number;
  };
  spec: {
    ocpus: number;
    /** ocpus × baseline fraction — what Oracle actually bills */
    billedOcpus: number;
    baseline: string | null;
    baselineFraction: number;
    memoryGb: number;
    bootVolumeGb: number;
    vpusPerGb: number;
    /** oci = synced from OCI, launch = cached at launch, package = parsed from cloud_packages */
    source: 'oci' | 'launch' | 'package';
  };
  egress: { gb: number; dataSource: string };
  cost: Record<CostComponentKey, number> & { listUsd: number; netUsd: number; netVnd: number };
  revenue: { paidInMonthVnd: number };
  marginVnd: number;
  assumptions: string[];
}

export interface OciCostMonthlyReport {
  month: string;
  generatedAt: string;
  window: {
    start: string;
    end: string;
    /** Hours in the calendar month (744 for 31 days) */
    hoursInMonth: number;
    /** Hours elapsed so far (== hoursInMonth for a closed month) */
    hoursElapsed: number;
    isCurrentMonth: boolean;
  };
  rates: OciRateCard;
  summary: {
    vmCount: number;
    runningVmCount: number;
    terminatedInMonthCount: number;
    windowsVmCount: number;
    components: Record<CostComponentKey | 'total', ComponentAmount>;
    egress: { totalGb: number; attributedGb: number; unattributedGb: number; freeGb: number; billableGb: number };
    revenue: { attributedVnd: number; totalCollectedVnd: number; unattributedVnd: number };
    marginVnd: number;
    marginPct: number | null;
  };
  rows: VmCostRow[];
  byUser: Array<{
    userId: number | null;
    email: string | null;
    name: string | null;
    company: string | null;
    vmCount: number;
    netUsd: number;
    netVnd: number;
    paidVnd: number;
    marginVnd: number;
  }>;
  byPackage: Array<{
    packageId: number | null;
    packageName: string | null;
    vmCount: number;
    netUsd: number;
    netVnd: number;
    paidVnd: number;
    marginVnd: number;
  }>;
  warnings: string[];
}
