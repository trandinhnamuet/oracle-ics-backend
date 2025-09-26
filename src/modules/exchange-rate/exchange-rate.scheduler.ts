import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class ExchangeRateScheduler {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  // Chạy mỗi ngày lúc 1h sáng giờ Việt Nam
  @Cron('0 1 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleDailyExchangeRate() {
    console.log('Đang lấy tỉ giá Vietcombank...');
    await this.exchangeRateService.fetchAndSaveRates();
    console.log('Đã lưu tỉ giá xong!');
  }
}
