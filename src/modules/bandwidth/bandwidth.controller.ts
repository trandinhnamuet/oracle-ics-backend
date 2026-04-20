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
import { AdminGuard } from '../../auth/admin.guard';
import { BandwidthService } from './bandwidth.service';

@Controller('bandwidth')
@UseGuards(JwtAuthGuard, AdminGuard)
export class BandwidthController {
  private readonly logger = new Logger(BandwidthController.name);

  constructor(private readonly bandwidthService: BandwidthService) {}

  /**
   * GET /bandwidth/all-vms?month=2026-03
   *
   * Returns bandwidth usage for ALL VMs for a given calendar month.
   * month format: "YYYY-MM"  (defaults to current month)
   *
   * Data source per VM:
   *  - "oci"      : queried live from OCI oci_vcn.VnicBytesOut (within 90-day retention)
   *  - "archived" : read from bandwidth_monthly_snapshots DB table (older than 90 days)
   *  - "none"     : no data available
   */
  @Get('all-vms')
  @HttpCode(HttpStatus.OK)
  async getAllVmsBandwidth(@Query('month') month?: string) {
    const yearMonth = month || this.bandwidthService.currentYearMonth();
    try {
      this.logger.log(`Fetching bandwidth — month: ${yearMonth}`);
      const data =
        await this.bandwidthService.getAllVmsBandwidthUsage(yearMonth);
      this.logger.log(`Done. VMs: ${data.vms.length}`);
      return { success: true, data };
    } catch (error) {
      this.logger.error('Error fetching bandwidth:', error);
      return {
        success: false,
        error: error.message,
        data: {
          summary: {
            totalVMs: 0,
            overLimitVMs: 0,
            nearLimitVMs: 0,
            totalEgressTB: 0,
            averageUsagePercentage: 0,
          },
          vms: [],
          month: yearMonth,
        },
      };
    }
  }
}
