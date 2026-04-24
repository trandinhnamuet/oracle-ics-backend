import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CustomPackageRegistrationModule } from './custom-package-registration/custom-package-registration.module';
import { UserModule } from './users/user.module';
import { SepayModule } from './modules/sepay/sepay.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { ImageModule } from './modules/image/image.module';
import { CloudPackageModule } from './modules/cloud-package/cloud-package.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { UserWalletModule } from './modules/user-wallet/user-wallet.module';
import { WalletTransactionModule } from './modules/wallet-transaction/wallet-transaction.module';
import { SubscriptionLogModule } from './modules/subscription-log/subscription-log.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { OciModule } from './modules/oci/oci.module';
import { SystemSshKeyModule } from './modules/system-ssh-key/system-ssh-key.module';
import { VmProvisioningModule } from './modules/vm-provisioning/vm-provisioning.module';
import { VmSubscriptionModule } from './modules/vm-subscription/vm-subscription.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BandwidthModule } from './modules/bandwidth/bandwidth.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { SupportTicketModule } from './modules/support-ticket/support-ticket.module';
import { NotificationModule } from './modules/notification/notification.module';
import { TermsModule } from './modules/terms/terms.module';

dotenv.config();

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
      autoLoadEntities: true,
      extra: {
        // Force every DB session to use UTC so TIMESTAMP (no timezone) columns
        // are stored/read as UTC, preventing timezone mismatch with Node.js Date.now()
        options: '-c timezone=UTC',
      },
    }),
    AuthModule,
    CustomPackageRegistrationModule,
    UserModule,
    SepayModule,
    DashboardModule,
    ExchangeRateModule,
    ImageModule,
    CloudPackageModule,
    PaymentModule,
    SubscriptionModule,
    UserWalletModule,
    WalletTransactionModule,
    SubscriptionLogModule,
    SchedulerModule,
    OciModule,
    SystemSshKeyModule,
    VmProvisioningModule,
    VmSubscriptionModule,
    AnalyticsModule,
    BandwidthModule,
    TerminalModule,
    SupportTicketModule,
    NotificationModule,
    TermsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
