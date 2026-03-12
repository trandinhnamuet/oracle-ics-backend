import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CreateWalletTransactionDto } from './dto/create-wallet-transaction.dto';
import { UpdateWalletTransactionDto } from './dto/update-wallet-transaction.dto';

@Injectable()
export class WalletTransactionService {
  constructor(
    @InjectRepository(WalletTransaction)
    private walletTransactionRepository: Repository<WalletTransaction>,
  ) {}

  async create(createWalletTransactionDto: CreateWalletTransactionDto): Promise<WalletTransaction> {
    const walletTransaction = this.walletTransactionRepository.create(createWalletTransactionDto);
    return await this.walletTransactionRepository.save(walletTransaction);
  }

  async findAll(): Promise<WalletTransaction[]> {
    return await this.walletTransactionRepository.find({
      relations: ['wallet', 'wallet.user'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByUser(userId: number): Promise<WalletTransaction[]> {
    // Cần join với wallet để lấy transactions của user
    return await this.walletTransactionRepository.find({
      relations: ['wallet'],
      where: {
        wallet: { user_id: userId }
      },
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByWallet(walletId: number): Promise<WalletTransaction[]> {
    return await this.walletTransactionRepository.find({
      where: { wallet_id: walletId },
      relations: ['wallet'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByType(type: string): Promise<WalletTransaction[]> {
    return await this.walletTransactionRepository.find({
      where: { type },
      relations: ['wallet'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<WalletTransaction> {
    const walletTransaction = await this.walletTransactionRepository.findOne({
      where: { id },
      relations: ['user', 'wallet'],
    });

    if (!walletTransaction) {
      throw new NotFoundException(`Wallet transaction with ID ${id} not found`);
    }

    return walletTransaction;
  }

  async update(id: string, updateWalletTransactionDto: UpdateWalletTransactionDto): Promise<WalletTransaction> {
    const walletTransaction = await this.findOne(id);
    
    Object.assign(walletTransaction, updateWalletTransactionDto);
    
    return await this.walletTransactionRepository.save(walletTransaction);
  }

  async remove(id: string): Promise<void> {
    const walletTransaction = await this.findOne(id);
    await this.walletTransactionRepository.remove(walletTransaction);
  }

  async getTransactionStats(userId: number): Promise<any> {
    const transactions = await this.findByUser(userId);
    
    // Với cấu trúc mới: change_amount > 0 là credit, < 0 là debit
    const totalDeposits = transactions
      .filter(t => t.change_amount > 0)
      .reduce((sum, t) => sum + t.change_amount, 0);
    
    const totalWithdrawals = Math.abs(transactions
      .filter(t => t.change_amount < 0)
      .reduce((sum, t) => sum + t.change_amount, 0));
    
    return {
      totalTransactions: transactions.length,
      totalDeposits,
      totalWithdrawals,
      netAmount: totalDeposits - totalWithdrawals,
    };
  }

  async adminFindAll(options: {
    page: number;
    limit: number;
    userId?: number;
    month?: string; // 'YYYY-MM'
  }): Promise<{ data: WalletTransaction[]; total: number; page: number; limit: number; totalPages: number }> {
    const { page, limit, userId, month } = options;
    const skip = (page - 1) * limit;

    const qb = this.walletTransactionRepository
      .createQueryBuilder('wt')
      .leftJoinAndSelect('wt.wallet', 'wallet')
      .leftJoinAndSelect('wallet.user', 'user')
      .orderBy('wt.created_at', 'DESC');

    if (userId) {
      qb.andWhere('wallet.user_id = :userId', { userId });
    }

    if (month) {
      // month format: YYYY-MM
      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 1); // exclusive
      qb.andWhere('wt.created_at >= :start AND wt.created_at < :end', { start, end });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}