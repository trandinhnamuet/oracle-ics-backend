import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CloudPackage } from '../../entities/cloud-package.entity';
import { Payment } from '../../entities/payment.entity';
import * as crypto from 'crypto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTransaction)
    private walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(CloudPackage)
    private cloudPackageRepository: Repository<CloudPackage>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private userWalletService: UserWalletService,
  ) {}

  async create(createSubscriptionDto: CreateSubscriptionDto): Promise<Subscription> {
    // Verify cloud package exists
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: createSubscriptionDto.cloud_package_id, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${createSubscriptionDto.cloud_package_id} not found`);
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (createSubscriptionDto.months_paid || 1));

    const subscription = this.subscriptionRepository.create({
      ...createSubscriptionDto,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
    });

    return await this.subscriptionRepository.save(subscription);
  }

  async createWithAccountBalance(
    userId: number, 
    cloudPackageId: number, 
    autoRenew: boolean = false
  ): Promise<Subscription> {
    // Get cloud package
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: cloudPackageId, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${cloudPackageId} not found`);
    }

    // Get user wallet (sử dụng UserWalletService để auto-create nếu cần)
    const userWallet = await this.userWalletService.findByUserId(userId);

    // Check balance - Convert to number for accurate comparison
    const currentBalance = parseFloat(userWallet.balance.toString());
    const packageCost = parseFloat(cloudPackage.cost_vnd.toString());
    
    console.log('[SubscriptionService][createWithAccountBalance] Balance check:', {
      userId,
      cloudPackageId,
      currentBalance,
      packageCost,
      sufficient: currentBalance >= packageCost
    });

    if (currentBalance < packageCost) {
      throw new BadRequestException('Insufficient balance');
    }

    // Deduct balance using UserWalletService
    const balanceBefore = currentBalance;
    const balanceAfter = balanceBefore - packageCost;
    await this.userWalletService.deductBalance(userId, packageCost);

    // Create wallet transaction với cấu trúc mới
    const paymentId = crypto.randomUUID();

    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: paymentId,
      change_amount: -packageCost, // Negative for debit
      balance_after: balanceAfter,
      type: 'subscription_payment',
    });

    await this.walletTransactionRepository.save(walletTransaction);

    // Create subscription
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const subscription = this.subscriptionRepository.create({
      user_id: userId,
      cloud_package_id: cloudPackageId,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      auto_renew: autoRenew,
      amount_paid: packageCost,
      months_paid: 1,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Save wallet transaction (không cần update reference_id vì đã tạo payment_id)
    await this.walletTransactionRepository.save(walletTransaction);

    return savedSubscription;
  }

  async createWithPayment(
    userId: number,
    cloudPackageId: number,
    monthsCount: number,
    autoRenew: boolean = false
  ): Promise<{ subscription: Subscription; payment: Payment }> {
    // Get cloud package
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: cloudPackageId, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${cloudPackageId} not found`);
    }

    // Calculate total amount
    const totalAmount = cloudPackage.cost_vnd * monthsCount;

    // Generate unique transaction code
    const transactionCode = `SUB${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create payment record
    const payment = this.paymentRepository.create({
      user_id: userId,
      cloud_package_id: cloudPackageId,
      payment_method: 'sepay_qr',
      payment_type: 'subscription',
      amount: totalAmount,
      status: 'pending',
      transaction_code: transactionCode,
      description: `Subscription payment for ${cloudPackage.name} - ${monthsCount} month(s)`,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Create subscription with pending status
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsCount);

    const subscription = this.subscriptionRepository.create({
      user_id: userId,
      cloud_package_id: cloudPackageId,
      start_date: startDate,
      end_date: endDate,
      status: 'pending',
      auto_renew: autoRenew,
      amount_paid: totalAmount,
      months_paid: monthsCount,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Update payment with subscription reference
    savedPayment.subscription_id = savedSubscription.id;
    await this.paymentRepository.save(savedPayment);

    return { subscription: savedSubscription, payment: savedPayment };
  }

  async findAll(): Promise<Subscription[]> {
    try {
      return await this.subscriptionRepository.find({
        relations: {
          user: true,
          cloudPackage: true,
        },
        order: {
          created_at: 'DESC',
        },
      });
    } catch (error) {
      console.error('Error in findAll with relations:', error);
      // Fallback: try with array syntax for older TypeORM versions
      return await this.subscriptionRepository.find({
        relations: ['user', 'cloudPackage'],
        order: {
          created_at: 'DESC',
        },
      });
    }
  }

  async findByUser(userId: number): Promise<Subscription[]> {
    try {
      return await this.subscriptionRepository.find({
        where: { user_id: userId },
        relations: {
          cloudPackage: true,
          vmInstance: true,
        },
        order: {
          created_at: 'DESC',
        },
      });
    } catch (error) {
      console.error('Error in findByUser with relations:', error);
      // Fallback: try with array syntax for older TypeORM versions
      try {
        return await this.subscriptionRepository.find({
          where: { user_id: userId },
          relations: ['cloudPackage', 'vmInstance'],
          order: {
            created_at: 'DESC',
          },
        });
      } catch (fallbackError) {
        console.error('Fallback error in findByUser:', fallbackError);
        // Final fallback: return subscriptions without relations
        return await this.subscriptionRepository.find({
          where: { user_id: userId },
          order: {
            created_at: 'DESC',
          },
        });
      }
    }
  }

  async findOne(id: string): Promise<Subscription> {
    let subscription;
    
    try {
      subscription = await this.subscriptionRepository.findOne({
        where: { id },
        relations: {
          user: true,
          cloudPackage: true,
        },
      });
    } catch (error) {
      console.error('Error in findOne with relations:', error);
      // Fallback: try with array syntax for older TypeORM versions
      subscription = await this.subscriptionRepository.findOne({
        where: { id },
        relations: ['user', 'cloudPackage'],
      });
    }

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return subscription;
  }

  async update(id: string, updateSubscriptionDto: UpdateSubscriptionDto): Promise<Subscription> {
    const subscription = await this.findOne(id);
    
    Object.assign(subscription, updateSubscriptionDto);
    
    return await this.subscriptionRepository.save(subscription);
  }

  async cancel(id: string): Promise<Subscription> {
    const subscription = await this.findOne(id);
    subscription.status = 'cancelled';
    return await this.subscriptionRepository.save(subscription);
  }

  async suspend(id: string): Promise<Subscription> {
    const subscription = await this.findOne(id);
    subscription.status = 'suspended';
    return await this.subscriptionRepository.save(subscription);
  }

  async reactivate(id: string): Promise<Subscription> {
    const subscription = await this.findOne(id);
    subscription.status = 'active';
    return await this.subscriptionRepository.save(subscription);
  }

  async checkExpiredSubscriptions(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: 'active',
      },
      relations: ['cloudPackage'],
    });

    for (const subscription of expiredSubscriptions) {
      if (subscription.end_date < today) {
        if (subscription.auto_renew) {
          await this.attemptAutoRenewal(subscription);
        } else {
          subscription.status = 'expired';
          await this.subscriptionRepository.save(subscription);
        }
      }
    }
  }

  private async attemptAutoRenewal(subscription: Subscription): Promise<void> {
    try {
      // Get user wallet (sử dụng UserWalletService để auto-create nếu cần)
      const userWallet = await this.userWalletService.findByUserId(subscription.user_id);

      // Convert to number for accurate comparison
      const currentBalance = parseFloat(userWallet.balance.toString());
      const packageCost = parseFloat(subscription.cloudPackage.cost_vnd.toString());

      if (currentBalance < packageCost) {
        // Insufficient balance, expire subscription
        subscription.status = 'expired';
        await this.subscriptionRepository.save(subscription);
        return;
      }

      // Deduct balance using UserWalletService
      const balanceBefore = currentBalance;
      const balanceAfter = balanceBefore - packageCost;
      await this.userWalletService.deductBalance(subscription.user_id, packageCost);

      // Create wallet transaction với cấu trúc mới
      const renewalPaymentId = crypto.randomUUID();
      const walletTransaction = this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: renewalPaymentId,
        change_amount: -packageCost, // Negative for debit
        balance_after: balanceAfter,
        type: 'auto_renewal',
      });

      await this.walletTransactionRepository.save(walletTransaction);

      // Extend end date by 1 month
      const newEndDate = new Date(subscription.end_date);
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      subscription.end_date = newEndDate;

      await this.subscriptionRepository.save(subscription);
    } catch (error) {
      // If renewal fails, expire subscription
      subscription.status = 'expired';
      await this.subscriptionRepository.save(subscription);
    }
  }

  async remove(id: string): Promise<void> {
    const subscription = await this.findOne(id);
    
    // Optionally, you might want to add business logic here
    // For example, prevent deletion of active subscriptions
    // or refund logic for cancelled subscriptions
    
    await this.subscriptionRepository.remove(subscription);
  }
}