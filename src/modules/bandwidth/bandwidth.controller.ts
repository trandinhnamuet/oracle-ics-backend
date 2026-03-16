import {
  Controller,
  Get,
  UseGuards,
  Logger,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BandwidthService } from './bandwidth.service';
import { OciService } from '../oci/oci.service';

@Controller('bandwidth')
@UseGuards(JwtAuthGuard)
export class BandwidthController {
  private readonly logger = new Logger(BandwidthController.name);

  constructor(
    private readonly bandwidthService: BandwidthService,
    private readonly ociService: OciService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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

  /**
   * Lightweight debug endpoint for testing a single VM's VNIC metrics.
   * GET /bandwidth/test-vnic?instanceId=ocid1.instance...&month=YYYY-MM
   */
  @Get('test-vnic')
  @HttpCode(HttpStatus.OK)
  async testVnic(
    @Query('instanceId') instanceId?: string,
    @Query('month') month?: string,
  ) {
    const yearMonth = month || this.bandwidthService.currentYearMonth();
    if (!instanceId) {
      return { success: false, error: 'instanceId query param is required' };
    }

    // Fetch VM row
    const rows = await this.dataSource.query(
      `SELECT id, instance_id, vnic_id, compartment_id, created_at FROM oracle.vm_instances WHERE instance_id = $1 LIMIT 1`,
      [instanceId],
    );
    if (!rows || rows.length === 0) {
      return { success: false, error: 'VM not found' };
    }
    const vm = rows[0];

    // compute month range
    const [y, m] = yearMonth.split('-').map(Number);
    const startTime = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const lastDay = new Date(y, m, 0).getDate();
    const endTime = new Date(y, m - 1, lastDay, 23, 59, 59, 999);

    // Ensure VNIC cached
    let vnicId = vm.vnic_id;
    if (!vnicId) {
      try {
        vnicId = await this.bandwidthService.ensureVnicIdCached(vm);
      } catch (err) {
        this.logger.warn(`ensureVnicIdCached failed: ${err?.message}`);
      }
    }

    // Query OCI metrics (egress + ingress)
    let egressBytes = 0;
    let ingressBytes = 0;
    let ociError = null;
    if (vnicId) {
      try {
        egressBytes = await this.ociService.getVnicEgressBytes(vnicId, vm.compartment_id, startTime, endTime);
        ingressBytes = await this.ociService.getVnicIngressBytes(vnicId, vm.compartment_id, startTime, endTime);
      } catch (err) {
        ociError = err?.message || String(err);
      }
    }

    const egressTB = parseFloat((egressBytes / 1024 ** 4).toFixed(6));
    const ingressTB = parseFloat((ingressBytes / 1024 ** 4).toFixed(6));

    const logDir = path.join(process.cwd(), 'logs');
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'bandwidth-debug.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(
        logFile,
        `[${ts}] test-vnic instance=${instanceId} vnic=${vnicId} month=${yearMonth} egress=${egressBytes}B ingress=${ingressBytes}B egressTB=${egressTB}TB ingressTB=${ingressTB}TB error=${ociError}\n`,
        'utf8',
      );
    } catch (_) {
      // ignore logging errors
    }

    this.logger.log(`test-vnic: instance=${instanceId} vnic=${vnicId} egress=${egressBytes}B ingress=${ingressBytes}B`);

    return {
      success: true,
      data: {
        instanceId,
        vnicId,
        month: yearMonth,
        egressBytes,
        ingressBytes,
        egressTB,
        ingressTB,
        ociError,
      },
    };
  }
}
