import {
  Controller,
  Get,
  UseGuards,
  Logger,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BandwidthService } from './bandwidth.service';

@Controller('bandwidth')
@UseGuards(JwtAuthGuard)
export class BandwidthController {
  private readonly logger = new Logger(BandwidthController.name);

  constructor(private readonly bandwidthService: BandwidthService) {}

  /**
   * GET /bandwidth/all-vms
   * Get bandwidth usage for all VMs including deleted/terminated machines
   * 
   * Data includes:
   * - Current active VMs: OCI metrics + historical logs
   * - Deleted/Terminated VMs: Historical logs only
   * - Combines both sources for comprehensive bandwidth report
   */
  @Get('all-vms')
  @HttpCode(HttpStatus.OK)
  async getAllVmsBandwidth(
    @Query('timeRange') timeRange: string = '30d',
  ) {
    try {
      this.logger.log(`Fetching bandwidth data for all VMs with timeRange: ${timeRange}`);
      const data = await this.bandwidthService.getAllVmsBandwidthUsage(timeRange);
      this.logger.log(`Successfully fetched bandwidth data. VMs: ${data.vms.length}`);
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error('Error fetching all VMs bandwidth:', error);
      return {
        success: false,
        error: error.message,
        data: {
          summary: {
            totalVMs: 0,
            overLimitVMs: 0,
            nearLimitVMs: 0,
            totalBandwidthUsedTB: 0,
            averageUsagePercentage: 0,
          },
          vms: [],
        },
      };
    }
  }

  /**
   * GET /bandwidth/vm/:instanceId
   * Get bandwidth usage for a specific VM
   */
  @Get('vm/:instanceId')
  @HttpCode(HttpStatus.OK)
  async getVmBandwidth(
    @Query('instanceId') instanceId: string,
    @Query('timeRange') timeRange: string = '7d',
  ) {
    try {
      this.logger.log(`Fetching bandwidth data for VM ${instanceId} with timeRange: ${timeRange}`);
      const data = await this.bandwidthService.getVmBandwidthUsage(instanceId, timeRange);
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      this.logger.error(`Error fetching bandwidth for VM ${instanceId}:`, error);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  }
}
