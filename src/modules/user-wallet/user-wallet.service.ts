import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CreateUserWalletDto } from './dto/create-user-wallet.dto';
import { UpdateUserWalletDto } from './dto/update-user-wallet.dto';

@Injectable()
export class UserWalletService {
  private readonly logger = new Logger(UserWalletService.name);

  constructor(
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTransaction)
    private walletTransactionRepository: Repository<WalletTransaction>,
    private dataSource: DataSource,
  ) {}

  async create(createUserWalletDto: CreateUserWalletDto): Promise<UserWallet> {
    // Check if wallet already exists for this user
    const existingWallet = await this.userWalletRepository.findOne({
      where: { user_id: createUserWalletDto.user_id },
    });

    if (existingWallet) {
      throw new ConflictException(`Wallet already exists for user ${createUserWalletDto.user_id}`);
    }

    const userWallet = this.userWalletRepository.create({
      ...createUserWalletDto,
      balance: createUserWalletDto.balance || 0,
      currency: createUserWalletDto.currency || 'VND',
    });

    return await this.userWalletRepository.save(userWallet);
  }

  async createForUser(userId: number): Promise<UserWallet> {
    // Kiểm tra trước khi tạo wallet mới
    const walletExists = await this.hasWallet(userId);
    if (walletExists) {
      throw new ConflictException(`Wallet already exists for user ${userId}`);
    }
    
    return await this.create({ user_id: userId });
  }

  async hasWallet(userId: number): Promise<boolean> {
    const wallet = await this.userWalletRepository.findOne({
      where: { user_id: userId },
    });
    return !!wallet;
  }



  /**
   * Tạo wallet một cách an toàn, tránh duplicate
   * Trả về wallet mới tạo hoặc wallet đã tồn tại
   */
  async createWalletSafely(userId: number): Promise<UserWallet> {
    try {
      // Thử tạo wallet mới
      return await this.create({ user_id: userId });
    } catch (error) {
      // Nếu wallet đã tồn tại, trả về wallet hiện có
      if (error instanceof ConflictException) {
        const existingWallet = await this.userWalletRepository.findOne({
          where: { user_id: userId },
          relations: ['user'],
        });
        
        if (!existingWallet) {
          throw new Error(`Failed to create or find existing wallet for user ${userId}`);
        }
        
        return existingWallet;
      }
      
      // Nếu là lỗi khác, throw lại
      throw error;
    }
  }

  async findAll(): Promise<UserWallet[]> {
    return await this.userWalletRepository.find({
      relations: ['user'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByUserId(userId: number): Promise<UserWallet> {
    let wallet = await this.userWalletRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });
    if (wallet) {
      return wallet;
    }

    // No wallet yet — create it. The in-memory guard used previously was useless
    // across workers and raced single-process; instead rely on the DB unique
    // constraint on user_id: if a concurrent request wins the create, ours throws
    // and we simply re-find the row it created.
    try {
      this.logger.log(`Creating new wallet for user ${userId}`);
      await this.create({ user_id: userId });
    } catch (e: any) {
      this.logger.warn(`Wallet create race for user ${userId} (will re-find): ${e?.message ?? e}`);
    }

    wallet = await this.userWalletRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });
    if (!wallet) {
      throw new Error(`Failed to create or find wallet for user ${userId}`);
    }
    return wallet;
  }

  async findOne(id: number): Promise<UserWallet> {
    const wallet = await this.userWalletRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    return wallet;
  }

  async update(id: number, updateUserWalletDto: UpdateUserWalletDto): Promise<UserWallet> {
    await this.findOne(id); // 404 if missing
    // Wallet-F2: apply only the provided (non-balance) fields via a targeted UPDATE. A
    // full-entity save() of a stale, unlocked read would rewrite `balance` and clobber
    // a concurrent deposit. `balance` is not in the DTO; strip it defensively too.
    const fields: any = { ...(updateUserWalletDto as any) };
    delete fields.balance;
    if (Object.keys(fields).length > 0) {
      await this.userWalletRepository.update(id, fields);
    }
    return this.findOne(id);
  }

  async addBalance(userId: number, amount: number): Promise<UserWallet> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const wallet = await queryRunner.manager.findOne(UserWallet, {
        where: { user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }
      const currentBalance = parseFloat(wallet.balance.toString());
      const addAmount = parseFloat(amount.toString());
      wallet.balance = currentBalance + addAmount;
      const saved = await queryRunner.manager.save(wallet);
      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deductBalance(userId: number, amount: number): Promise<UserWallet> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const wallet = await queryRunner.manager.findOne(UserWallet, {
        where: { user_id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }
      const currentBalance = parseFloat(wallet.balance.toString());
      const deductAmount = parseFloat(amount.toString());
      if (currentBalance < deductAmount) {
        throw new ConflictException('Insufficient balance');
      }
      wallet.balance = currentBalance - deductAmount;
      const saved = await queryRunner.manager.save(wallet);
      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deduct within a caller-supplied transaction. Locks the wallet row
   * (pessimistic_write), re-checks sufficiency, returns the updated wallet.
   * Lets a debit be atomic with the ledger/status writes that accompany it, so a
   * crash or downstream error rolls the whole thing back (no charge-without-record).
   */
  async deductBalanceTx(manager: EntityManager, userId: number, amount: number): Promise<UserWallet> {
    const amt = parseFloat(amount.toString());
    if (!(amt > 0)) throw new BadRequestException('amount must be greater than 0');
    const wallet = await manager.findOne(UserWallet, {
      where: { user_id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException(`Wallet not found for user ${userId}`);
    const current = parseFloat(wallet.balance.toString());
    if (current < amt) throw new ConflictException('Insufficient balance');
    wallet.balance = current - amt;
    return manager.save(wallet);
  }

  /** Add within a caller-supplied transaction (see deductBalanceTx). */
  async addBalanceTx(manager: EntityManager, userId: number, amount: number): Promise<UserWallet> {
    const amt = parseFloat(amount.toString());
    if (!(amt > 0)) throw new BadRequestException('amount must be greater than 0');
    const wallet = await manager.findOne(UserWallet, {
      where: { user_id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException(`Wallet not found for user ${userId}`);
    const current = parseFloat(wallet.balance.toString());
    wallet.balance = current + amt;
    return manager.save(wallet);
  }

  async getBalance(userId: number): Promise<{ balance: number }> {
    // Kiểm tra và tạo wallet nếu chưa có (sử dụng findByUserId đã có logic tạo wallet)
    const wallet = await this.findByUserId(userId);
    return { balance: wallet.balance };
  }

  async deactivate(id: number): Promise<UserWallet> {
    await this.findOne(id);
    // Wallet-F2: targeted UPDATE of the flag only — never rewrite balance from a stale read.
    await this.userWalletRepository.update(id, { is_active: false });
    return this.findOne(id);
  }

  async activate(id: number): Promise<UserWallet> {
    await this.findOne(id);
    await this.userWalletRepository.update(id, { is_active: true });
    return this.findOne(id);
  }

  async createTransaction(transactionData: {
    wallet_id: number;
    payment_id: string;
    subscription_id?: string | null;
    change_amount: number;
    balance_after: number;
    type?: string;
  }): Promise<WalletTransaction> {
    const transaction = this.walletTransactionRepository.create(transactionData);
    return await this.walletTransactionRepository.save(transaction);
  }
}