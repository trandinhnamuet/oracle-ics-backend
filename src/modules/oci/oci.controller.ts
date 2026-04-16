import { 
  Controller, 
  Get, 
  Post, 
  Delete,
  Query, 
  Body,
  Param,
  UseGuards, 
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OciService } from './oci.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('oci')
@UseGuards(JwtAuthGuard)
export class OciController {
  private readonly logger = new Logger(OciController.name);

  constructor(private readonly ociService: OciService) {}

  /**
   * GET /oci/images
   * Get list of available compute images (Operating Systems)
   */
  @Get('images')
  async getComputeImages(
    @Query('compartmentId') compartmentId: string,
    @Query('operatingSystem') operatingSystem?: string,
    @Query('shape') shape?: string,
  ) {
    try {
      if (!compartmentId) {
        // If no compartment ID provided, use tenancy ID
        compartmentId = await this.ociService.getTenancyId();
      }

      const images = await this.ociService.listComputeImages(
        compartmentId,
        operatingSystem,
        shape,
      );

      return {
        success: true,
        data: images,
        count: images.length,
      };
    } catch (error) {
      this.logger.error('Error in getComputeImages:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * GET /oci/marketplace-images
   * Get list of marketplace images (Applications)
   */
  @Get('marketplace-images')
  async getMarketplaceImages(@Query('compartmentId') compartmentId?: string) {
    try {
      if (!compartmentId) {
        compartmentId = await this.ociService.getTenancyId();
      }

      const marketplaceImages = await this.ociService.listMarketplaceImages(compartmentId);

      return {
        success: true,
        data: marketplaceImages,
        count: marketplaceImages.length,
      };
    } catch (error) {
      this.logger.error('Error in getMarketplaceImages:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * GET /oci/shapes
   * Get list of available shapes
   */
  @Get('shapes')
  async getShapes(@Query('compartmentId') compartmentId?: string) {
    try {
      if (!compartmentId) {
        compartmentId = await this.ociService.getTenancyId();
      }

      const shapes = await this.ociService.listShapes(compartmentId);

      return {
        success: true,
        data: shapes,
        count: shapes.length,
      };
    } catch (error) {
      this.logger.error('Error in getShapes:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * GET /oci/compartments
   * Get list of compartments (excluding DELETED ones)
   */
  @Get('compartments')
  async getCompartments() {
    try {
      const compartments = await this.ociService.listCompartments();

      // Filter out DELETED compartments only - keep all other states
      const activeCompartments = compartments.filter(
        (comp) => comp.lifecycleState !== 'DELETED'
      );

      return {
        success: true,
        data: activeCompartments,
        count: activeCompartments.length,
      };
    } catch (error) {
      this.logger.error('Error in getCompartments:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * GET /oci/availability-domains
   * Get list of availability domains
   */
  @Get('availability-domains')
  async getAvailabilityDomains(@Query('compartmentId') compartmentId?: string) {
    try {
      if (!compartmentId) {
        compartmentId = await this.ociService.getTenancyId();
      }

      const availabilityDomains = await this.ociService.listAvailabilityDomains(compartmentId);

      return {
        success: true,
        data: availabilityDomains,
        count: availabilityDomains.length,
      };
    } catch (error) {
      this.logger.error('Error in getAvailabilityDomains:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * POST /oci/vcn
   * Create a VCN (Virtual Cloud Network)
   */
  @Post('vcn')
  @HttpCode(HttpStatus.CREATED)
  async createVcn(
    @Body() body: {
      compartmentId: string;
      displayName: string;
      cidrBlock: string;
      dnsLabel?: string;
    },
  ) {
    try {
      const vcn = await this.ociService.createVcn(
        body.compartmentId,
        body.displayName,
        body.cidrBlock,
        body.dnsLabel,
      );

      return {
        success: true,
        data: vcn,
      };
    } catch (error) {
      this.logger.error('Error in createVcn:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /oci/vcn/:vcnId
   * Get VCN details
   */
  @Get('vcn/:vcnId')
  async getVcn(@Param('vcnId') vcnId: string) {
    try {
      const vcn = await this.ociService.getVcn(vcnId);

      return {
        success: true,
        data: vcn,
      };
    } catch (error) {
      this.logger.error('Error in getVcn:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/internet-gateway
   * Create an Internet Gateway
   */
  @Post('internet-gateway')
  @HttpCode(HttpStatus.CREATED)
  async createInternetGateway(
    @Body() body: {
      compartmentId: string;
      vcnId: string;
      displayName: string;
    },
  ) {
    try {
      const igw = await this.ociService.createInternetGateway(
        body.compartmentId,
        body.vcnId,
        body.displayName,
      );

      return {
        success: true,
        data: igw,
      };
    } catch (error) {
      this.logger.error('Error in createInternetGateway:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/route-table
   * Update route table
   */
  @Post('route-table')
  @HttpCode(HttpStatus.OK)
  async updateRouteTable(
    @Body() body: {
      routeTableId: string;
      internetGatewayId: string;
    },
  ) {
    try {
      const routeTable = await this.ociService.updateRouteTable(
        body.routeTableId,
        body.internetGatewayId,
      );

      return {
        success: true,
        data: routeTable,
      };
    } catch (error) {
      this.logger.error('Error in updateRouteTable:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/subnet
   * Create a subnet
   */
  @Post('subnet')
  @HttpCode(HttpStatus.CREATED)
  async createSubnet(
    @Body() body: {
      compartmentId: string;
      vcnId: string;
      displayName: string;
      cidrBlock: string;
      availabilityDomain: string;
      dnsLabel?: string;
    },
  ) {
    try {
      const subnet = await this.ociService.createSubnet(
        body.compartmentId,
        body.vcnId,
        body.displayName,
        body.cidrBlock,
        body.availabilityDomain,
        body.dnsLabel,
      );

      return {
        success: true,
        data: subnet,
      };
    } catch (error) {
      this.logger.error('Error in createSubnet:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/instance
   * Launch a compute instance
   */
  @Post('instance')
  @HttpCode(HttpStatus.CREATED)
  async launchInstance(
    @Body() body: {
      compartmentId: string;
      displayName: string;
      availabilityDomain: string;
      subnetId: string;
      imageId: string;
      shape: string;
      sshPublicKeys: string[];
      ocpus?: number;
      memoryInGBs?: number;
      bootVolumeSizeInGBs?: number;
    },
  ) {
    try {
      const instance = await this.ociService.launchInstance(
        body.compartmentId,
        body.displayName,
        body.availabilityDomain,
        body.subnetId,
        body.imageId,
        body.shape,
        body.sshPublicKeys,
        body.ocpus,
        body.memoryInGBs,
        body.bootVolumeSizeInGBs,
      );

      return {
        success: true,
        data: instance,
      };
    } catch (error) {
      this.logger.error('Error in launchInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /oci/instances
   * List instances in a compartment
   */
  @Get('instances')
  async getInstances(@Query('compartmentId') compartmentId?: string) {
    try {
      if (!compartmentId) {
        compartmentId = await this.ociService.getTenancyId();
      }

      const instances = await this.ociService.listInstances(compartmentId);

      return {
        success: true,
        data: instances,
        count: instances.length,
      };
    } catch (error) {
      this.logger.error('Error in getInstances:', error);
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }
  }

  /**
   * GET /oci/instance/:instanceId
   * Get instance details
   */
  @Get('instance/:instanceId')
  async getInstance(@Param('instanceId') instanceId: string) {
    try {
      const instance = await this.ociService.getInstance(instanceId);

      return {
        success: true,
        data: instance,
      };
    } catch (error) {
      this.logger.error('Error in getInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /oci/instance/:instanceId/public-ip
   * Get instance public IP
   */
  @Get('instance/:instanceId/public-ip')
  async getInstancePublicIp(
    @Param('instanceId') instanceId: string,
    @Query('compartmentId') compartmentId: string,
  ) {
    try {
      if (!compartmentId) {
        return {
          success: false,
          error: 'compartmentId is required',
        };
      }

      const publicIp = await this.ociService.getInstancePublicIp(
        compartmentId,
        instanceId,
      );

      return {
        success: true,
        data: { publicIp },
      };
    } catch (error) {
      this.logger.error('Error in getInstancePublicIp:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/instance/:instanceId/start
   * Start an instance
   */
  @Post('instance/:instanceId/start')
  @HttpCode(HttpStatus.OK)
  async startInstance(@Param('instanceId') instanceId: string) {
    try {
      const result = await this.ociService.startInstance(instanceId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error in startInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/instance/:instanceId/stop
   * Stop an instance
   */
  @Post('instance/:instanceId/stop')
  @HttpCode(HttpStatus.OK)
  async stopInstance(@Param('instanceId') instanceId: string) {
    try {
      const result = await this.ociService.stopInstance(instanceId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error in stopInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * POST /oci/instance/:instanceId/restart
   * Restart an instance
   */
  @Post('instance/:instanceId/restart')
  @HttpCode(HttpStatus.OK)
  async restartInstance(@Param('instanceId') instanceId: string) {
    try {
      const result = await this.ociService.restartInstance(instanceId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error in restartInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * DELETE /oci/instance/:instanceId
   * Terminate an instance
   */
  @Delete('instance/:instanceId')
  @HttpCode(HttpStatus.OK)
  async terminateInstance(
    @Param('instanceId') instanceId: string,
    @Query('preserveBootVolume') preserveBootVolume?: string,
  ) {
    try {
      const preserve = preserveBootVolume === 'true';
      const result = await this.ociService.terminateInstance(instanceId, preserve);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error in terminateInstance:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * DELETE /oci/compartment/:compartmentName
   * Delete a compartment and all its resources
   * ⚠️ WARNING: This will permanently delete all instances, VCNs, and other resources!
   */
  @Delete('compartment/:compartmentName')
  @HttpCode(HttpStatus.OK)
  async deleteCompartment(@Param('compartmentName') compartmentName: string) {
    try {
      this.logger.warn(`⚠️  DELETING COMPARTMENT: ${compartmentName} and ALL resources inside`);
      
      const result = await this.ociService.deleteCompartmentWithResources(compartmentName);

      return {
        success: true,
        message: `Compartment "${compartmentName}" and all resources deleted successfully`,
        data: result,
      };
    } catch (error) {
      this.logger.error('Error in deleteCompartment:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * GET /oci/instance/:instanceId/metrics
   * Get monitoring metrics for an instance
   */
  @Get('instance/:instanceId/metrics')
  async getInstanceMetrics(
    @Param('instanceId') instanceId: string,
    @Query('timeRange') timeRange: string = '1h',
    @Query('startDate') startDate?: string,
  ) {
    try {
      const endTime = new Date();
      let startTime = new Date();

      // Parse time range
      switch (timeRange) {
        case '1h':
          startTime.setHours(startTime.getHours() - 1);
          // resolution = 1m → floor to the minute
          startTime.setSeconds(0, 0);
          break;
        case '6h':
          startTime.setHours(startTime.getHours() - 6);
          // resolution = 5m → floor to the nearest 5-min boundary
          startTime.setMinutes(Math.floor(startTime.getMinutes() / 5) * 5, 0, 0);
          break;
        case '24h':
          startTime.setHours(startTime.getHours() - 24);
          // resolution = 1h → floor to the hour
          startTime.setMinutes(0, 0, 0);
          break;
        case '7d':
          startTime.setDate(startTime.getDate() - 7);
          // resolution = 1h → floor to the hour
          startTime.setMinutes(0, 0, 0);
          break;
        case 'all':
          if (startDate) {
            startTime = new Date(startDate);
          } else {
            startTime.setDate(startTime.getDate() - 90);
          }
          // resolution = 1h → floor to the hour
          startTime.setMinutes(0, 0, 0);
          break;
        default:
          startTime.setHours(startTime.getHours() - 1);
          startTime.setSeconds(0, 0);
      }

      // Determine resolution used for this time range (mirrors oci.service.ts logic)
      const resolution =
        timeRange === '1h' ? '1m' : timeRange === '6h' ? '5m' : '1h';

      const [cpu, memory, networkIn, networkOut, diskRead, diskWrite] =
        await Promise.all([
          this.ociService.getCpuUtilization(instanceId, startTime, endTime),
          this.ociService.getMemoryUtilization(instanceId, startTime, endTime),
          this.ociService.getNetworkBytesIn(instanceId, startTime, endTime),
          this.ociService.getNetworkBytesOut(instanceId, startTime, endTime),
          this.ociService.getDiskReadBytes(instanceId, startTime, endTime),
          this.ociService.getDiskWriteBytes(instanceId, startTime, endTime),
        ]);

      return {
        success: true,
        data: {
          cpu: this.formatMetricsData(cpu, resolution),
          memory: this.formatMetricsData(memory, resolution),
          network: {
            in: this.formatMetricsData(networkIn, resolution),
            out: this.formatMetricsData(networkOut, resolution),
          },
          disk: {
            read: this.formatMetricsData(diskRead, resolution),
            write: this.formatMetricsData(diskWrite, resolution),
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting metrics for instance ${instanceId}:`,
        error,
      );
      return {
        success: false,
        error: error.message,
        data: {
          cpu: [],
          memory: [],
          network: { in: [], out: [] },
          disk: { read: [], write: [] },
        },
      };
    }
  }

  /**
   * Format metrics data for charts.
   * OCI now returns epoch-aligned timestamps when [1m] MQL interval + resolution
   * param are used together, so no timestamp manipulation is needed here.
   */
  /**
   * Floor a Date to the nearest resolution boundary (UTC).
   */
  private floorToEpoch(date: Date, resolution: string): Date {
    const d = new Date(date);
    if (resolution === '1m') {
      d.setUTCSeconds(0, 0);
    } else if (resolution === '5m') {
      d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0);
    } else {
      d.setUTCMinutes(0, 0, 0);
    }
    return d;
  }

  /**
   * Convert OCI agent-aligned metric buckets to epoch-aligned data points.
   *
   * OCI oci_computeagent metrics are bucketed from the monitoring agent's start
   * time, NOT from UTC epoch.  A VM that started at :30 produces buckets
   * 00:30-01:30, 01:30-02:30, …  The OCI Console, however, displays
   * epoch-aligned hours (01:00-02:00, 02:00-03:00, …).
   *
   * To match, we interpolate between adjacent agent buckets:
   *   epoch_value(01:00) = (O/H)*agent_value(00:30) + ((H-O)/H)*agent_value(01:30)
   * where O = agent offset (30 min) and H = bucket width (60 min).
   *
   * If timestamps are already epoch-aligned (offset < 1 s), data is returned
   * as-is with floored timestamps.
   */
  private formatMetricsData(metrics: any[], resolution: string = '1h'): any[] {
    if (!metrics || metrics.length === 0) return [];

    // 1. Collect raw data points
    const raw: Array<{ time: number; value: number }> = [];
    for (const metric of metrics) {
      if (metric.aggregatedDatapoints) {
        for (const dp of metric.aggregatedDatapoints) {
          raw.push({
            time: new Date(dp.timestamp).getTime(),
            value: dp.value || 0,
          });
        }
      }
    }
    raw.sort((a, b) => a.time - b.time);
    if (raw.length === 0) return [];

    // 2. Resolution in ms
    const resMs =
      resolution === '1m' ? 60_000 : resolution === '5m' ? 300_000 : 3_600_000;

    // 3. Detect agent offset from first timestamp
    const offset = raw[0].time % resMs; // ms from epoch boundary

    // Already epoch-aligned (offset negligible) → just floor & return
    if (offset < 1000 || resMs - offset < 1000) {
      return raw.map((p) => ({
        time: this.floorToEpoch(new Date(p.time), resolution).toISOString(),
        value: p.value,
      }));
    }

    // 4. Interpolate consecutive agent buckets → epoch-aligned values
    //    wPrev = portion of previous agent bucket that overlaps the epoch bucket
    //    wCurr = portion of current agent bucket that overlaps the epoch bucket
    const wPrev = offset / resMs;
    const wCurr = 1 - wPrev;

    const result: any[] = [];
    for (let i = 0; i < raw.length - 1; i++) {
      // The epoch time between agent[i] and agent[i+1]
      const epochTime = this.floorToEpoch(new Date(raw[i + 1].time), resolution);
      const value = wPrev * raw[i].value + wCurr * raw[i + 1].value;
      result.push({
        time: epochTime.toISOString(),
        value,
      });
    }

    return result;
  }
}
