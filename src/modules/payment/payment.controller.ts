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
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

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
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return await this.paymentService.findAll();
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  async getAllPaymentsForAdmin(@Request() req) {
    // TODO: Add admin role check if needed
    return await this.paymentService.findAll();
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  async findMyPayments(@Request() req) {
    return await this.paymentService.findByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.paymentService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
  ) {
    return await this.paymentService.update(id, updatePaymentDto);
  }

  @Post('sepay-callback')
  async handleSepayCallback(@Body() callbackData: any) {
    return await this.paymentService.handleSepayCallback(callbackData);
  }

  @Post('process-success')
  async processSuccess(
    @Body() body: { transactionCode: string; amount: number },
  ) {
    return await this.paymentService.processSuccessfulPayment(
      body.transactionCode,
      body.amount,
    );
  }

  @Post('admin/:id/accept')
  @UseGuards(JwtAuthGuard)
  async acceptPayment(@Param('id') id: string, @Request() req) {
    // TODO: Add admin role check if needed
    return await this.paymentService.acceptPayment(id);
  }
}