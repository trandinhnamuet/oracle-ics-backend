import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SubscriptionLogService } from './subscription-log.service';
import { CreateSubscriptionLogDto } from './dto/create-subscription-log.dto';
import { UpdateSubscriptionLogDto } from './dto/update-subscription-log.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

@Controller('subscription-logs')
export class SubscriptionLogController {
  constructor(private readonly subscriptionLogService: SubscriptionLogService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createSubscriptionLogDto: CreateSubscriptionLogDto,
    @Request() req,
  ) {
    createSubscriptionLogDto.user_id = req.user.id;
    return await this.subscriptionLogService.create(createSubscriptionLogDto);
  }

  @Post('actions/start-vm')
  @UseGuards(JwtAuthGuard)
  async startVm(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logVmStart(body.subscriptionId, req.user.id);
  }

  @Post('actions/pause-vm')
  @UseGuards(JwtAuthGuard)
  async pauseVm(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logVmPause(body.subscriptionId, req.user.id);
  }

  @Post('actions/restart-vm')
  @UseGuards(JwtAuthGuard)
  async restartVm(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logVmRestart(body.subscriptionId, req.user.id);
  }

  @Post('actions/create-backup')
  @UseGuards(JwtAuthGuard)
  async createBackup(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logBackupCreate(body.subscriptionId, req.user.id);
  }

  @Post('actions/delete-vm')
  @UseGuards(JwtAuthGuard)
  async deleteVm(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logVmDelete(body.subscriptionId, req.user.id);
  }

  @Post('actions/change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: { subscriptionId: string },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logPasswordChange(body.subscriptionId, req.user.id);
  }

  @Post('actions/change-configuration')
  @UseGuards(JwtAuthGuard)
  async changeConfiguration(
    @Body() body: { subscriptionId: string; configuration?: any },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logConfigurationChange(
      body.subscriptionId,
      req.user.id,
      body.configuration
    );
  }

  @Post('actions/toggle-auto-renew')
  @UseGuards(JwtAuthGuard)
  async toggleAutoRenew(
    @Body() body: { subscriptionId: string; enabled: boolean },
    @Request() req,
  ) {
    return await this.subscriptionLogService.logAutoRenewToggle(
      body.subscriptionId,
      req.user.id,
      body.enabled
    );
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return await this.subscriptionLogService.findAll();
  }

  @Get('my-logs')
  @UseGuards(JwtAuthGuard)
  async findMyLogs(@Request() req) {
    return await this.subscriptionLogService.findByUser(req.user.id);
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Get('subscription/:subscriptionId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findBySubscription(@Param('subscriptionId') subscriptionId: string) {
    return await this.subscriptionLogService.findBySubscription(subscriptionId);
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Get('action/:action')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findByAction(@Param('action') action: string) {
    return await this.subscriptionLogService.findByAction(action);
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    return await this.subscriptionLogService.findOne(id);
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionLogDto: UpdateSubscriptionLogDto,
  ) {
    return await this.subscriptionLogService.update(id, updateSubscriptionLogDto);
  }

  // Admin only: this reaches every customer's audit records. Customers read
  // their own history through `my-logs`, which is scoped to req.user.id.
  // Mutation is restricted because these rows are the audit trail.
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    return await this.subscriptionLogService.remove(id);
  }
}