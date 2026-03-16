import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BandwidthService } from './bandwidth.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * BandwidthSnapshotTask
 *
 * Archives the PREVIOUS month’s bandwidth data into bandwidth_monthly_snapshots
 * at 2:00 AM on the 1st of every month.
 *
 * This acts as a long-term archive so that bandwidth data is available even
 * after OCI Monitoring’s 90-day metric retention window expires.
 *
 * Design:
 *  - ONE cron job, runs ONCE per month
 *  - Queries OCI oci_vcn.VnicBytesOut for the completed previous month
 *  - INSERTs one row per VM into bandwidth_monthly_snapshots (skips if exists)
 *  - No incremental writes, no mixing of data sources
 */
@Injectable()
export class BandwidthSnapshotTask {
  private readonly logger = new Logger(BandwidthSnapshotTask.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly bandwidthService: BandwidthService,
  ) {}

  /** Runs at 02:00 on the 1st day of every month */
  @Cron('0 0 2 1 * *')
  async archivePreviousMonth() {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    this.logger.log(`📅 Starting monthly bandwidth archive for ${yearMonth}...`);

    try {
      const vms = await this.dataSource.query(`
        SELECT id, instance_id, instance_name, compartment_id, vnic_id,
               user_id, subscription_id
        FROM oracle.vm_instances
        WHERE instance_id IS NOT NULL
      `);

      this.logger.log(`Archiving ${vms.length} VMs for month ${yearMonth}`);

      let success = 0;
      let skipped = 0;
      let failed = 0;

      for (const vm of vms) {
        try {
          await this.bandwidthService.archiveMonthlyBandwidth(vm, yearMonth);
          success++;
        } catch (error) {
          this.logger.warn(
            `Failed to archive VM ${vm.instance_id}: ${error.message}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `✅ Monthly archive complete for ${yearMonth}: ${success} saved, ${skipped} skipped, ${failed} failed`,
      );
    } catch (error) {
      this.logger.error('Monthly bandwidth archive task failed:', error);
    }
  }
}
