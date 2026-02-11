import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CloudPackage } from '../../entities/cloud-package.entity';
import { Payment } from '../../entities/payment.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { VmActionsLog } from '../../entities/vm-actions-log.entity';
import * as crypto from 'crypto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { OciService } from '../oci/oci.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

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
    @InjectRepository(VmInstance)
    private vmInstanceRepository: Repository<VmInstance>,
    @InjectRepository(VmActionsLog)
    private vmActionsLogRepository: Repository<VmActionsLog>,
    private userWalletService: UserWalletService,
    private ociService: OciService,
    @InjectDataSource()
    private dataSource: DataSource,
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

  async findAll(queryParams?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    status?: string;
    userId?: number;
    startDate?: string;
    endDate?: string;
    searchTerm?: string;
  }): Promise<{
    data: Subscription[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = queryParams?.page || 1;
      const limit = queryParams?.limit || 20;
      const sortBy = queryParams?.sortBy || 'created_at';
      const sortOrder = queryParams?.sortOrder || 'DESC';
      const skip = (page - 1) * limit;

      // Build query
      const queryBuilder = this.subscriptionRepository
        .createQueryBuilder('subscription')
        .leftJoinAndSelect('subscription.user', 'user')
        .leftJoinAndSelect('subscription.cloudPackage', 'cloudPackage')
        .leftJoinAndSelect('subscription.vmInstance', 'vmInstance');

      // Apply filters
      if (queryParams?.status) {
        queryBuilder.andWhere('subscription.status = :status', { status: queryParams.status });
      }

      if (queryParams?.userId) {
        queryBuilder.andWhere('subscription.user_id = :userId', { userId: queryParams.userId });
      }

      if (queryParams?.startDate) {
        queryBuilder.andWhere('subscription.start_date >= :startDate', { startDate: queryParams.startDate });
      }

      if (queryParams?.endDate) {
        queryBuilder.andWhere('subscription.end_date <= :endDate', { endDate: queryParams.endDate });
      }

      if (queryParams?.searchTerm) {
        queryBuilder.andWhere(
          '(CAST(subscription.id AS TEXT) ILIKE :searchTerm OR ' +
          'CAST(subscription.user_id AS TEXT) ILIKE :searchTerm OR ' +
          'user.email ILIKE :searchTerm OR ' +
          'user.firstName ILIKE :searchTerm OR ' +
          'user.lastName ILIKE :searchTerm OR ' +
          'cloudPackage.name ILIKE :searchTerm)',
          { searchTerm: `%${queryParams.searchTerm}%` }
        );
      }

      // Apply sorting
      if (sortBy === 'user_id') {
        queryBuilder.orderBy('subscription.user_id', sortOrder);
      } else if (sortBy === 'cloud_package_id') {
        queryBuilder.orderBy('subscription.cloud_package_id', sortOrder);
      } else if (sortBy === 'start_date') {
        queryBuilder.orderBy('subscription.start_date', sortOrder);
      } else if (sortBy === 'end_date') {
        queryBuilder.orderBy('subscription.end_date', sortOrder);
      } else if (sortBy === 'status') {
        queryBuilder.orderBy('subscription.status', sortOrder);
      } else {
        queryBuilder.orderBy(`subscription.${sortBy}`, sortOrder);
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply pagination
      queryBuilder.skip(skip).take(limit);

      // Execute query
      const data = await queryBuilder.getMany();

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Error in findAll with pagination:', error);
      // Fallback: return basic result
      const subscriptions = await this.subscriptionRepository.find({
        relations: ['user', 'cloudPackage', 'vmInstance'],
        order: {
          created_at: 'DESC',
        },
        take: queryParams?.limit || 20,
      });

      return {
        data: subscriptions,
        total: subscriptions.length,
        page: 1,
        limit: queryParams?.limit || 20,
        totalPages: 1,
      };
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
    this.logger.log(`Starting deletion of subscription ${id}`);
    
    // Load subscription with all details
    const subscription = await this.findOne(id);
    
    // Step 1: Delete VM instance if exists
    if (subscription.vm_instance_id) {
      this.logger.log(`Subscription has VM instance (ID: ${subscription.vm_instance_id}), proceeding with VM deletion...`);
      
      try {
        // Load VM instance details
        const vmInstance = await this.vmInstanceRepository.findOne({
          where: { id: subscription.vm_instance_id },
        });

        if (vmInstance) {
          this.logger.log(`Found VM instance: ${vmInstance.instance_name} (OCI ID: ${vmInstance.instance_id})`);
          
          // 1a. Terminate VM on Oracle Cloud if it exists and is not already terminated
          if (vmInstance.instance_id && vmInstance.instance_id !== 'PENDING') {
            try {
              this.logger.log(`Terminating VM instance on OCI: ${vmInstance.instance_id}`);
              await this.ociService.terminateInstance(vmInstance.instance_id, false);
              this.logger.log(`✅ VM instance terminated on OCI successfully`);
            } catch (ociError) {
              // Log error but continue with database cleanup
              // VM might already be terminated or not exist in OCI
              this.logger.warn(`Failed to terminate VM on OCI (may already be terminated): ${ociError.message}`);
            }
          } else {
            this.logger.log(`VM instance ID is PENDING, skipping OCI termination`);
          }

          // 1b. Delete VM actions logs
          try {
            const deletedLogs = await this.vmActionsLogRepository.delete({
              vm_instance_id: vmInstance.id,
            });
            this.logger.log(`✅ Deleted ${deletedLogs.affected || 0} VM action logs`);
          } catch (logError) {
            this.logger.warn(`Failed to delete VM action logs: ${logError.message}`);
          }

          // 1c. Delete bandwidth_logs records (to avoid foreign key constraint)
          try {
            const deletedBandwidth = await this.dataSource.query(
              'DELETE FROM oracle.bandwidth_logs WHERE vm_instance_id = $1',
              [vmInstance.id]
            );
            this.logger.log(`✅ Deleted bandwidth logs for VM instance ${vmInstance.id}`);
          } catch (bandwidthError) {
            this.logger.warn(`Failed to delete bandwidth logs: ${bandwidthError.message}`);
          }

          // 1d. Delete VM instance record from database
          await this.vmInstanceRepository.remove(vmInstance);
          this.logger.log(`✅ VM instance deleted from database`);
        } else {
          this.logger.warn(`VM instance with ID ${subscription.vm_instance_id} not found in database`);
        }
      } catch (vmError) {
        this.logger.error(`Error deleting VM instance: ${vmError.message}`);
        // Continue with subscription deletion even if VM deletion fails
      }
    } else {
      this.logger.log(`Subscription has no VM instance, skipping VM deletion`);
    }

    // Step 2: Delete related payment records (optional - mark as deleted or keep for history)
    try {
      const payments = await this.paymentRepository.find({
        where: { subscription_id: subscription.id },
      });
      
      if (payments.length > 0) {
        this.logger.log(`Found ${payments.length} payment records for subscription`);
        // Option 1: Delete payments (uncomment if you want to delete)
        // await this.paymentRepository.remove(payments);
        // Option 2: Mark as deleted (keep for audit trail)
        for (const payment of payments) {
          payment.status = 'deleted';
        }
        await this.paymentRepository.save(payments);
        this.logger.log(`✅ Marked ${payments.length} payment records as deleted`);
      }
    } catch (paymentError) {
      this.logger.warn(`Failed to handle payment records: ${paymentError.message}`);
    }

    // Step 3: Delete wallet transactions related to this subscription (optional)
    // Note: This is risky as it might affect user's transaction history
    // Consider marking as deleted instead of actual deletion
    try {
      const walletTransactions = await this.walletTransactionRepository
        .createQueryBuilder('wt')
        .innerJoin('oracle.payments', 'p', 'p.id = wt.payment_id')
        .where('p.subscription_id = :subscriptionId', { subscriptionId: subscription.id })
        .getMany();
      
      if (walletTransactions.length > 0) {
        this.logger.log(`Found ${walletTransactions.length} wallet transactions for subscription`);
        // Keep wallet transactions for audit trail - don't delete
        this.logger.log(`Keeping wallet transactions for audit trail`);
      }
    } catch (walletError) {
      this.logger.warn(`Failed to check wallet transactions: ${walletError.message}`);
    }

    // Step 4: Finally, delete the subscription
    await this.subscriptionRepository.remove(subscription);
    this.logger.log(`✅ Subscription ${id} deleted successfully`);
  }
}