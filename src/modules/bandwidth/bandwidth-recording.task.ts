import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BandwidthService } from './bandwidth.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VmInstance } from '../../entities/vm-instance.entity';

/**
 * Bandwidth Recording Task
 * Periodically records bandwidth usage for all VMs to maintain historical data
 * This allows accurate bandwidth tracking even for deleted/terminated VMs
 * 
 * NOTE: Only ONE cron job should record bandwidth to avoid duplicates
 */
@Injectable()
export class BandwidthRecordingTask {
  private readonly logger = new Logger(BandwidthRecordingTask.name);

  constructor(
    @InjectRepository(VmInstance) private vmInstanceRepository: Repository<VmInstance>,
    private readonly bandwidthService: BandwidthService,
  ) {}

  /**
   * Record bandwidth every 6 hours
   * This stores bandwidth metrics to the database for historical tracking
   * Runs at: 00:00, 06:00, 12:00, 18:00 daily
   */
  @Cron('0 0 */6 * * *') // Every 6 hours at :00 minutes :00 seconds
  async recordBandwidth() {
    try {
      this.logger.log('Starting 6-hour bandwidth recording task...');
      
      // Get all VMs (including active and deleted ones)
      const vms = await this.vmInstanceRepository.find();
      
      if (!vms || vms.length === 0) {
        this.logger.log('No VMs found for bandwidth recording');
        return;
      }

      this.logger.log(`Recording bandwidth for ${vms.length} VMs`);

      // Get last 6 hours of data
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 6 * 60 * 60 * 1000); // 6 hours ago

      let successCount = 0;
      let errorCount = 0;

      // Record bandwidth for each VM
      for (const vm of vms) {
        try {
          const bandwidthData = await this.bandwidthService['calculateVmBandwidth'](
            vm.instance_id,
            startTime,
            endTime,
          );

          // Only record if there's actual bandwidth usage OR it's a new VM
          if (bandwidthData.totalBytes > 0) {
            await this.bandwidthService['recordVmBandwidth'](vm.id, vm, bandwidthData);
            successCount++;
          } else {
            // Record zero bandwidth for new/inactive VMs for tracking purposes
            await this.bandwidthService['recordVmBandwidth'](vm.id, vm, bandwidthData);
            successCount++;
          }
        } catch (error) {
          this.logger.warn(`Failed to record bandwidth for VM ${vm.instance_id}: ${error.message}`);
          errorCount++;
        }
      }

      this.logger.log(`Completed 6-hour bandwidth recording: ${successCount} success, ${errorCount} errors`);
    } catch (error) {
      this.logger.error('Error in recordBandwidth:', error);
    }
  }

  /**
   * DISABLED: Hourly recording (replaced by 6-hour recording to avoid duplicates)
   * Previously caused duplicate logs when both hourly and 6-hour jobs ran at same time
   * 
   * If you need hourly recording, REMOVE the 6-hour cron job above
   */
  // @Cron(CronExpression.EVERY_HOUR)
  // async recordBandwidthHourly() {
  //   // ... hourly logic ...
  // }
}
