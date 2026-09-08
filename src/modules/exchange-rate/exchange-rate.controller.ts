import { Controller, Get, Query } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './exchange-rate.entity';

@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get('today')
  async getTodayRates(
    @Query('currency_from') currencyFrom?: string,
    @Query('currency_to') currencyTo?: string,
    @Query('direction') direction?: string,
  ): Promise<ExchangeRate[]> {
    return this.exchangeRateService.getTodayRates({
      currency_from: currencyFrom,
      currency_to: currencyTo,
      direction,
    });
  }
}
