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
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Admin only. This raw create persists an ACTIVE subscription directly without
  // charging the wallet or creating a payment, so it must never be reachable by
  // ordinary users (WSTG-BUSL-06 — Circumvention of Work Flows: a user could
  // subscribe for free). Regular users must go through `subscribe-with-balance`
  // or `subscribe-with-payment`, which enforce billing. Admins keep this route
  // for granting complimentary/manual subscriptions.
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @Request() req,
  ) {
    return await this.subscriptionService.create(createSubscriptionDto);
  }

  @Post('subscribe-with-balance')
  @UseGuards(JwtAuthGuard)
  async subscribeWithBalance(
    @Body() body: { cloudPackageId: number; monthsCount?: number; autoRenew?: boolean },
    @Request() req,
  ) {
    return await this.subscriptionService.createWithAccountBalance(
      req.user.id,
      body.cloudPackageId,
      body.monthsCount,
      body.autoRenew,
    );
  }

  @Post('subscribe-with-payment')
  @UseGuards(JwtAuthGuard)
  async subscribeWithPayment(
    @Body() body: { cloudPackageId: number; monthsCount: number; autoRenew?: boolean },
    @Request() req,
  ) {
    return await this.subscriptionService.createWithPayment(
      req.user.id,
      body.cloudPackageId,
      body.monthsCount,
      body.autoRenew,
    );
  }

  // Admin only: returns EVERY user's subscriptions. Ordinary users must use
  // `my-subscriptions`. Previously only JwtAuthGuard protected it, letting any
  // authenticated (low-privileged) user list all subscriptions
  // (WSTG-ATHN-04 — Bypassing Authentication Schema).
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('searchTerm') searchTerm?: string,
  ) {
    return await this.subscriptionService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      sortBy,
      sortOrder,
      status,
      userId: userId ? parseInt(userId) : undefined,
      startDate,
      endDate,
      searchTerm,
    });
  }

  @Get('my-subscriptions')
  @UseGuards(JwtAuthGuard)
  async findMySubscriptions(@Request() req) {
    return await this.subscriptionService.findByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Request() req) {
    const subscription = await this.subscriptionService.findOne(id);
    if (subscription.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this subscription');
    }
    return subscription;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @Request() req,
  ) {
    const subscription = await this.subscriptionService.findOne(id);
    if (subscription.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this subscription');
    }
    return await this.subscriptionService.update(id, updateSubscriptionDto);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string, @Request() req) {
    const subscription = await this.subscriptionService.findOne(id);
    if (subscription.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this subscription');
    }
    return await this.subscriptionService.cancel(id);
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard)
  async suspend(@Param('id') id: string, @Request() req) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Only admins can suspend subscriptions');
    }
    return await this.subscriptionService.suspend(id);
  }

  @Patch(':id/reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivate(@Param('id') id: string, @Request() req) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Only admins can reactivate subscriptions');
    }
    return await this.subscriptionService.reactivate(id);
  }

  @Post(':id/renew')
  @UseGuards(JwtAuthGuard)
  async manualRenew(@Param('id') id: string, @Request() req) {
    return await this.subscriptionService.manualRenew(id, req.user.id);
  }

  @Post(':id/renew-payment')
  @UseGuards(JwtAuthGuard)
  async renewPayment(@Param('id') id: string, @Request() req) {
    return await this.subscriptionService.renewPaymentForPendingSubscription(id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @Request() req) {
    const subscription = await this.subscriptionService.findOne(id);
    if (subscription.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not have access to this subscription');
    }
    return await this.subscriptionService.remove(id);
  }
}