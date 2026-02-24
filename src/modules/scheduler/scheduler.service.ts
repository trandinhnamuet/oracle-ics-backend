import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private subscriptionService: SubscriptionService,
  ) {}

  /**
   * On startup: delete any pending subscriptions older than 10 minutes
   * that lost their in-memory timer due to a backend restart.
   */
  async onModuleInit() {
    this.logger.log('[Scheduler] Running startup cleanup for stale pending subscriptions...');
    try {
      await this.subscriptionService.cleanupStalePending();
    } catch (error) {
      this.logger.error('[Scheduler] Startup pending cleanup failed:', error);
    }
  }

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

  // Safety net: every 24h, clean up pending subscriptions older than 30 minutes
  // that may have lost their in-memory timer (e.g., from a previous restart)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleHourlyPendingCleanup() {
    this.logger.debug('[Scheduler] Running daily stale pending subscription cleanup');
    try {
      await this.subscriptionService.cleanupStalePending();
    } catch (error) {
      this.logger.error('[Scheduler] Hourly pending cleanup failed:', error);
    }
  }
}