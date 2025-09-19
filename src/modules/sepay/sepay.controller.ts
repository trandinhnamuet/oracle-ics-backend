import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { SepayService } from './sepay.service';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';

@Controller('sepay')
export class SepayController {
  private readonly logger = new Logger(SepayController.name);

  constructor(private readonly sepayService: SepayService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() webhookData: SepayWebhookDto) {
    this.logger.log(`Received Sepay webhook for transaction ${webhookData.id}`);
    
    const result = await this.sepayService.handleWebhook(webhookData);
    
    this.logger.log(`Webhook processing result: ${JSON.stringify(result)}`);
    
    return result;
  }

  @Post('create-payment')
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    this.logger.log(`Creating payment for user ${createPaymentDto.userId}, package ${createPaymentDto.packageId}`);
    
    const result = await this.sepayService.createPayment(createPaymentDto);
    
    this.logger.log(`Payment created: ${result.paymentId}`);
    
    return result;
  }
}