import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { VmSubscriptionModule } from '../vm-subscription/vm-subscription.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SubscriptionModule,
    VmSubscriptionModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}