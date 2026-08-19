import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

/**
 * Resolve the caller's user id, failing closed.
 *
 * The authenticated principal exposes `id` (it is the sanitised User entity).
 * This controller previously read `req.user.userId`, which is always undefined —
 * and TypeORM 0.3.x silently DROPS an undefined value from a `where` object, so
 * `where: { id: vmId, user_id: undefined }` degraded to `where: { id: vmId }`.
 * Every ownership check in this controller was therefore inert: any
 * authenticated customer could read or operate another customer's VM.
 * Throwing when the id is missing keeps that failure mode impossible.
 */
function requireUserId(req: any): number {
  const id = req?.user?.id;
  if (id === undefined || id === null) {
    throw new UnauthorizedException('Authenticated user id is missing');
  }
  return Number(id);
}
import { VmProvisioningService } from './vm-provisioning.service';
import { CreateVmDto, VmActionDto } from './dto';

@Controller('vm-provisioning')
@UseGuards(JwtAuthGuard)
export class VmProvisioningController {
  constructor(private readonly vmProvisioningService: VmProvisioningService) {}

  /**
   * Provision a new VM for the authenticated user
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async provisionVm(@Request() req, @Body() createVmDto: CreateVmDto) {
    const userId = requireUserId(req);
    return this.vmProvisioningService.provisionVm(userId, createVmDto);
  }

  /**
   * Get all VMs for the authenticated user
   */
  @Get()
  async getUserVms(@Request() req) {
    const userId = requireUserId(req);
    return this.vmProvisioningService.getUserVms(userId);
  }

  /**
   * Get specific VM by ID
   */
  @Get(':id')
  async getVmById(@Request() req, @Param('id') vmId: number) {
    const userId = requireUserId(req);
    return this.vmProvisioningService.getVmById(userId, vmId);
  }

  /**
   * Perform action on VM (start, stop, restart, terminate)
   */
  @Post(':id/action')
  @HttpCode(HttpStatus.OK)
  async performVmAction(
    @Request() req,
    @Param('id') vmId: number,
    @Body() vmActionDto: VmActionDto,
  ) {
    const userId = requireUserId(req);
    return this.vmProvisioningService.performVmAction(
      userId,
      vmId,
      vmActionDto.action,
    );
  }

  /**
   * Get VM action logs
   */
  @Get(':id/logs')
  async getVmActionLogs(
    @Request() req,
    @Param('id') vmId: number,
  ) {
    const userId = requireUserId(req);
    return this.vmProvisioningService.getVmActionLogs(userId, vmId);
  }
}
