import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VmSubscriptionService } from './vm-subscription.service';
import { ConfigureVmDto, RequestNewKeyDto } from './dto';
import { VmActionDto } from '../vm-provisioning/dto';

@Controller('vm-subscription')
@UseGuards(JwtAuthGuard)
export class VmSubscriptionController {
  constructor(private readonly vmSubscriptionService: VmSubscriptionService) {}

  /**
   * Get VM details for a subscription
   * GET /vm-subscription/:subscriptionId
   */
  @Get(':subscriptionId')
  async getSubscriptionVm(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    const userId = req.user.id;
    return this.vmSubscriptionService.getSubscriptionVm(subscriptionId, userId);
  }

  /**
   * Configure VM for a subscription (create new or reconfigure)
   * POST /vm-subscription/:subscriptionId/configure
   */
  @Post(':subscriptionId/configure')
  @HttpCode(HttpStatus.OK)
  async configureVm(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
    @Body() configureVmDto: ConfigureVmDto,
  ) {
    const userId = req.user.id;
    return this.vmSubscriptionService.configureSubscriptionVm(
      subscriptionId,
      userId,
      configureVmDto,
    );
  }

  /**
   * Request new SSH key for subscription's VM
   * POST /vm-subscription/:subscriptionId/request-key
   */
  @Post(':subscriptionId/request-key')
  @HttpCode(HttpStatus.OK)
  async requestNewKey(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
    @Body() requestNewKeyDto: RequestNewKeyDto,
  ) {
    const userId = req.user.id;
    return this.vmSubscriptionService.requestNewSshKey(
      subscriptionId,
      userId,
      requestNewKeyDto.email,
    );
  }

  /**
   * Perform action on subscription's VM (Start, Stop, Restart)
   * POST /vm-subscription/:subscriptionId/action
   */
  @Post(':subscriptionId/action')
  @HttpCode(HttpStatus.OK)
  async performVmAction(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
    @Body() vmActionDto: VmActionDto,
  ) {
    const userId = req.user.id;
    return this.vmSubscriptionService.performVmAction(
      subscriptionId,
      userId,
      vmActionDto.action,
    );
  }
}
