import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { TerminalModule } from './modules/terminal/terminal.module';

dotenv.config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
      autoLoadEntities: true,
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
    TerminalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
