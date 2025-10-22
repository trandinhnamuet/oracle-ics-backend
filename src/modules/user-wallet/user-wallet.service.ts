import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CreateUserWalletDto } from './dto/create-user-wallet.dto';
import { UpdateUserWalletDto } from './dto/update-user-wallet.dto';

// Cache để track việc tạo wallet đang diễn ra
const creatingWallets = new Set<number>();

@Injectable()
export class UserWalletService {
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
    // Kiểm tra xem đang có process nào tạo wallet cho user này không
    if (creatingWallets.has(userId)) {
      // Đợi một chút và thử lại
      await new Promise(resolve => setTimeout(resolve, 100));
      return await this.findByUserId(userId);
    }
    
    // Tìm wallet trước
    let wallet = await this.userWalletRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });
    
    if (wallet) {
      return wallet;
    }
    
    // Nếu không có wallet, đánh dấu đang tạo
    creatingWallets.add(userId);
    
    try {
      // Kiểm tra lại một lần nữa để chắc chắn
      wallet = await this.userWalletRepository.findOne({
        where: { user_id: userId },
        relations: ['user'],
      });
      
      if (wallet) {
        return wallet;
      }
      
      // Tạo wallet mới
      console.log(`Creating new wallet for user ${userId}`);
      const newWallet = await this.create({ user_id: userId });
      
      // Load lại với relations
      wallet = await this.userWalletRepository.findOne({
        where: { user_id: userId },
        relations: ['user'],
      });
      
      if (!wallet) {
        throw new Error(`Failed to create or find wallet for user ${userId}`);
      }
      
      return wallet;
    } finally {
      // Xóa khỏi cache tạo wallet
      creatingWallets.delete(userId);
    }
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
    const wallet = await this.findOne(id);
    
    Object.assign(wallet, updateUserWalletDto);
    
    return await this.userWalletRepository.save(wallet);
  }

  async updateBalance(userId: number, newBalance: number): Promise<UserWallet> {
    // Kiểm tra và tạo wallet nếu chưa có (sử dụng findByUserId đã có logic tạo wallet)
    const wallet = await this.findByUserId(userId);
    wallet.balance = parseFloat(newBalance.toString());
    return await this.userWalletRepository.save(wallet);
  }

  async addBalance(userId: number, amount: number): Promise<UserWallet> {
    // Kiểm tra và tạo wallet nếu chưa có (sử dụng findByUserId đã có logic tạo wallet)
    const wallet = await this.findByUserId(userId);
    const currentBalance = parseFloat(wallet.balance.toString());
    const addAmount = parseFloat(amount.toString());
    wallet.balance = currentBalance + addAmount;
    return await this.userWalletRepository.save(wallet);
  }

  async deductBalance(userId: number, amount: number): Promise<UserWallet> {
    // Kiểm tra và tạo wallet nếu chưa có (sử dụng findByUserId đã có logic tạo wallet)
    const wallet = await this.findByUserId(userId);
    
    const currentBalance = parseFloat(wallet.balance.toString());
    const deductAmount = parseFloat(amount.toString());
    
    if (currentBalance < deductAmount) {
      throw new ConflictException('Insufficient balance');
    }
    
    wallet.balance = currentBalance - deductAmount;
    return await this.userWalletRepository.save(wallet);
  }

  async getBalance(userId: number): Promise<{ balance: number }> {
    // Kiểm tra và tạo wallet nếu chưa có (sử dụng findByUserId đã có logic tạo wallet)
    const wallet = await this.findByUserId(userId);
    return { balance: wallet.balance };
  }

  async deactivate(id: number): Promise<UserWallet> {
    const wallet = await this.findOne(id);
    wallet.is_active = false;
    return await this.userWalletRepository.save(wallet);
  }

  async activate(id: number): Promise<UserWallet> {
    const wallet = await this.findOne(id);
    wallet.is_active = true;
    return await this.userWalletRepository.save(wallet);
  }

  async createTransaction(transactionData: {
    wallet_id: number;
    payment_id: string;
    change_amount: number;
    balance_after: number;
    type?: string;
  }): Promise<WalletTransaction> {
    const transaction = this.walletTransactionRepository.create(transactionData);
    return await this.walletTransactionRepository.save(transaction);
  }
}