import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OciService } from '../oci/oci.service';
import { BandwidthLog } from '../../entities/bandwidth-log.entity';
import { VmInstance } from '../../entities/vm-instance.entity';

// 10TB limit in bytes
const BANDWIDTH_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 * 1024; // 10TB
const BANDWIDTH_LIMIT_TB = 10;

@Injectable()
export class BandwidthService {
  private readonly logger = new Logger(BandwidthService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    @InjectRepository(BandwidthLog) private bandwidthLogRepository: Repository<BandwidthLog>,
    @InjectRepository(VmInstance) private vmInstanceRepository: Repository<VmInstance>,
    private readonly ociService: OciService,
  ) {}

  /**
   * Get bandwidth usage for all VMs including deleted/past machines
   * Logic: 
   * - Get all VMs that ever existed (created_at <= endTime)
   * - For active VMs: Get current metrics from OCI + historical logs
   * - For deleted/terminated VMs: Get bandwidth from historical logs
   * - Combine both sources for comprehensive bandwidth report
   */
  async getAllVmsBandwidthUsage(timeRange: string = '30d') {
    try {
      // Calculate time range first to filter VMs that existed during this period
      const { startTime, endTime } = this.getTimeRange(timeRange);

      // Get all VMs that were created during or before the time range (including deleted ones)
      const vms = await this.dataSource.query(`
        SELECT 
          vi.id,
          vi.instance_id,
          vi.instance_name,
          vi.public_ip,
          vi.lifecycle_state,
          vi.user_id,
          vi.subscription_id,
          vi.created_at as vm_created_at,
          u.email as user_email,
          u.first_name,
          u.last_name,
          s.status as subscription_status,
          cp.name as package_name
        FROM oracle.vm_instances vi
        LEFT JOIN oracle.users u ON vi.user_id = u.id
        LEFT JOIN oracle.subscriptions s ON vi.subscription_id = s.id
        LEFT JOIN oracle.cloud_packages cp ON s.cloud_package_id = cp.id
        WHERE vi.instance_id IS NOT NULL
          AND vi.created_at <= $1
        ORDER BY vi.created_at DESC
      `, [endTime]);

      this.logger.log(`Found ${vms.length} VMs created by ${endTime.toISOString()} for bandwidth check`);

      if (vms.length === 0) {
        this.logger.warn('No VMs found in database for the given time range. Returning empty result.');
        return {
          summary: {
            totalVMs: 0,
            overLimitVMs: 0,
            nearLimitVMs: 0,
            totalBandwidthUsedTB: 0,
            averageUsagePercentage: 0,
          },
          vms: [],
        };
      }

      // Get bandwidth usage for each VM from both current OCI metrics and historical logs
      const vmsBandwidthData = await Promise.all(
        vms.map(async (vm) => {
          try {
            // Get combined bandwidth data from OCI (if active) and historical logs (if deleted or always)
            const bandwidthData = await this.calculateVmBandwidthWithHistory(
              vm,
              startTime,
              endTime,
            );

            const totalBandwidthTB = bandwidthData.totalBytes / (1024 * 1024 * 1024 * 1024);
            const usagePercentage = (totalBandwidthTB / BANDWIDTH_LIMIT_TB) * 100;
            const remainingTB = BANDWIDTH_LIMIT_TB - totalBandwidthTB;
            const exceededTB = totalBandwidthTB > BANDWIDTH_LIMIT_TB ? totalBandwidthTB - BANDWIDTH_LIMIT_TB : 0;

            return {
              vmId: vm.id,
              instanceId: vm.instance_id,
              instanceName: vm.instance_name,
              publicIp: vm.public_ip,
              lifecycleState: vm.lifecycle_state,
              userId: vm.user_id,
              userEmail: vm.user_email,
              userName: vm.first_name && vm.last_name ? `${vm.first_name} ${vm.last_name}` : vm.user_email,
              companyName: vm.company_name,
              subscriptionId: vm.subscription_id,
              subscriptionStatus: vm.subscription_status,
              packageName: vm.package_name,
              vmCreatedAt: vm.vm_created_at,
              isDeleted: vm.lifecycle_state === 'TERMINATED' || vm.lifecycle_state === 'TERMINATING',
              bandwidth: {
                bytesIn: bandwidthData.bytesIn,
                bytesOut: bandwidthData.bytesOut,
                totalBytes: bandwidthData.totalBytes,
                totalTB: parseFloat(totalBandwidthTB.toFixed(4)),
                usagePercentage: parseFloat(usagePercentage.toFixed(2)),
                remainingTB: parseFloat(remainingTB.toFixed(4)),
                exceededTB: parseFloat(exceededTB.toFixed(4)),
                limitTB: BANDWIDTH_LIMIT_TB,
                isOverLimit: totalBandwidthTB > BANDWIDTH_LIMIT_TB,
                isNearLimit: usagePercentage >= 80 && usagePercentage < 100, // Warning at 80%
                dataSource: bandwidthData.dataSource, // 'oci', 'history', or 'combined'
              },
              timeRange: {
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                range: timeRange,
              },
            };
          } catch (error) {
            this.logger.error(`Error getting bandwidth for VM ${vm.instance_id}:`, error.message);
            return {
              vmId: vm.id,
              instanceId: vm.instance_id,
              instanceName: vm.instance_name,
              publicIp: vm.public_ip,
              lifecycleState: vm.lifecycle_state,
              userId: vm.user_id,
              userEmail: vm.user_email,
              userName: vm.first_name && vm.last_name ? `${vm.first_name} ${vm.last_name}` : vm.user_email,
              companyName: vm.company_name,
              subscriptionId: vm.subscription_id,
              subscriptionStatus: vm.subscription_status,
              packageName: vm.package_name,
              vmCreatedAt: vm.vm_created_at,
              isDeleted: vm.lifecycle_state === 'TERMINATED' || vm.lifecycle_state === 'TERMINATING',
              bandwidth: {
                error: error.message,
                totalTB: 0,
                usagePercentage: 0,
                isOverLimit: false,
                isNearLimit: false,
                dataSource: 'error',
              },
              timeRange: {
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                range: timeRange,
              },
            };
          }
        }),
      );

      // Sort by usage percentage (highest first)
      vmsBandwidthData.sort((a, b) => {
        const aPercentage = a.bandwidth.usagePercentage || 0;
        const bPercentage = b.bandwidth.usagePercentage || 0;
        return bPercentage - aPercentage;
      });

      // Calculate summary statistics
      const summary = {
        totalVMs: vmsBandwidthData.length,
        overLimitVMs: vmsBandwidthData.filter(vm => vm.bandwidth.isOverLimit).length,
        nearLimitVMs: vmsBandwidthData.filter(vm => vm.bandwidth.isNearLimit).length,
        totalBandwidthUsedTB: parseFloat(
          vmsBandwidthData.reduce((sum, vm) => sum + (vm.bandwidth.totalTB || 0), 0).toFixed(4)
        ),
        averageUsagePercentage: parseFloat(
          (vmsBandwidthData.reduce((sum, vm) => sum + (vm.bandwidth.usagePercentage || 0), 0) / vmsBandwidthData.length || 0).toFixed(2)
        ),
        deletedVMCount: vmsBandwidthData.filter(vm => vm.isDeleted).length,
      };

      return {
        summary,
        vms: vmsBandwidthData,
      };
    } catch (error) {
      this.logger.error('Error in getAllVmsBandwidthUsage:', error);
      throw error;
    }
  }

