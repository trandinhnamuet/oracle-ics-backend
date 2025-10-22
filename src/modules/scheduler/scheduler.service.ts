import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private subscriptionService: SubscriptionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySubscriptionCheck() {
    this.logger.debug('Running daily subscription check at midnight');
    
    try {
      await this.subscriptionService.checkExpiredSubscriptions();
      this.logger.log('Daily subscription check completed successfully');
    } catch (error) {
      this.logger.error('Error during daily subscription check:', error);
    }
  }

  // Run every hour as backup
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlySubscriptionCheck() {
    this.logger.debug('Running hourly subscription check');
    
    try {
      await this.subscriptionService.checkExpiredSubscriptions();
    } catch (error) {
      this.logger.error('Error during hourly subscription check:', error);
    }
  }
}