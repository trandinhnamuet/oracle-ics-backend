import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SubscriptionModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}