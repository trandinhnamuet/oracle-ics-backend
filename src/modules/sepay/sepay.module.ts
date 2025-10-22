import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SepayController } from './sepay.controller';
import { SepayService } from './sepay.service';
import { Payment } from '../../entities/payment.entity';
import { Subscription } from '../../entities/subscription.entity';
import { UserWalletModule } from '../user-wallet/user-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Subscription]),
    UserWalletModule,
  ],
  controllers: [SepayController],
  providers: [SepayService],
  exports: [SepayService],
})
export class SepayModule {}