  /**
   * Get bandwidth usage for a specific VM
   */
  async getVmBandwidthUsage(instanceId: string, timeRange: string = '7d') {
    try {
      const { startTime, endTime } = this.getTimeRange(timeRange);
      const bandwidthData = await this.calculateVmBandwidth(instanceId, startTime, endTime);

      const totalBandwidthTB = bandwidthData.totalBytes / (1024 * 1024 * 1024 * 1024);
      const usagePercentage = (totalBandwidthTB / BANDWIDTH_LIMIT_TB) * 100;
      const remainingTB = BANDWIDTH_LIMIT_TB - totalBandwidthTB;
      const exceededTB = totalBandwidthTB > BANDWIDTH_LIMIT_TB ? totalBandwidthTB - BANDWIDTH_LIMIT_TB : 0;

      return {
        instanceId,
        bandwidth: {
          bytesIn: bandwidthData.bytesIn,
          bytesOut: bandwidthData.bytesOut,
          totalBytes: bandwidthData.totalBytes,
          totalTB: parseFloat(totalBandwidthTB.toFixed(4)),
          usagePercentage: parseFloat(usagePercentage.toFixed(2)),
          remainingTB: parseFloat(remainingTB.toFixed(4)),
          exceededTB: parseFloat(exceededTB.toFixed(4)),
          limitTB: BANDWIDTH_LIMIT_TB,
          isOverLimit: totalBandwidthTB > BANDWIDTH_LIMIT_TB,
          isNearLimit: usagePercentage >= 80 && usagePercentage < 100,
        },
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          range: timeRange,
        },
      };
    } catch (error) {
      this.logger.error(`Error in getVmBandwidthUsage for ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate bandwidth for a VM from both OCI metrics and historical logs
   * For active VMs: combines current OCI metrics with historical logs
   * For deleted/terminated VMs: retrieves from historical logs only
   */
  private async calculateVmBandwidthWithHistory(
    vm: any,
    startTime: Date,
    endTime: Date,
  ): Promise<{ 
    bytesIn: number; 
    bytesOut: number; 
    totalBytes: number;
    dataSource: 'oci' | 'history' | 'combined' | 'none';
  }> {
    try {
      const isDeleted = vm.lifecycle_state === 'TERMINATED' || vm.lifecycle_state === 'TERMINATING';
      
      let ociData = { bytesIn: 0, bytesOut: 0, totalBytes: 0 };
      let historyData = { bytesIn: 0, bytesOut: 0, totalBytes: 0 };
      let dataSource: 'oci' | 'history' | 'combined' | 'none' = 'none';

      // Try to get OCI metrics for active VMs
      if (!isDeleted) {
        try {
          ociData = await this.calculateVmBandwidth(vm.instance_id, startTime, endTime);
          dataSource = 'oci';
          this.logger.log(`Fetched OCI metrics for active VM ${vm.instance_id}`);
        } catch (error) {
          this.logger.warn(`Could not fetch OCI metrics for VM ${vm.instance_id}: ${error.message}`);
        }
      }

      // Get historical data from database
      try {
        historyData = await this.getVmBandwidthHistory(vm.id, startTime, endTime);
        if (historyData.totalBytes > 0) {
          if (dataSource === 'oci') {
            // Combine OCI and history data
            dataSource = 'combined';
            // Add history to OCI data (for comprehensive tracking)
            ociData.bytesIn += historyData.bytesIn;
            ociData.bytesOut += historyData.bytesOut;
            ociData.totalBytes += historyData.totalBytes;
          } else {
            // Use history data only
            dataSource = 'history';
            ociData = historyData;
          }
          this.logger.log(`Fetched historical bandwidth for VM ${vm.instance_id}`);
        }
      } catch (error) {
        this.logger.warn(`Could not fetch historical data for VM ${vm.instance_id}: ${error.message}`);
      }

      return {
        bytesIn: ociData.bytesIn,
        bytesOut: ociData.bytesOut,
        totalBytes: ociData.totalBytes,
        dataSource,
      };
    } catch (error) {
      this.logger.error(`Error in calculateVmBandwidthWithHistory for VM ${vm.instance_id}:`, error);
      return {
        bytesIn: 0,
        bytesOut: 0,
        totalBytes: 0,
        dataSource: 'none',
      };
    }
  }

  /**
   * Get historical bandwidth data from database for a VM
   */
  private async getVmBandwidthHistory(
    vmId: number,
    startTime: Date,
    endTime: Date,
  ): Promise<{ bytesIn: number; bytesOut: number; totalBytes: number }> {
    try {
      const historicalLogs = await this.dataSource.query(`
        SELECT 
          SUM(CAST(bytes_in AS BIGINT)) as total_bytes_in,
          SUM(CAST(bytes_out AS BIGINT)) as total_bytes_out,
          SUM(CAST(total_bytes AS BIGINT)) as total_bytes
        FROM oracle.bandwidth_logs
        WHERE vm_instance_id = $1
          AND recorded_at >= $2
          AND recorded_at <= $3
      `, [vmId, startTime, endTime]);

      if (historicalLogs && historicalLogs.length > 0 && historicalLogs[0].total_bytes_in) {
        return {
          bytesIn: parseInt(historicalLogs[0].total_bytes_in) || 0,
          bytesOut: parseInt(historicalLogs[0].total_bytes_out) || 0,
          totalBytes: parseInt(historicalLogs[0].total_bytes) || 0,
        };
      }

      return { bytesIn: 0, bytesOut: 0, totalBytes: 0 };
    } catch (error) {
      this.logger.error(`Error fetching bandwidth history for VM ${vmId}:`, error);
      return { bytesIn: 0, bytesOut: 0, totalBytes: 0 };
    }
  }

  /**
   * Record bandwidth data to history log
   * Called periodically to track bandwidth usage over time
   * Includes deduplication check to prevent duplicate entries
   */
  async recordVmBandwidth(
    vmId: number,
    vm: any,
    bandwidthData: { bytesIn: number; bytesOut: number; totalBytes: number },
  ): Promise<void> {
    try {
      // Check for recent duplicate entries (within last 5 minutes)
      // This prevents duplicate logging from multiple cron jobs
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentLog = await this.bandwidthLogRepository
        .createQueryBuilder('log')
        .where('log.vm_instance_id = :vmId', { vmId })
        .andWhere('log.recorded_at >= :fiveMinutesAgo', { fiveMinutesAgo })
        .andWhere('log.total_bytes = :totalBytes', { totalBytes: bandwidthData.totalBytes })
        .getOne();

      if (recentLog) {
        this.logger.warn(
          `Skipping duplicate bandwidth log for VM ${vm.instance_id} ` +
          `(recent log exists at ${recentLog.recorded_at.toISOString()})`
        );
        return;
      }

      // Create new bandwidth log entry
      const bandwidthLog = this.bandwidthLogRepository.create({
        vm_instance_id: vmId,
        user_id: vm.user_id,
        subscription_id: vm.subscription_id,
        instance_id: vm.instance_id,
        instance_name: vm.instance_name,
        lifecycle_state: vm.lifecycle_state,
        bytes_in: bandwidthData.bytesIn,
        bytes_out: bandwidthData.bytesOut,
        total_bytes: bandwidthData.totalBytes,
        recorded_at: new Date(),
      });

      await this.bandwidthLogRepository.save(bandwidthLog);
      this.logger.log(`Recorded bandwidth for VM ${vm.instance_id}: ${bandwidthData.totalBytes} bytes`);
    } catch (error) {
      this.logger.error(`Error recording bandwidth for VM ${vmId}:`, error);
    }
  }

  /**
   * Calculate bandwidth for a VM instance based on OCI metrics only
   * If VM is deleted/no longer exists in OCI, returns 0 bytes gracefully
   */
  private async calculateVmBandwidth(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{ bytesIn: number; bytesOut: number; totalBytes: number }> {
    try {
      // Get network metrics from OCI for the specified time range
      const [networkIn, networkOut] = await Promise.all([
        this.ociService.getNetworkBytesIn(instanceId, startTime, endTime),
        this.ociService.getNetworkBytesOut(instanceId, startTime, endTime),
      ]);

      // Sum up all data points from OCI metrics

      let totalBytesIn = 0;
      let totalBytesOut = 0;

      // Process network in metrics
      if (networkIn && networkIn.length > 0) {
        for (const metric of networkIn) {
          if (metric.aggregatedDatapoints) {
            for (const datapoint of metric.aggregatedDatapoints) {
              totalBytesIn += datapoint.value || 0;
            }
          }
        }
      }

      // Process network out metrics
      if (networkOut && networkOut.length > 0) {
        for (const metric of networkOut) {
          if (metric.aggregatedDatapoints) {
            for (const datapoint of metric.aggregatedDatapoints) {
              totalBytesOut += datapoint.value || 0;
            }
          }
        }
      }

      const totalBytes = totalBytesIn + totalBytesOut;

      this.logger.log(`Bandwidth for VM ${instanceId}: In=${totalBytesIn}, Out=${totalBytesOut}, Total=${totalBytes}`);

      return {
        bytesIn: totalBytesIn,
        bytesOut: totalBytesOut,
        totalBytes,
      };
    } catch (error) {
      // Gracefully handle errors (e.g., deleted VMs, authorization issues)
      // Return 0 bytes instead of crashing to allow other VMs to be processed
      // This could indicate: VM deleted, no metrics data, or OCI authorization issue
      if (error.statusCode === 404 || error.message?.includes('NotFound')) {
        this.logger.warn(`VM ${instanceId} not found or deleted - returning 0 bandwidth`);
      } else {
        this.logger.warn(`Could not fetch OCI metrics for VM ${instanceId}: ${error.message} - returning 0 bandwidth`);
      }
      
      return {
        bytesIn: 0,
        bytesOut: 0,
        totalBytes: 0,
      };
    }
  }

  /**
   * Get time range based on string input
   */
  private getTimeRange(timeRange: string): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    const startTime = new Date();

    switch (timeRange) {
      case '1h':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case '6h':
        startTime.setHours(startTime.getHours() - 6);
        break;
      case '24h':
        startTime.setHours(startTime.getHours() - 24);
        break;
      case '7d':
        startTime.setDate(startTime.getDate() - 7);
        break;
      case '30d':
        startTime.setDate(startTime.getDate() - 30);
        break;
      case '90d':
        startTime.setDate(startTime.getDate() - 90);
        break;
      default:
        startTime.setDate(startTime.getDate() - 30);
    }

    return { startTime, endTime };
  }
}
