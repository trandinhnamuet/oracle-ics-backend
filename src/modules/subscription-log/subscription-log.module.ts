import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionLogService } from './subscription-log.service';
import { SubscriptionLogController } from './subscription-log.controller';
import { SubscriptionLog } from '../../entities/subscription-log.entity';
import { Subscription } from '../../entities/subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionLog, Subscription])],
  controllers: [SubscriptionLogController],
  providers: [SubscriptionLogService],
  exports: [SubscriptionLogService],
})
export class SubscriptionLogModule {}