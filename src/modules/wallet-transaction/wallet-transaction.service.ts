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
    // WalletTransaction has no `user` relation of its own — the owner is reached
    // through the wallet. Asking for 'user' made TypeORM throw
    // EntityPropertyNotFoundError, so GET/PATCH/DELETE /wallet-transactions/:id
    // answered 500 on every call (QA 2026-09-10, WTX/get|patch|delete).
    const walletTransaction = await this.walletTransactionRepository.findOne({
      where: { id },
      relations: ['wallet', 'wallet.user'],
    });

    if (!walletTransaction) {
      throw new NotFoundException(`Wallet transaction with ID ${id} not found`);
    }

    return walletTransaction;
  }

  async update(id: string, updateWalletTransactionDto: UpdateWalletTransactionDto): Promise<WalletTransaction> {
    // Deliberately loaded WITHOUT relations. `wallet_id` is mapped twice — once as
    // a plain column and once as the @JoinColumn of the `wallet` relation — so
    // saving an entity that carries the hydrated relation made TypeORM emit
    // `wallet_id = NULL` and Postgres rejected it with a not-null violation (500).
    // Patch the bare row, then re-read through findOne() for the relation-rich
    // response the API contract promises.
    const existing = await this.walletTransactionRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Wallet transaction with ID ${id} not found`);
    }

    for (const [key, value] of Object.entries(updateWalletTransactionDto)) {
      if (value !== undefined) {
        (existing as Record<string, unknown>)[key] = value;
      }
    }

    await this.walletTransactionRepository.save(existing);
    return await this.findOne(id);
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
    amountFilter?: 'positive' | 'negative';
  }): Promise<{ data: WalletTransaction[]; total: number; page: number; limit: number; totalPages: number; totalAmount: number }> {
    const { page, limit, userId, month, amountFilter } = options;
    const skip = (page - 1) * limit;

    const applyConditions = (qb: any) => {
      if (userId) {
        qb.andWhere('wallet.user_id = :userId', { userId });
      }
      if (month) {
        const [year, mon] = month.split('-').map(Number);
        const start = new Date(year, mon - 1, 1);
        const end = new Date(year, mon, 1);
        qb.andWhere('wt.created_at >= :start AND wt.created_at < :end', { start, end });
      }
      if (amountFilter === 'positive') {
        qb.andWhere('wt.change_amount > 0');
      } else if (amountFilter === 'negative') {
        qb.andWhere('wt.change_amount < 0');
      }
    };

    const qb = this.walletTransactionRepository
      .createQueryBuilder('wt')
      .leftJoinAndSelect('wt.wallet', 'wallet')
      .leftJoinAndSelect('wallet.user', 'user')
      .orderBy('wt.created_at', 'DESC');
    applyConditions(qb);

    const sumQb = this.walletTransactionRepository
      .createQueryBuilder('wt')
      .leftJoin('wt.wallet', 'wallet')
      .select('SUM(wt.change_amount)', 'sum');
    applyConditions(sumQb);

    const [[data, total], sumResult] = await Promise.all([
      qb.skip(skip).take(limit).getManyAndCount(),
      sumQb.getRawOne(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalAmount: parseFloat(sumResult?.sum ?? '0'),
    };
  }
}