import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletTransactionService } from './wallet-transaction.service';
import { WalletTransactionController } from './wallet-transaction.controller';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WalletTransaction])],
  controllers: [WalletTransactionController],
  providers: [WalletTransactionService],
  exports: [WalletTransactionService],
})
export class WalletTransactionModule {}