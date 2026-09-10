import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In, LessThanOrEqual } from 'typeorm';
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

  // Windows pricing mirrors OCI: a per-OCPU/hour OS license added on top of the
  // (Linux) compute price. 1 OCPU = 2 vCPU; monthly = OCPU × rate × 744h.
  private static readonly HOURS_PER_MONTH = 744;
  // USD→VND used only for the Windows license uplift. Overridable via env so ops
  // can keep it aligned with FX without a code change (fallback = conservative default).
  private get usdToVnd(): number {
    const v = parseFloat(process.env.WINDOWS_UPLIFT_USD_TO_VND || '');
    return Number.isFinite(v) && v > 0 ? v : 26310;
  }
  private get windowsLicenseUsdPerOcpuHour(): number {
    const v = parseFloat(process.env.WINDOWS_LICENSE_USD_PER_OCPU_HOUR || '');
    return Number.isFinite(v) && v > 0 ? v : 0.092;
  }

  private normalizeOsType(osType?: string): 'linux' | 'windows' {
    return String(osType || '').toLowerCase() === 'windows' ? 'windows' : 'linux';
  }

  /**
   * AI/GPU packages are quoted, not self-served: the GPU and bare-metal shapes they
   * name are outside this platform's provisioning path (the VM configure step is
   * constrained to ALLOWED_VM_SHAPES, which is E5.Flex on prod), so subscribing to
   * one would silently hand the customer an ordinary E5 VM at GPU prices. ICS
   * provisions these out of band after a sales conversation.
   *
   * The pricing UI already routes these to "contact us", but the button alone is a
   * client-side control — this blocks the self-serve API paths too.
   */
  private assertSelfServiceable(cloudPackage: CloudPackage): void {
    if (String(cloudPackage.type || '').toLowerCase() === 'ai') {
      throw new BadRequestException(
        'AI/GPU packages cannot be subscribed online. Please contact ICS for a quote and provisioning.',
      );
    }
  }

  /** vCPU count parsed from a package's cpu string (e.g. "10 vCPU"). */
  private parseVcpu(cpu?: string): number {
    const m = String(cpu || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /** Monthly Windows-license uplift (VND) for a package's OCPU count. */
  private windowsUpliftVnd(cloudPackage: CloudPackage): number {
    // Bill the uplift on the SAME OCPU count that is actually provisioned
    // (ceil, min 1) — matches vcpuToOcpu in vm-subscription so odd/1-vCPU
    // packages are not under-billed.
    const ocpu = Math.max(1, Math.ceil(this.parseVcpu(cloudPackage.cpu) / 2));
    const upliftUsd = ocpu * this.windowsLicenseUsdPerOcpuHour * SubscriptionService.HOURS_PER_MONTH;
    return Math.round(upliftUsd * this.usdToVnd);
  }

  /** Effective monthly price (VND) for a package given the chosen OS family. */
  private monthlyPriceVnd(cloudPackage: CloudPackage, osType: string): number {
    const base = parseFloat(cloudPackage.cost_vnd.toString());
    return this.normalizeOsType(osType) === 'windows' ? base + this.windowsUpliftVnd(cloudPackage) : base;
  }
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
      // Default applied here (removed from the DTO initializer — Auth-F2).
      auto_renew: createSubscriptionDto.auto_renew ?? true,
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
    autoRenew: boolean = false,
    osType: string = 'linux'
  ): Promise<Subscription> {
    // Get cloud package
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: cloudPackageId, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${cloudPackageId} not found`);
    }
    this.assertSelfServiceable(cloudPackage);

    // Get user wallet (sử dụng UserWalletService để auto-create nếu cần)
    const userWallet = await this.userWalletService.findByUserId(userId);

    if (!Number.isInteger(monthsCount) || monthsCount < 1 || monthsCount > 24) {
      throw new BadRequestException('monthsCount must be between 1 and 24');
    }

    // Check balance - Convert to number for accurate comparison
    const normalizedOs = this.normalizeOsType(osType);
    const currentBalance = parseFloat(userWallet.balance.toString());
    const packageCost = this.monthlyPriceVnd(cloudPackage, normalizedOs) * monthsCount;
    if (!(packageCost > 0)) {
      throw new BadRequestException('Cloud package cost must be greater than 0');
    }

    this.logger.log(
      `[createWithAccountBalance] Balance check userId=${userId} cloudPackageId=${cloudPackageId} monthsCount=${monthsCount} currentBalance=${currentBalance} packageCost=${packageCost} sufficient=${currentBalance >= packageCost}`,
    );

    if (currentBalance < packageCost) {
      throw new BadRequestException('Insufficient balance');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsCount);

    // All-or-nothing: debit + subscription + ledger commit in ONE transaction with
    // the wallet row locked across all writes. A crash or any error rolls the whole
    // thing back — the user is never charged without a subscription + ledger record,
    // and the ledger balance_after is the authoritative post-deduct balance.
    const { savedSubscription, balanceAfter } = await this.dataSource.transaction(async (manager) => {
      const wallet = await this.userWalletService.deductBalanceTx(manager, userId, packageCost);
      const balAfter = parseFloat(wallet.balance.toString());
      const saved = await manager.save(
        manager.create(Subscription, {
          user_id: userId,
          cloud_package_id: cloudPackageId,
          start_date: startDate,
          end_date: this.toEndOfDay(endDate),
          status: 'active',
          auto_renew: autoRenew,
          amount_paid: packageCost,
          months_paid: monthsCount,
          os_type: normalizedOs,
        }),
      );
      await manager.save(
        manager.create(WalletTransaction, {
          wallet_id: wallet.id,
          payment_id: null,
          subscription_id: saved.id,
          change_amount: -packageCost,
          balance_after: balAfter,
          type: 'subscription_payment',
        }),
      );
      return { savedSubscription: saved, balanceAfter: balAfter };
    });
    void balanceAfter;

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
    autoRenew: boolean = false,
    osType: string = 'linux'
  ): Promise<{ subscription: Subscription; payment: Payment }> {
    // Get cloud package
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id: cloudPackageId, is_active: true },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${cloudPackageId} not found`);
    }
    this.assertSelfServiceable(cloudPackage);

    // Bound monthsCount (mirror createWithAccountBalance): an unvalidated or
    // negative value makes totalAmount negative, which the Sepay webhook would
    // "refund" as arbitrary wallet credit on a tiny real transfer.
    if (!Number.isInteger(monthsCount) || monthsCount < 1 || monthsCount > 24) {
      throw new BadRequestException('monthsCount must be between 1 and 24');
    }
    const normalizedOs = this.normalizeOsType(osType);
    const unitCost = this.monthlyPriceVnd(cloudPackage, normalizedOs);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new BadRequestException('Invalid package cost');
    }

    // Calculate total amount (includes the Windows license uplift when applicable)
    const totalAmount = unitCost * monthsCount;

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
      os_type: normalizedOs,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Update payment with subscription reference
    savedPayment.subscription_id = savedSubscription.id;
    await this.paymentRepository.save(savedPayment);

    // Schedule auto-deletion if payment is not completed within 10 minutes
    this.schedulePendingDeletion(savedSubscription.id);

    return { subscription: savedSubscription, payment: savedPayment };
  }

  /**
   * Renew the QR payment for an existing PENDING subscription without creating a new subscription.
   * Marks any previous pending payment as expired, generates a new transaction code,
   * and resets the auto-deletion timer.
   */
  async renewPaymentForPendingSubscription(
    subscriptionId: string,
    userId: number,
  ): Promise<{ subscription: Subscription; payment: Payment }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    if (subscription.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this subscription');
    }

    if (subscription.status !== 'pending') {
      throw new BadRequestException('Only pending subscriptions can have their payment renewed');
    }

    // M-P2: intentionally do NOT expire the existing pending payment(s) here. A bank
    // transfer for the previous transaction_code may already be in flight; expiring it
    // makes the webhook (which matches only 'pending') drop that real transfer and lose
    // the customer's money. Leaving the old payment pending lets the late transfer still
    // match and activate the subscription; the new payment simply expires unused. Each
    // transfer maps to exactly one payment by its unique transaction_code, and the
    // bank-tx idempotency claim prevents any double-processing.

    const cloudPackage =
      subscription.cloudPackage ??
      (await this.cloudPackageRepository.findOne({ where: { id: subscription.cloud_package_id } }));

    const transactionCode = `SUB${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payment = this.paymentRepository.create({
      user_id: userId,
      cloud_package_id: subscription.cloud_package_id,
      subscription_id: subscriptionId,
      payment_method: 'sepay_qr',
      payment_type: 'subscription',
      amount: subscription.amount_paid,
      status: 'pending',
      transaction_code: transactionCode,
      description: `Subscription payment renewal for ${cloudPackage?.name ?? subscription.cloud_package_id}`,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Reset the pending deletion timer — give another full window from now
    this.schedulePendingDeletion(subscriptionId);

    this.logger.log(
      `[renewPayment] New payment ${savedPayment.id} (${transactionCode}) created for subscription ${subscriptionId}`,
    );

    return { subscription, payment: savedPayment };
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
      // The controller forwards raw query strings, so `page=-5` and `limit=abc`
      // used to reach Postgres as OFFSET -120 / LIMIT NaN and answered 500
      // (same defect class as the users list — QA 2026-09-11, INPUT/page-*).
      const rawPage = Number(queryParams?.page);
      const rawLimit = Number(queryParams?.limit);
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
      const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 20;
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

      // Apply sorting. Whitelist the column and direction: `sortBy`/`sortOrder`
      // are request-controlled and TypeORM does NOT parameterize identifiers, so
      // an unknown value must fall back to a safe default rather than be
      // interpolated raw into ORDER BY (SQL injection).
      const sortableColumns: Record<string, string> = {
        id: 'subscription.id',
        user_id: 'subscription.user_id',
        cloud_package_id: 'subscription.cloud_package_id',
        start_date: 'subscription.start_date',
        end_date: 'subscription.end_date',
        status: 'subscription.status',
        created_at: 'subscription.created_at',
      };
      const orderColumn = sortableColumns[sortBy as string] ?? 'subscription.created_at';
      const orderDir: 'ASC' | 'DESC' = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      queryBuilder.orderBy(orderColumn, orderDir);

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

  // R8-F2: these four transition methods previously did findOne()->mutate->save(entity).
  // Subscription has no @VersionColumn, so save() rewrites ALL columns from a stale,
  // unlocked read — including end_date. If the auto-renew cron committed a paid renewal
  // (new end_date + ledger + wallet debit) between the findOne and the save, save() would
  // silently revert end_date to the pre-renewal value: the customer paid but lost the time.
  // Fix: targeted UPDATEs that write ONLY the intended fields and never rewrite end_date.
  async update(id: string, updateSubscriptionDto: UpdateSubscriptionDto): Promise<Subscription> {
    // Ensure it exists (throws NotFound otherwise) but do not write back the stale row.
    await this.findOne(id);
    await this.subscriptionRepository.update(id, updateSubscriptionDto as any);
    return await this.findOne(id);
  }

  async cancel(id: string): Promise<Subscription> {
    // Cancelling releases the machine — there is no "keep running until end_date" tier,
    // and a cancelled subscription used to block TERMINATE, leaving the instance running
    // and billing with no way out. Terminate now (best-effort; the customer can still
    // TERMINATE via the VM action and the hourly sweep is the backstop).
    const subscription = await this.findOne(id);
    await this.subscriptionRepository.update({ id }, { status: 'cancelled', auto_renew: false });
    if (subscription.vm_instance_id) {
      try {
        const vm = await this.vmInstanceRepository.findOne({ where: { id: subscription.vm_instance_id } });
        if (
          vm?.instance_id &&
          vm.instance_id !== 'PENDING' &&
          !['TERMINATED', 'TERMINATING'].includes(vm.lifecycle_state)
        ) {
          await this.ociService.terminateInstance(vm.instance_id, false);
          vm.lifecycle_state = 'TERMINATING';
          await this.vmInstanceRepository.save(vm);
          this.logger.log(`[cancel] terminated VM ${vm.instance_id} for cancelled subscription ${id}`);
        }
      } catch (e: any) {
        this.logger.warn(`[cancel] failed to terminate VM for subscription ${id}: ${e?.message ?? e}`);
      }
    }
    return await this.findOne(id);
  }

  async suspend(id: string): Promise<Subscription> {
    // Load only to read vm_instance_id for the containment step below — the status write
    // itself is a targeted UPDATE, so a concurrent renewal's end_date is never clobbered.
    const subscription = await this.findOne(id);
    await this.subscriptionRepository.update({ id }, { status: 'suspended' });

    // VM-A: suspension must actually CONTAIN the customer. The web-terminal gate alone
    // is not enough — the customer holds the SSH private key / RDP password and can
    // connect directly to a still-running instance. Stop the VM immediately instead of
    // waiting up to an hour for the sweep. Best-effort; the sweep is the backstop.
    if (subscription.vm_instance_id) {
      try {
        const vm = await this.vmInstanceRepository.findOne({ where: { id: subscription.vm_instance_id } });
        if (
          vm?.instance_id &&
          vm.instance_id !== 'PENDING' &&
          ['RUNNING', 'STARTING'].includes(vm.lifecycle_state)
        ) {
          await this.ociService.stopInstance(vm.instance_id);
          vm.lifecycle_state = 'STOPPING';
          await this.vmInstanceRepository.save(vm);
          this.logger.log(`[suspend] stopped VM ${vm.instance_id} for suspended subscription ${id}`);
        }
      } catch (e: any) {
        this.logger.warn(`[suspend] failed to stop VM for subscription ${id}: ${e?.message ?? e}`);
      }
    }
    return await this.findOne(id);
  }

  async reactivate(id: string): Promise<Subscription> {
    await this.findOne(id);
    await this.subscriptionRepository.update({ id }, { status: 'active' });
    return await this.findOne(id);
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
    // Charge must match what the subscription was purchased at: for Windows the
    // per-OCPU license uplift is added on top of the Linux base. Using raw
    // cost_vnd here dropped that uplift on every renewal (silent underbilling).
    const packageCost = this.monthlyPriceVnd(subscription.cloudPackage, subscription.os_type);
    if (!(packageCost > 0)) {
      throw new BadRequestException('Cloud package cost must be greater than 0');
    }

    if (currentBalance < packageCost) {
      throw new BadRequestException(
        'Bạn không đủ tiền trong tài khoản để gia hạn, xin hãy nạp thêm',
      );
    }

    // All-or-nothing renewal in ONE transaction: the CAS claim (expired->active +
    // new end_date), the debit and the ledger row either ALL commit or ALL roll
    // back. Prevents double-charge (only one concurrent claim gets affected===1)
    // AND the charge-without-record / permanently-stuck-active states that a crash
    // between separate statements would otherwise leave.
    const newEndDate = new Date();
    newEndDate.setMonth(newEndDate.getMonth() + 1);
    const endOfDay = this.toEndOfDay(newEndDate);

    const balanceAfter = await this.dataSource.transaction(async (manager) => {
      const claim = await manager.update(
        Subscription,
        { id, user_id: userId, status: 'expired' },
        { status: 'active', end_date: endOfDay },
      );
      if (!claim.affected) {
        throw new BadRequestException('Gói đang được gia hạn hoặc đã được gia hạn, vui lòng thử lại.');
      }
      const wallet = await this.userWalletService.deductBalanceTx(manager, userId, packageCost);
      const balAfter = parseFloat(wallet.balance.toString());
      await manager.save(
        manager.create(WalletTransaction, {
          wallet_id: wallet.id,
          payment_id: null,
          subscription_id: id,
          change_amount: -packageCost,
          balance_after: balAfter,
          type: 'manual_renewal',
        }),
      );
      return balAfter;
    });

    // Reflect the committed state on the in-memory entity for the post-commit
    // VM-start + notification steps below.
    subscription.end_date = endOfDay;
    subscription.status = 'active';

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
          // Guarded update (not stale save) — don't erase a concurrent renewal.
          await this.subscriptionRepository.update(
            { id: subscription.id, status: In(['active']), end_date: LessThanOrEqual(now) },
            { status: 'expired' },
          );

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
    // Guard every status write below by "still overdue" (end_date <= now) rather than
    // an exact end_date match (Date round-trips DB->JS->SQL don't compare reliably, which
    // made the CAS never claim). A concurrent manualRenew advances end_date into the
    // future so our write becomes a no-op instead of clobbering it; a cancel/suspend
    // moves status out of the {active,expired} set. now is captured once for all guards.
    const now = new Date();
    const scanEndDate = subscription.end_date;

    try {
      // R8-LOW: if the package row was deleted/deactivated, monthlyPriceVnd would throw on
      // cloudPackage.cost_vnd and the outer catch would mark a WELL-FUNDED sub 'expired'.
      // Skip instead (like the packageCost<=0 SKIP) so ops can fix the package, not the user.
      if (!subscription.cloudPackage) {
        this.appendRenewalLog(`    [AutoRenew SKIP] cloudPackage missing sub=${subId} — bỏ qua, KHÔNG trừ tiền`);
        return;
      }
      const userWallet = await this.userWalletService.findByUserId(subscription.user_id);
      const currentBalance = parseFloat(userWallet.balance.toString());
      // Charge must match what the subscription was purchased at: for Windows the
    // per-OCPU license uplift is added on top of the Linux base. Using raw
    // cost_vnd here dropped that uplift on every renewal (silent underbilling).
    const packageCost = this.monthlyPriceVnd(subscription.cloudPackage, subscription.os_type);
      if (!(packageCost > 0)) {
        this.appendRenewalLog(`    [AutoRenew SKIP] packageCost<=0 (misconfig gói) sub=${subId} — bỏ qua, KHÔNG trừ tiền`);
        return;
      }

      this.appendRenewalLog(
        `    [AutoRenew] wallet_id=${userWallet.id} | balance=${currentBalance} | cost=${packageCost} | sufficient=${currentBalance >= packageCost}`,
      );

      if (currentBalance < packageCost) {
        // M7: mark expired via a guarded UPDATE (not save() of the stale entity),
        // so a concurrent manualRenew that just renewed this sub isn't erased.
        // R8-F1: guard on status='active' ONLY (not In(active,expired)). Postgres counts a
        // no-op `SET status='expired'` on an ALREADY-expired row as an affected row, so the
        // previous In(active,expired) guard made `marked.affected` truthy on every daily
        // tick for a still-underfunded expired sub → the "plan expired" notification fired
        // every single day forever. Matching only 'active' means affected===1 iff this call
        // performed the real active->expired transition. The end_date<=now guard still makes
        // a concurrent manualRenew (which pushes end_date into the future) win over us.
        const marked = await this.subscriptionRepository.update(
          { id: subId, status: 'active', end_date: LessThanOrEqual(now) },
          { status: 'expired' },
        );
        this.appendRenewalLog(`    [AutoRenew FAIL] Số dư không đủ → đánh dấu EXPIRED | sub=${subId}`);

        // F1: only notify on the actual active->expired transition, not on every daily
        // tick for a sub that is already expired (avoids "your plan just expired" spam).
        if (marked.affected)
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

      // All-or-nothing renewal in ONE transaction (see manualRenew). The CAS claim
      // (expired->active + new end_date), the debit and the ledger row all commit or
      // all roll back — no double charge (only one concurrent claim wins) and no
      // stuck-active / charge-without-ledger state if the process crashes mid-way.
      const prevEndDate = new Date(scanEndDate);
      // H2: renew from max(prevEnd, now) — a sub that lapsed N months ago must not be
      // charged one month per cron tick to crawl its end_date forward from the past.
      const base = prevEndDate > now ? prevEndDate : now;
      const nextEndDate = new Date(base);
      nextEndDate.setMonth(nextEndDate.getMonth() + 1);
      const endOfDay = this.toEndOfDay(nextEndDate);

      const result = await this.dataSource.transaction(async (manager) => {
        // C1: the cron invokes attemptAutoRenewal for overdue subs whose status is
        // still 'active' (only the non-auto-renew branch sets 'expired' first). The
        // round-4 CAS required 'expired', so auto-renewal silently no-op'd for every
        // such sub (free renewals). Claim from EITHER 'active' or 'expired', guarded by
        // the scan-time end_date so a concurrent manualRenew is a no-op (affected=0).
        const claim = await manager.update(
          Subscription,
          { id: subId, user_id: subscription.user_id, status: In(['active', 'expired']), end_date: LessThanOrEqual(now) },
          { status: 'active', end_date: endOfDay },
        );
        if (!claim.affected) {
          return null; // already renewed / cancelled / suspended concurrently
        }
        const wallet = await this.userWalletService.deductBalanceTx(manager, subscription.user_id, packageCost);
        const balAfter = parseFloat(wallet.balance.toString());
        await manager.save(
          manager.create(WalletTransaction, {
            wallet_id: wallet.id,
            payment_id: null,
            subscription_id: subscription.id,
            change_amount: -packageCost,
            balance_after: balAfter,
            type: 'auto_renewal',
          }),
        );
        return balAfter;
      });

      if (result === null) {
        this.appendRenewalLog(`    [AutoRenew SKIP] sub=${subId} đã được gia hạn bởi tiến trình khác`);
        return;
      }
      const balanceAfter = result;
      this.appendRenewalLog(`    [AutoRenew] Đã trừ ví → balance_after=${balanceAfter}`);
      subscription.end_date = endOfDay;
      subscription.status = 'active';

      this.appendRenewalLog(
        `    [AutoRenew SUCCESS] sub=${subId} | end_date cũ=${prevEndDate.toISOString()} | end_date mới=${subscription.end_date.toISOString()}`,
      );

      const fmtCost = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(packageCost);
      const fmtEnd = subscription.end_date.toLocaleDateString('vi-VN');
      const fmtEndEn = subscription.end_date.toLocaleDateString('en-US');
      // Notifications are best-effort and run AFTER the renewal has committed — a
      // failure here must NOT reach the outer catch and revert a paid renewal.
      try {
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
      } catch (notifyErr: any) {
        this.appendRenewalLog(`    [AutoRenew] notify failed (ignored) sub=${subId}: ${notifyErr?.message ?? notifyErr}`);
      }
    } catch (error: any) {
      this.appendRenewalLog(
        `    [AutoRenew ERROR] sub=${subId} | ${error?.message ?? error}\n    Stack: ${error?.stack ?? ''}`,
      );
      // Renewal failed BEFORE commit (transaction rolled back) → mark expired at the
      // DB level, guarded by status + scan-time end_date (H1) so this can never clobber
      // a concurrent committed manualRenew or an admin cancel/suspend.
      await this.subscriptionRepository.update(
        { id: subId, status: In(['active', 'expired']), end_date: LessThanOrEqual(now) },
        { status: 'expired' },
      );
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