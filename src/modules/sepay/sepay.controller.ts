import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { SepayService } from './sepay.service';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('sepay')
export class SepayController {
  private readonly logger = new Logger(SepayController.name);

  constructor(private readonly sepayService: SepayService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('authorization') authHeader: string,
    @Body() webhookData: SepayWebhookDto,
  ) {
    const apiKey = process.env.SEPAY_WEBHOOK_API_KEY;
    if (apiKey && authHeader !== `Apikey ${apiKey}`) {
      throw new UnauthorizedException('Invalid webhook API key');
    }
    this.logger.log(`Received Sepay webhook for transaction ${webhookData.id}`);
    
    const result = await this.sepayService.handleWebhook(webhookData);
    
    return result;
  }

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    this.logger.log(`Creating payment for user ${createPaymentDto.userId}, package ${createPaymentDto.packageId}`);
    
    const result = await this.sepayService.createPayment(createPaymentDto);
    
    this.logger.log(`Payment created: ${result.paymentId}`);
    
    return result;
  }
}