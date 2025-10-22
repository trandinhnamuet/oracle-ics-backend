import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { Subscription } from '../../entities/subscription.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CloudPackage } from '../../entities/cloud-package.entity';
import { Payment } from '../../entities/payment.entity';
import { UserWalletModule } from '../user-wallet/user-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, UserWallet, WalletTransaction, CloudPackage, Payment]),
    UserWalletModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}