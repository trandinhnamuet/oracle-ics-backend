import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ExchangeRate } from './exchange-rate.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateScheduler } from './exchange-rate.scheduler';
import { ExchangeRateController } from './exchange-rate.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRate]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateScheduler],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
