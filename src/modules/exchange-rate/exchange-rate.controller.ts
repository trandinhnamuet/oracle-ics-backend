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
    const today = new Date().toISOString().slice(0, 10);
    const where: any = { date: today };
    if (currencyFrom) where.currency_from = currencyFrom;
    if (currencyTo) where.currency_to = currencyTo;
    if (direction) where.direction = direction;
    return this.exchangeRateService['exchangeRateRepository'].find({ where });
  }
}
