import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  ForbiddenException,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @Request() req,
  ) {
    // Ensure user_id matches authenticated user
    createPaymentDto.user_id = Number(req.user.id);
    return await this.paymentService.create(createPaymentDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return await this.paymentService.findAll();
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllPaymentsForAdmin(@Request() req) {
    return await this.paymentService.findAll();
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  async findMyPayments(@Request() req) {
    return await this.paymentService.findByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Request() req) {
    const payment = await this.paymentService.findOne(id);
    // Users can only view their own payments; admins can view any payment
    if (req.user.role !== 'admin' && payment.user_id !== req.user.id) {
      throw new ForbiddenException('You do not have permission to view this payment');
    }
    return payment;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
  ) {
    return await this.paymentService.update(id, updatePaymentDto);
  }

  @Post('sepay-callback')
  @HttpCode(HttpStatus.OK)
  async handleSepayCallback(
    @Headers('authorization') authHeader: string,
    @Body() callbackData: any,
  ) {
    // Webhook authentication: require Sepay API key (fail-close).
    const apiKey = process.env.SEPAY_WEBHOOK_API_KEY;
    if (!apiKey) {
      throw new UnauthorizedException('Webhook API key is not configured');
    }
    if (authHeader !== `Apikey ${apiKey}`) {
      throw new UnauthorizedException('Invalid webhook API key');
    }
    return await this.paymentService.handleSepayCallback(callbackData);
  }

  @Post('process-success')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async processSuccess(
    @Body() body: { transactionCode: string; amount: number },
  ) {
    return await this.paymentService.processSuccessfulPayment(
      body.transactionCode,
      body.amount,
    );
  }

  @Post('admin/:id/accept')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async acceptPayment(@Param('id') id: string, @Request() req) {
    return await this.paymentService.acceptPayment(id);
  }
}