import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRate } from './exchange-rate.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateScheduler } from './exchange-rate.scheduler';
import { ExchangeRateController } from './exchange-rate.controller';

@Module({
  // ScheduleModule.forRoot() lives in SchedulerModule only. Registering it here too
  // created a second cron explorer, so every @Cron in the app fired twice.
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateScheduler],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
