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

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return await this.subscriptionLogService.findAll();
  }

  @Get('my-logs')
  @UseGuards(JwtAuthGuard)
  async findMyLogs(@Request() req) {
    return await this.subscriptionLogService.findByUser(req.user.id);
  }

  @Get('subscription/:subscriptionId')
  @UseGuards(JwtAuthGuard)
  async findBySubscription(@Param('subscriptionId') subscriptionId: string) {
    return await this.subscriptionLogService.findBySubscription(subscriptionId);
  }

  @Get('action/:action')
  @UseGuards(JwtAuthGuard)
  async findByAction(@Param('action') action: string) {
    return await this.subscriptionLogService.findByAction(action);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.subscriptionLogService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionLogDto: UpdateSubscriptionLogDto,
  ) {
    return await this.subscriptionLogService.update(id, updateSubscriptionLogDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return await this.subscriptionLogService.remove(id);
  }
}