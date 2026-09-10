import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { OciCostService } from './oci-cost.service';

/**
 * Admin-only: what ICS owes Oracle for a calendar month, per VM and per cost
 * component (OCPU, RAM, boot volume, egress, Windows license), set against
 * what customers paid in that month.
 */
@Controller('oci-cost')
@UseGuards(JwtAuthGuard, AdminGuard)
export class OciCostController {
  private readonly logger = new Logger(OciCostController.name);

  constructor(private readonly ociCostService: OciCostService) {}

  /**
   * GET /oci-cost/monthly?month=2026-09[&sync=false][&usdToVnd=26310]
   *
   *  month     "YYYY-MM"; defaults to the current month.
   *  sync      "false" skips the OCI shape/boot-volume refresh for live VMs
   *            (faster; uses the cached values).
   *  usdToVnd  override the FX rate used for VND columns.
   */
  @Get('monthly')
  @HttpCode(HttpStatus.OK)
  async monthly(
    @Query('month') month?: string,
    @Query('sync') sync?: string,
    @Query('usdToVnd') usdToVnd?: string,
  ) {
    const now = new Date();
    const yearMonth =
      month || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const fx = usdToVnd ? parseFloat(usdToVnd) : undefined;
    this.logger.log(`Oracle cost report — month: ${yearMonth}, sync: ${sync !== 'false'}`);
    const data = await this.ociCostService.getMonthlyReport(yearMonth, {
      sync: sync !== 'false',
      usdToVnd: Number.isFinite(fx as number) ? fx : undefined,
    });
    return { success: true, data };
  }

  /** GET /oci-cost/rates — the rate card and discounts currently in effect. */
  @Get('rates')
  @HttpCode(HttpStatus.OK)
  rates() {
    return { success: true, data: this.ociCostService.baseRateCard() };
  }
}
