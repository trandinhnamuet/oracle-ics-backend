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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
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
    const userId = req.user.userId;
    return this.vmProvisioningService.provisionVm(userId, createVmDto);
  }

  /**
   * Get all VMs for the authenticated user
   */
  @Get()
  async getUserVms(@Request() req) {
    const userId = req.user.userId;
    return this.vmProvisioningService.getUserVms(userId);
  }

  /**
   * Get specific VM by ID
   */
  @Get(':id')
  async getVmById(@Request() req, @Param('id') vmId: string) {
    const userId = req.user.userId;
    return this.vmProvisioningService.getVmById(userId, vmId);
  }

  /**
   * Perform action on VM (start, stop, restart, terminate)
   */
  @Post(':id/action')
  @HttpCode(HttpStatus.OK)
  async performVmAction(
    @Request() req,
    @Param('id') vmId: string,
    @Body() vmActionDto: VmActionDto,
  ) {
    const userId = req.user.userId;
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
    @Param('id') vmId: string,
  ) {
    const userId = req.user.userId;
    return this.vmProvisioningService.getVmActionLogs(userId, vmId);
  }
}
