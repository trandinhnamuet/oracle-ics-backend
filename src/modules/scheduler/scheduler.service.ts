import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from '../subscription/subscription.service';
import { VmSubscriptionService } from '../vm-subscription/vm-subscription.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private subscriptionService: SubscriptionService,
    private vmSubscriptionService: VmSubscriptionService,
    private notificationService: NotificationService,
    private paymentService: PaymentService,
  ) {}

  /**
   * On startup: delete any pending subscriptions older than 30 minutes
   * and mark expired pending payments as failed.
   */
  async onModuleInit() {
    this.logger.log('[Scheduler] Running startup cleanup for stale pending subscriptions...');
    try {
      await this.subscriptionService.cleanupStalePending();
    } catch (error) {
      this.logger.error('[Scheduler] Startup pending cleanup failed:', error);
    }

    this.logger.log('[Scheduler] Running startup cleanup for expired pending payments...');
    try {
      await this.paymentService.cleanupExpiredPendingPayments(60);
    } catch (error) {
      this.logger.error('[Scheduler] Startup payment cleanup failed:', error);
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

  /**
   * Every 60 minutes: mark pending payments older than 60 minutes as failed.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredPaymentCleanup() {
    this.logger.debug('[Scheduler] Running expired pending payment cleanup');
    try {
      await this.paymentService.cleanupExpiredPendingPayments(60);
    } catch (error) {
      this.logger.error('[Scheduler] Expired payment cleanup failed:', error);
    }
  }

  /**
   * Every hour: stop any running OCI VM instances whose subscription has
   * expired or been cancelled. This ensures VMs are not left running after
   * the user's subscription lapses.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleStopExpiredVms() {
    this.logger.debug('[Scheduler] Running expired-subscription VM stop sweep');
    try {
      await this.vmSubscriptionService.stopExpiredSubscriptionVms();
    } catch (error) {
      this.logger.error('[Scheduler] Expired VM stop sweep failed:', error);
    }
  }

  /**
   * Daily at 8 AM: notify users whose subscriptions expire in 3 days.
   */
  @Cron('0 8 * * *')
  async handleExpiryWarnings() {
    this.logger.debug('[Scheduler] Sending subscription expiry warning notifications');
    try {
      const expiringSubs = await this.subscriptionService.findExpiringSoon(3);
      for (const sub of expiringSubs) {
        const pkgName = (sub as any).cloudPackage?.name ?? `#${sub.cloud_package_id}`;
        const endDate = new Date(sub.end_date).toLocaleDateString('vi-VN');
        const endDateEn = new Date(sub.end_date).toLocaleDateString('en-US');
        await this.notificationService.notify(
          sub.user_id,
          NotificationType.SUBSCRIPTION_EXPIRING,
          '⚠️ Gói dịch vụ sắp hết hạn',
          `Gói "${pkgName}" của bạn sẽ hết hạn vào ${endDate}. Hãy gia hạn để không bị gián đoạn dịch vụ.`,
          { subscription_id: sub.id, end_date: sub.end_date, package_name: pkgName },
          '⚠️ Subscription expiring soon',
          `Your "${pkgName}" plan will expire on ${endDateEn}. Renew now to avoid service interruption.`,
        );
      }
    } catch (error) {
      this.logger.error('[Scheduler] Expiry warning notifications failed:', error);
    }
  }
}