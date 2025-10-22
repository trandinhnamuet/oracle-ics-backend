import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserWalletService } from './user-wallet.service';
import { UserWalletController } from './user-wallet.controller';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserWallet, WalletTransaction])],
  controllers: [UserWalletController],
  providers: [UserWalletService],
  exports: [UserWalletService],
})
export class UserWalletModule {}