import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class ExchangeRateScheduler {
  private readonly logger = new Logger(ExchangeRateScheduler.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  // Chạy mỗi ngày lúc 1h sáng giờ Việt Nam
  @Cron('0 1 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleDailyExchangeRate() {
    this.logger.log('Fetching Vietcombank exchange rates...');
    await this.exchangeRateService.fetchAndSaveRates();
    this.logger.log('Exchange rate update finished');
  }
}
