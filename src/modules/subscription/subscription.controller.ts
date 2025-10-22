import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @Request() req,
  ) {
    createSubscriptionDto.user_id = req.user.id;
    return await this.subscriptionService.create(createSubscriptionDto);
  }

  @Post('subscribe-with-balance')
  @UseGuards(JwtAuthGuard)
  async subscribeWithBalance(
    @Body() body: { cloudPackageId: number; autoRenew?: boolean },
    @Request() req,
  ) {
    return await this.subscriptionService.createWithAccountBalance(
      req.user.id,
      body.cloudPackageId,
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

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return await this.subscriptionService.findAll();
  }

  @Get('my-subscriptions')
  @UseGuards(JwtAuthGuard)
  async findMySubscriptions(@Request() req) {
    return await this.subscriptionService.findByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.subscriptionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return await this.subscriptionService.update(id, updateSubscriptionDto);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string) {
    return await this.subscriptionService.cancel(id);
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard)
  async suspend(@Param('id') id: string) {
    return await this.subscriptionService.suspend(id);
  }

  @Patch(':id/reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivate(@Param('id') id: string) {
    return await this.subscriptionService.reactivate(id);
  }
}