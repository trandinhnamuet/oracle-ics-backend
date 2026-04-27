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
import * as fs from 'fs';
import * as path from 'path';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { OciService } from '../oci/oci.service';
import { BandwidthService } from '../bandwidth/bandwidth.service';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly pendingDeletionTimers = new Map<string, NodeJS.Timeout>();
  /** Guard chống cron chạy đè nhau: nếu lần trước chưa xong thì bỏ qua run mới */
  private isRenewalRunning = false;

  /** Ghi log chi tiết vào file logs/subscription-renewal.log để dễ debug */
  private appendRenewalLog(message: string): void {
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'subscription-renewal.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `[${ts}] ${message}\n`, 'utf8');
    } catch (_) {
      // Không để lỗi log file làm ảnh hưởng logic chính
    }
  }

  /**
   * Normalize a Date to the very end of that calendar day (23:59:59.999).
   * This ensures billing cycles are always measured in full days, independent
   * of what time the subscription was purchased.
   */
  private toEndOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

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
    private bandwidthService: BandwidthService,
    @InjectDataSource()
    private dataSource: DataSource,
    private notificationService: NotificationService,
  ) {}

  async create(createSubscriptionDto: CreateSubscriptionDto): Promise<Subscription> {
    // Verify cloud package exists
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: createSubscriptionDto.cloud_package_id, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${createSubscriptionDto.cloud_package_id} not found`);
    }

    // Calculate dates — end_date is always the end of the last day of the billing cycle
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (createSubscriptionDto.months_paid || 1));
    const normalizedEndDate = this.toEndOfDay(endDate);

    const subscription = this.subscriptionRepository.create({
      ...createSubscriptionDto,
      start_date: startDate,
      end_date: normalizedEndDate,
      status: 'active',
    });

    return await this.subscriptionRepository.save(subscription);
  }

  async createWithAccountBalance(
    userId: number, 
    cloudPackageId: number, 
    monthsCount: number = 1,
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

    if (!Number.isFinite(monthsCount) || monthsCount < 1 || monthsCount > 24) {
      throw new BadRequestException('monthsCount must be between 1 and 24');
    }

    // Check balance - Convert to number for accurate comparison
    const currentBalance = parseFloat(userWallet.balance.toString());
    const packageCost = parseFloat(cloudPackage.cost_vnd.toString()) * monthsCount;
    
    this.logger.log(
      `[createWithAccountBalance] Balance check userId=${userId} cloudPackageId=${cloudPackageId} monthsCount=${monthsCount} currentBalance=${currentBalance} packageCost=${packageCost} sufficient=${currentBalance >= packageCost}`,
    );

    if (currentBalance < packageCost) {
      throw new BadRequestException('Insufficient balance');
    }

    // Deduct balance using UserWalletService
    const balanceBefore = currentBalance;
    const balanceAfter = balanceBefore - packageCost;
    await this.userWalletService.deductBalance(userId, packageCost);

    // Create subscription first so we have its ID for the wallet transaction
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsCount);

    const subscription = this.subscriptionRepository.create({
      user_id: userId,
      cloud_package_id: cloudPackageId,
      start_date: startDate,
      end_date: this.toEndOfDay(endDate),
      status: 'active',
      auto_renew: autoRenew,
      amount_paid: packageCost,
      months_paid: monthsCount,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Create wallet transaction — payment_id is null (no Payment record for account_balance),
    // subscription_id links this debit to the subscription it paid for
    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: null,
      subscription_id: savedSubscription.id,
      change_amount: -packageCost, // Negative for debit
      balance_after: balanceAfter,
      type: 'subscription_payment',
    });

    await this.walletTransactionRepository.save(walletTransaction);

    // Không tạo Payment record cho phương thức account_balance vì tiền đã có sẵn trong hệ thống.
    // Payment chỉ ghi nhận các giao dịch tiền đi vào hệ thống (nạp tiền, QR, chuyển khoản).

    // Notify user: subscription created (no separate wallet debit notification)
    const fmtCost = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(packageCost);
    const fmtEnd = new Date(savedSubscription.end_date).toLocaleDateString('vi-VN');
    const fmtEndEn = new Date(savedSubscription.end_date).toLocaleDateString('en-US');
    await this.notificationService.notify(
      userId,
      NotificationType.SUBSCRIPTION_CREATED,
      '🚀 Đăng ký gói dịch vụ thành công',
      `Gói "${cloudPackage.name}" đã được kích hoạt đến ${fmtEnd} (${monthsCount} tháng). Đã trừ ${fmtCost} từ ví của bạn.`,
      { subscription_id: savedSubscription.id, package_name: cloudPackage.name, amount: packageCost, months_paid: monthsCount, end_date: savedSubscription.end_date },
      '🚀 Subscription activated',
      `"${cloudPackage.name}" is now active until ${fmtEndEn} (${monthsCount} month(s)). ${fmtCost} was deducted from your wallet.`,
    );

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

    // Create subscription with pending status — end_date is always the end of the last day of the billing cycle
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsCount);

    const subscription = this.subscriptionRepository.create({
      user_id: userId,
      cloud_package_id: cloudPackageId,
      start_date: startDate,
      end_date: this.toEndOfDay(endDate),
      status: 'pending',
      auto_renew: autoRenew,
      amount_paid: totalAmount,
      months_paid: monthsCount,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Update payment with subscription reference
    savedPayment.subscription_id = savedSubscription.id;
    await this.paymentRepository.save(savedPayment);

    // Schedule auto-deletion if payment is not completed within 10 minutes
    this.schedulePendingDeletion(savedSubscription.id);

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

      if (queryParams?.startDate && !queryParams?.endDate) {
        // Only start date selected → exact day match on start_date
        queryBuilder.andWhere("DATE(subscription.start_date) = DATE(:startDate)", { startDate: queryParams.startDate });
      } else if (queryParams?.startDate) {
        queryBuilder.andWhere('subscription.start_date >= :startDate', { startDate: queryParams.startDate });
      }

      if (queryParams?.endDate && !queryParams?.startDate) {
        // Only end date selected → exact day match on end_date
        queryBuilder.andWhere("DATE(subscription.end_date) = DATE(:endDate)", { endDate: queryParams.endDate });
      } else if (queryParams?.endDate) {
        queryBuilder.andWhere('subscription.end_date <= :endDate', { endDate: queryParams.endDate });
      }

      if (queryParams?.searchTerm) {
        const tokens = queryParams.searchTerm.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 1) {
          // Single token: search across all fields including ID and package name
          queryBuilder.andWhere(
            '(CAST(subscription.id AS TEXT) ILIKE :st0 OR ' +
            'CAST(subscription.user_id AS TEXT) ILIKE :st0 OR ' +
            'user.email ILIKE :st0 OR ' +
            'user.firstName ILIKE :st0 OR ' +
            'user.lastName ILIKE :st0 OR ' +
            'cloudPackage.name ILIKE :st0 OR ' +
            'vmInstance.instance_name ILIKE :st0 OR ' +
            'vmInstance.public_ip ILIKE :st0)',
            { st0: `%${tokens[0]}%` }
          );
        } else {
          // Multiple tokens: each token must appear in at least one name/email/package field.
          // This handles full-name searches with spaces (e.g. "Nguyen Ann") without relying
          // on CONCAT which TypeORM does not reliably map inside SQL function arguments.
          tokens.forEach((token, idx) => {
            const p = `st${idx}`;
            queryBuilder.andWhere(
              `(user.email ILIKE :${p} OR user.firstName ILIKE :${p} OR user.lastName ILIKE :${p} OR cloudPackage.name ILIKE :${p} OR vmInstance.instance_name ILIKE :${p} OR vmInstance.public_ip ILIKE :${p})`,
              { [p]: `%${token}%` }
            );
          });
        }
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
      this.logger.error('Error in findByUser with relations', error?.stack || error?.message || error);
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
        this.logger.error('Fallback error in findByUser', fallbackError?.stack || fallbackError?.message || fallbackError);
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
      this.logger.error('Error in findOne with relations', error?.stack || error?.message || error);
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

  /**
   * Manual renewal of an expired subscription by the user.
   * Deducts the package cost from the wallet, resets status to active,
   * extends end_date by 1 month, and starts the VM if present.
   */
  async manualRenew(id: string, userId: number): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id, user_id: userId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status !== 'expired') {
      throw new BadRequestException('Only expired subscriptions can be manually renewed');
    }

    const userWallet = await this.userWalletService.findByUserId(userId);
    const currentBalance = parseFloat(userWallet.balance.toString());
    const packageCost = parseFloat(subscription.cloudPackage.cost_vnd.toString());

    if (currentBalance < packageCost) {
      throw new BadRequestException(
        'Bạn không đủ tiền trong tài khoản để gia hạn, xin hãy nạp thêm',
      );
    }

    // Deduct wallet
    const balanceBefore = currentBalance;
    const balanceAfter = balanceBefore - packageCost;
    await this.userWalletService.deductBalance(userId, packageCost);

    // payment_id is null — manual renewal debits from wallet, no Payment record exists
    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: null,
      subscription_id: subscription.id,
      change_amount: -packageCost,
      balance_after: balanceAfter,
      type: 'manual_renewal',
    });
    await this.walletTransactionRepository.save(walletTransaction);

    // Extend end_date by 1 month from today (not from expired end_date) and normalize to end-of-day
    const newEndDate = new Date();
    newEndDate.setMonth(newEndDate.getMonth() + 1);
    subscription.end_date = this.toEndOfDay(newEndDate);
    subscription.status = 'active';
    await this.subscriptionRepository.save(subscription);

    // Start VM if configured
    if (subscription.vm_instance_id) {
      try {
        const vm = await this.vmInstanceRepository.findOne({
          where: { id: subscription.vm_instance_id },
        });
        if (vm && vm.instance_id && vm.instance_id !== 'PENDING' &&
            !['RUNNING', 'STARTING'].includes(vm.lifecycle_state)) {
          await this.ociService.startInstance(vm.instance_id);
          vm.lifecycle_state = 'STARTING';
          await this.vmInstanceRepository.save(vm);
        }
      } catch (vmError) {
        this.logger.warn(`[ManualRenew] Failed to start VM for subscription ${id}: ${vmError.message}`);
      }
    }

    // Send notifications
    const pkgName = subscription.cloudPackage?.name ?? `#${subscription.cloud_package_id}`;
    const fmtCost = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(packageCost);
    const fmtEnd = subscription.end_date.toLocaleDateString('vi-VN');
    const fmtEndEn = subscription.end_date.toLocaleDateString('en-US');

    await this.notificationService.notify(
      userId,
      NotificationType.SUBSCRIPTION_RENEWED,
      '✅ Gói dịch vụ đã được gia hạn',
      `Gói "${pkgName}" đã được gia hạn đến ${fmtEnd}. Đã trừ ${fmtCost} từ ví của bạn.`,
      { subscription_id: subscription.id, package_name: pkgName, amount: packageCost, new_end_date: subscription.end_date },
      '✅ Subscription renewed',
      `"${pkgName}" was renewed until ${fmtEndEn}. ${fmtCost} was deducted from your wallet.`,
    );
    await this.notificationService.notify(
      userId,
      NotificationType.WALLET_DEBIT,
      '💸 Ví bị trừ tiền',
      `Đã trừ ${fmtCost} để gia hạn gói "${pkgName}". Số dư còn lại: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balanceAfter)}.`,
      { amount: packageCost, balance_after: balanceAfter, subscription_id: subscription.id },
      '💸 Wallet debited',
      `${fmtCost} was deducted to renew "${pkgName}". Remaining balance: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balanceAfter)}.`,
    );

    return subscription;
  }

  /**
   * Schedule auto-deletion of a pending subscription after `delayMs` (default 10 minutes).
   * If the subscription is paid before the timer fires, the check inside will skip deletion.
   */
  schedulePendingDeletion(subscriptionId: string, delayMs = 30 * 60 * 1000): void {
    // Cancel any existing timer for this subscription
    const existing = this.pendingDeletionTimers.get(subscriptionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.pendingDeletionTimers.delete(subscriptionId);
      try {
        const sub = await this.subscriptionRepository.findOne({ where: { id: subscriptionId } });
        if (!sub || sub.status !== 'pending') {
          this.logger.log(`[PendingCleanup] Subscription ${subscriptionId} is no longer pending — skipping auto-deletion`);
          return;
        }
        this.logger.log(`[PendingCleanup] Auto-deleting pending subscription ${subscriptionId} after ${delayMs / 1000}s timeout`);
        await this.remove(subscriptionId);
        this.logger.log(`[PendingCleanup] ✅ Subscription ${subscriptionId} deleted`);
      } catch (err) {
        this.logger.error(`[PendingCleanup] Failed to auto-delete subscription ${subscriptionId}:`, err.message);
      }
    }, delayMs);

    this.pendingDeletionTimers.set(subscriptionId, timer);
    this.logger.log(`[PendingCleanup] Scheduled auto-deletion for subscription ${subscriptionId} in ${delayMs / 60000} min`);
  }

  /**
   * Safety net: on startup, clean up any pending subscriptions older than 10 minutes
   * that lost their timer due to a backend restart.
   */
  async cleanupStalePending(delayMs = 30 * 60 * 1000): Promise<void> {
    const cutoff = new Date(Date.now() - delayMs);
    const stale = await this.subscriptionRepository
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'pending' })
      .andWhere('s.created_at < :cutoff', { cutoff })
      .getMany();

    if (stale.length === 0) {
      this.logger.log('[PendingCleanup] No stale pending subscriptions found on startup');
      return;
    }

    this.logger.log(`[PendingCleanup] Found ${stale.length} stale pending subscription(s) to clean up on startup`);
    for (const sub of stale) {
      // Skip ones already managed by an in-memory timer
      if (this.pendingDeletionTimers.has(sub.id)) continue;
      try {
        await this.remove(sub.id);
        this.logger.log(`[PendingCleanup] ✅ Deleted stale pending subscription ${sub.id}`);
      } catch (err) {
        this.logger.error(`[PendingCleanup] Failed to delete stale pending subscription ${sub.id}:`, err.message);
      }
    }
  }

  async checkExpiredSubscriptions(): Promise<void> {
    // Ngăn chạy đồng thời: nếu lần trước chưa xong thì bỏ qua
    if (this.isRenewalRunning) {
      this.appendRenewalLog(`[SKIP] checkExpiredSubscriptions đang bận từ lần chạy trước, bỏ qua run này.`);
      return;
    }
    this.isRenewalRunning = true;
    try {
    const now = new Date();
    this.appendRenewalLog(`===== BẮT ĐẦU KIỂM TRA SUBSCRIPTION =====`);
    this.appendRenewalLog(`Thời điểm kiểm tra (now): ${now.toISOString()}`);

    // Quét cả active lẫn expired có auto_renew=true để retry gia hạn
    let allCandidates: Subscription[];
    try {
      const [active, expiredAutoRenew] = await Promise.all([
        this.subscriptionRepository.find({
          where: { status: 'active' },
          relations: ['cloudPackage'],
        }),
        this.subscriptionRepository.find({
          where: { status: 'expired', auto_renew: true },
          relations: ['cloudPackage'],
        }),
      ]);
      allCandidates = [...active, ...expiredAutoRenew];
    } catch (dbErr: any) {
      this.appendRenewalLog(`LỖI truy vấn DB: ${dbErr?.message ?? dbErr}`);
      return;
    }

    this.appendRenewalLog(`Tổng số subscription cần kiểm tra: ${allCandidates.length} (active + expired có auto_renew)`);

    let countChecked = 0;
    let countExpiredNoRenew = 0;
    let countAutoRenew = 0;
    let countNotYetExpired = 0;

    for (const subscription of allCandidates) {
      const endDateRaw = subscription.end_date;
      const endDate = new Date(endDateRaw);
      const isExpired = endDate < now;

      countChecked++;
      this.appendRenewalLog(
        `  [${countChecked}] id=${subscription.id} | user_id=${subscription.user_id}` +
        ` | pkg=${subscription.cloudPackage?.name ?? subscription.cloud_package_id}` +
        ` | end_date_raw=${endDateRaw} (type=${typeof endDateRaw})` +
        ` | end_date_parsed=${endDate.toISOString()}` +
        ` | is_expired=${isExpired}` +
        ` | auto_renew=${subscription.auto_renew}`,
      );

      if (isExpired) {
        if (subscription.auto_renew) {
          countAutoRenew++;
          this.appendRenewalLog(`    → Gọi attemptAutoRenewal cho subscription ${subscription.id}`);
          await this.attemptAutoRenewal(subscription);
        } else {
          countExpiredNoRenew++;
          this.appendRenewalLog(`    → Đánh dấu EXPIRED (không có auto_renew)`);
          subscription.status = 'expired';
          await this.subscriptionRepository.save(subscription);

          const pkgName = subscription.cloudPackage?.name ?? `#${subscription.cloud_package_id}`;
          await this.notificationService.notify(
            subscription.user_id,
            NotificationType.SUBSCRIPTION_EXPIRED,
            '⚠️ Gói dịch vụ đã hết hạn',
            `Gói "${pkgName}" của bạn đã hết hạn. Hãy đăng ký lại để tiếp tục sử dụng dịch vụ.`,
            { subscription_id: subscription.id, package_name: pkgName },
            '⚠️ Subscription expired',
            `Your "${pkgName}" plan has expired. Subscribe again to continue using the service.`,
          );
        }
      } else {
        countNotYetExpired++;
      }
    }

    this.appendRenewalLog(
      `===== KẾT THÚC KIỂM TRA =====` +
      ` | Tổng=${countChecked}` +
      ` | Chưa hết hạn=${countNotYetExpired}` +
      ` | Hết hạn không gia hạn=${countExpiredNoRenew}` +
      ` | Đã gọi auto_renew=${countAutoRenew}`,
    );
    } finally {
      this.isRenewalRunning = false;
    }
  }

  private async attemptAutoRenewal(subscription: Subscription): Promise<void> {
    const subId = subscription.id;
    const pkgName = subscription.cloudPackage?.name ?? `#${subscription.cloud_package_id}`;
    this.appendRenewalLog(`    [AutoRenew START] sub=${subId} | pkg=${pkgName} | user=${subscription.user_id}`);

    try {
      const userWallet = await this.userWalletService.findByUserId(subscription.user_id);
      const currentBalance = parseFloat(userWallet.balance.toString());
      const packageCost = parseFloat(subscription.cloudPackage.cost_vnd.toString());

      this.appendRenewalLog(
        `    [AutoRenew] wallet_id=${userWallet.id} | balance=${currentBalance} | cost=${packageCost} | sufficient=${currentBalance >= packageCost}`,
      );

      if (currentBalance < packageCost) {
        subscription.status = 'expired';
        await this.subscriptionRepository.save(subscription);
        this.appendRenewalLog(`    [AutoRenew FAIL] Số dư không đủ → đánh dấu EXPIRED | sub=${subId}`);

        await this.notificationService.notify(
          subscription.user_id,
          NotificationType.SUBSCRIPTION_EXPIRED,
          '⚠️ Gói dịch vụ đã hết hạn',
          `Gói "${pkgName}" đã hết hạn do số dư ví không đủ để gia hạn tự động.`,
          { subscription_id: subId },
          '⚠️ Subscription expired',
          `Your "${pkgName}" plan expired due to insufficient wallet balance for automatic renewal.`,
        );
        return;
      }

      const balanceBefore = currentBalance;
      const balanceAfter = balanceBefore - packageCost;
      await this.userWalletService.deductBalance(subscription.user_id, packageCost);
      this.appendRenewalLog(`    [AutoRenew] Đã trừ ví: ${balanceBefore} → ${balanceAfter}`);

      const walletTransaction = this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: null, // auto-renewal không liên quan đến Payment record
        subscription_id: subscription.id,
        change_amount: -packageCost,
        balance_after: balanceAfter,
        type: 'auto_renewal',
      });
      await this.walletTransactionRepository.save(walletTransaction);
      this.appendRenewalLog(`    [AutoRenew] Đã tạo wallet_transaction id=${walletTransaction.id}`);

      const prevEndDate = new Date(subscription.end_date);
      const newEndDate = new Date(prevEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      subscription.end_date = this.toEndOfDay(newEndDate);
      subscription.status = 'active';
      await this.subscriptionRepository.save(subscription);

      this.appendRenewalLog(
        `    [AutoRenew SUCCESS] sub=${subId} | end_date cũ=${prevEndDate.toISOString()} | end_date mới=${subscription.end_date.toISOString()}`,
      );

      const fmtCost = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(packageCost);
      const fmtEnd = subscription.end_date.toLocaleDateString('vi-VN');
      const fmtEndEn = subscription.end_date.toLocaleDateString('en-US');
      await this.notificationService.notify(
        subscription.user_id,
        NotificationType.SUBSCRIPTION_RENEWED,
        '✅ Gói dịch vụ đã được gia hạn',
        `Gói "${pkgName}" đã được tự động gia hạn đến ${fmtEnd}. Đã trừ ${fmtCost} từ ví của bạn.`,
        { subscription_id: subId, package_name: pkgName, amount: packageCost, new_end_date: subscription.end_date },
        '✅ Subscription renewed',
        `"${pkgName}" was automatically renewed until ${fmtEndEn}. ${fmtCost} was deducted from your wallet.`,
      );
      await this.notificationService.notify(
        subscription.user_id,
        NotificationType.WALLET_DEBIT,
        '💸 Ví bị trừ tiền',
        `Đã trừ ${fmtCost} để gia hạn gói "${pkgName}". Số dư còn lại: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balanceAfter)}.`,
        { amount: packageCost, balance_after: balanceAfter, subscription_id: subId },
        '💸 Wallet debited',
        `${fmtCost} was deducted to renew "${pkgName}". Remaining balance: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balanceAfter)}.`,
      );
    } catch (error: any) {
      this.appendRenewalLog(
        `    [AutoRenew ERROR] sub=${subId} | ${error?.message ?? error}\n    Stack: ${error?.stack ?? ''}`,
      );
      // Nếu gia hạn thất bại vì lý do không mong muốn, đánh dấu expired
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

          // 1c. Archive current month's bandwidth before deleting VM
          try {
            const now = new Date();
            const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            await this.bandwidthService.archiveMonthlyBandwidth(vmInstance, currentYearMonth);
            this.logger.log(`✅ Archived bandwidth snapshot for VM ${vmInstance.id} / ${currentYearMonth}`);
          } catch (archiveError) {
            this.logger.warn(`Failed to archive bandwidth before delete: ${archiveError.message}`);
          }

          // 1d. Preserve bandwidth_monthly_snapshots compartment_id
          try {
            if (vmInstance.compartment_id) {
              await this.dataSource.query(
                `UPDATE oracle.bandwidth_monthly_snapshots
                 SET compartment_id = $1
                 WHERE vm_instance_id = $2 AND compartment_id IS NULL`,
                [vmInstance.compartment_id, vmInstance.id],
              );
              this.logger.log(`✅ Preserved bandwidth snapshot compartment_id for VM ${vmInstance.id}`);
            }
          } catch (snapError) {
            this.logger.warn(`Failed to preserve bandwidth snapshots: ${snapError.message}`);
          }

          // 1e. Delete bandwidth_logs records (to avoid foreign key constraint)
          try {
            const deletedBandwidth = await this.dataSource.query(
              'DELETE FROM oracle.bandwidth_logs WHERE vm_instance_id = $1',
              [vmInstance.id]
            );
            this.logger.log(`✅ Deleted bandwidth logs for VM instance ${vmInstance.id}`);
          } catch (bandwidthError) {
            this.logger.warn(`Failed to delete bandwidth logs: ${bandwidthError.message}`);
          }

          // 1f. Delete VM instance record from database
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

    // Step 2: Keep related payment records for audit trail (do not modify status)
    // Payment status only allows: pending, success, failed - do NOT set 'deleted'
    try {
      const payments = await this.paymentRepository.find({
        where: { subscription_id: subscription.id },
      });
      
      if (payments.length > 0) {
        this.logger.log(`Found ${payments.length} payment records for subscription - keeping for audit trail`);
      }
    } catch (paymentError) {
      this.logger.warn(`Failed to check payment records: ${paymentError.message}`);
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

  /**
   * Find active subscriptions expiring within the given number of days.
   * Used by the scheduler to send "expiring soon" notifications.
   */
  async findExpiringSoon(days: number): Promise<Subscription[]> {
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    return this.subscriptionRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.cloudPackage', 'cloudPackage')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.end_date >= :now', { now })
      .andWhere('s.end_date <= :threshold', { threshold })
      .getMany();
  }
}