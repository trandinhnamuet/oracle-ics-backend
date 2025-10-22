import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { Payment } from '../../entities/payment.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, UserWallet, WalletTransaction])
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}