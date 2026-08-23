import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { Subscription } from '../../entities/subscription.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentService {
  private static readonly PAYMENT_EXPIRE_MS = 15 * 60 * 1000;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(WalletTransaction)
    private walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private notificationService: NotificationService,
    private dataSource: DataSource,
  ) {}

  async create(createPaymentDto: CreatePaymentDto): Promise<Payment> {
    // SECURITY: this public endpoint may ONLY create wallet deposits. Subscription
    // payments must go through SubscriptionService.subscribe-with-payment, which
    // derives the amount server-side from the package/months. Allowing a client to
    // POST an arbitrary { payment_type:'subscription', subscription_id, amount:0 }
    // let an attacker activate an expensive subscription for ~nothing.
    if (createPaymentDto.payment_type !== 'deposit') {
      throw new BadRequestException('Only deposit payments can be created via this endpoint.');
    }

    // Generate unique transaction code if not provided
    if (!createPaymentDto.transaction_code) {
      createPaymentDto.transaction_code = `PAY_${Date.now()}_${uuidv4().substring(0, 8)}`;
    }

    // Build the deposit explicitly: never carry client-supplied subscription/package
    // linkage or metadata into a deposit payment.
    const payment = this.paymentRepository.create({
      user_id: createPaymentDto.user_id,
      payment_method: createPaymentDto.payment_method,
      payment_type: 'deposit',
      amount: createPaymentDto.amount,
      transaction_code: createPaymentDto.transaction_code,
      description: createPaymentDto.description,
      status: 'pending',
    });

    return await this.paymentRepository.save(payment);
  }

  async findAll(): Promise<Payment[]> {
    return await this.paymentRepository.find({
      relations: ['user'],
      // order: {
      //   created_at: 'DESC',
      // },
    });
  }

  async findByUser(userId: number): Promise<Payment[]> {
    return await this.paymentRepository.find({
      where: { user_id: userId },
      relations: ['subscription', 'subscription.cloudPackage'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['user', 'cloudPackage'],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  async findByTransactionCode(transactionCode: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { transaction_code: transactionCode },
      relations: ['user'],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with transaction code ${transactionCode} not found`);
    }

    return payment;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findOne(id);
    
    Object.assign(payment, updatePaymentDto);
    
    return await this.paymentRepository.save(payment);
  }

  async processSuccessfulPayment(transactionCode: string, amount: number): Promise<Payment> {
    const payment = await this.findByTransactionCode(transactionCode);

    // Verify amount matches
    if (Math.abs(payment.amount - amount) > 0.01) {
      throw new Error(`Payment amount mismatch. Expected: ${payment.amount}, Received: ${amount}`);
    }

    return await this.completePayment(payment);
  }

  // Complete payment and update wallet if needed
  private async completePayment(payment: Payment): Promise<Payment> {
    // Check if already completed
    if (payment.status === 'success') {
      return payment;
    }

    if (payment.status === 'pending') {
      const createdAtMs = new Date(payment.created_at).getTime();
      const isExpired = Date.now() - createdAtMs >= PaymentService.PAYMENT_EXPIRE_MS;

      if (isExpired) {
        payment.status = 'expired';
        await this.paymentRepository.save(payment);
        throw new BadRequestException('Payment has expired (over 15 minutes).');
      }
    }

    // M-W2: for a pending DEPOSIT, claim (pending→success) AND credit the wallet in
    // ONE transaction. Previously the claim committed first and the credit ran after,
    // so a crash / DB error in between left the payment 'success' with the wallet
    // never credited and no retry — a silently lost deposit.
    if (payment.status === 'pending' && payment.payment_type === 'deposit') {
      let credited: { balanceAfter: number } | null = null;
      await this.dataSource.transaction(async (manager) => {
        const claim = await manager.update(
          Payment,
          { id: payment.id, status: 'pending' },
          { status: 'success' },
        );
        if (!claim.affected) {
          return; // a concurrent completion already credited this payment
        }
        const wallet = await manager.findOne(UserWallet, {
          where: { user_id: payment.user_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!wallet) {
          throw new NotFoundException(`User wallet for user ${payment.user_id} not found`);
        }
        const balanceAfter = parseFloat(wallet.balance.toString()) + Number(payment.amount);
        wallet.balance = balanceAfter;
        await manager.save(wallet);
        await manager.save(
          manager.create(WalletTransaction, {
            wallet_id: wallet.id,
            payment_id: payment.id,
            change_amount: payment.amount,
            balance_after: balanceAfter,
            type: 'deposit',
          }),
        );
        credited = { balanceAfter };
      });

      const fresh = await this.paymentRepository.findOne({ where: { id: payment.id } });
      if (fresh) payment.status = fresh.status;

      if (credited) {
        // Best-effort deposit notification, outside the transaction.
        try {
          const amt = Number(payment.amount);
          const fa = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
          const fb = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((credited as { balanceAfter: number }).balanceAfter);
          await this.notificationService.notify(
            payment.user_id,
            NotificationType.WALLET_CREDIT,
            '💰 Nạp tiền thành công',
            `Bạn đã nạp thành công ${fa} vào tài khoản. Số dư mới: ${fb}.`,
            { amount: amt, balance_after: (credited as { balanceAfter: number }).balanceAfter, payment_id: payment.id },
            '💰 Deposit successful',
            `You have successfully deposited ${fa} to your account. New balance: ${fb}.`,
          );
        } catch (e) {
          this.logger.warn(`[completePayment] deposit notify failed (ignored): ${(e as Error)?.message}`);
        }
      }
      return payment;
    }

    // Atomically claim the payment: only one concurrent completion may flip
    // pending → success. Without this, two concurrent completions of the same
    // pending deposit both proceed and credit the wallet twice.
    if (payment.status === 'pending') {
      const claim = await this.paymentRepository.update(
        { id: payment.id, status: 'pending' },
        { status: 'success' },
      );
      if (!claim.affected) {
        this.logger.warn(`[completePayment] Payment ${payment.id} already completed concurrently; skipping.`);
        const fresh = await this.paymentRepository.findOne({ where: { id: payment.id } });
        return fresh ?? payment;
      }
      payment.status = 'success';
    } else {
      // Non-pending completion (admin accept / legacy callback). M8: CAS-claim from the
      // current status so two concurrent completions can't both force success + credit
      // the wallet twice (the old blind save()+credit double-credited under replay).
      if (payment.status === 'success') {
        return payment;
      }
      const prev = payment.status;
      const claim = await this.paymentRepository.update(
        { id: payment.id, status: prev },
        { status: 'success' },
      );
      if (!claim.affected) {
        const fresh = await this.paymentRepository.findOne({ where: { id: payment.id } });
        return fresh ?? payment;
      }
      payment.status = 'success';
    }

    // update user wallet balance if type is deposit
    if (payment.payment_type === 'deposit') {
      await this.updateUserWallet(payment);
    }

    // if payment type is subscription, change status of subscription to active
    if (payment.payment_type === 'subscription' && payment.subscription_id) {
      await this.activateSubscription(payment.subscription_id);
      // Record the expense in wallet_transactions so admin costs page counts it in totalSpent
      await this.recordSubscriptionExpense(payment);
    }

    return payment;
  }

  /**
   * Record two statistical wallet_transactions for a QR / direct subscription payment.
   * The actual wallet balance is NOT changed (money went straight to the bank).
   *
   * - credit (+amount, type='qr_payment_received')  → counts in admin "Tổng nạp"
   * - debit  (-amount, type='qr_subscription_payment') → counts in admin "Tổng chi"
   */
  private async recordSubscriptionExpense(payment: Payment): Promise<void> {
    const userWallet = await this.userWalletRepository.findOne({
      where: { user_id: payment.user_id },
    });

    if (!userWallet) {
      this.logger.warn(
        `[recordSubscriptionExpense] No wallet found for user ${payment.user_id}`,
      );
      return;
    }

    const currentBalance = Number(userWallet.balance);
    const amount = Number(payment.amount);
    const balanceAfterCredit = currentBalance + amount;

    // Credit: tiền vào hệ thống qua QR — tính vào Tổng nạp
    await this.walletTransactionRepository.save(
      this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: payment.id,
        subscription_id: payment.subscription_id ?? null,
        change_amount: amount,
        balance_after: balanceAfterCredit,
        type: 'qr_payment_received',
      }),
    );

    // Debit: chi phí gói dịch vụ — tính vào Tổng chi
    await this.walletTransactionRepository.save(
      this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: payment.id,
        subscription_id: payment.subscription_id ?? null,
        change_amount: -amount,
        balance_after: currentBalance,
        type: 'qr_subscription_payment',
      }),
    );

    this.logger.log(
      `[recordSubscriptionExpense] Recorded QR credit+debit ` +
        `paymentId=${payment.id} amount=${amount} userId=${payment.user_id}`,
    );
  }

  private async activateSubscription(subscriptionId: string): Promise<void> {
    this.logger.log(`[activateSubscription] activating subscription id=${subscriptionId}`);
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      this.logger.warn(`[activateSubscription] subscription not found id=${subscriptionId}`);
      throw new NotFoundException(`Subscription with ID ${subscriptionId} not found`);
    }

    // M8: activate ONLY from 'pending' (CAS), not a blind set. The old unconditional
    // `status='active'` could flip an already suspended/cancelled subscription back to
    // active (e.g. a late/legacy callback for a leftover pending payment), bypassing an
    // admin suspension without a reactivate.
    const activated = await this.subscriptionRepository.update(
      { id: subscriptionId, status: 'pending' },
      { status: 'active' },
    );
    if (!activated.affected) {
      this.logger.warn(
        `[activateSubscription] subscription id=${subscriptionId} not pending (status=${subscription.status}); not activating`,
      );
      return;
    }
    subscription.status = 'active';
    this.logger.log(`[activateSubscription] subscription activated id=${subscriptionId}`);

    // Send notification to user about successful subscription payment
    try {
      if (subscription && subscription.cloudPackage) {
        const pkgName = subscription.cloudPackage.name;
        // Get the payment to know the amount paid
        const payment = await this.paymentRepository.findOne({
          where: { subscription_id: subscriptionId },
        });
        
        if (payment) {
          const fmtAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(payment.amount);
          const endDate = new Date(subscription.end_date).toLocaleDateString('vi-VN');

          await this.notificationService.notify(
            subscription.user_id,
            NotificationType.SUBSCRIPTION_CREATED,
            '🚀 Đăng ký gói dịch vụ thành công',
            `Gói "${pkgName}" (${fmtAmount}) đã được kích hoạt. Hạn sử dụng: ${endDate}. Vui lòng tham khảo trang "Gói dịch vụ" để khởi tạo máy ảo.`,
            { 
              subscription_id: subscription.id, 
              package_name: pkgName, 
              amount: payment.amount,
              end_date: subscription.end_date 
            },
            '🚀 Subscription activated',
            `"${pkgName}" (${fmtAmount}) is now active until ${new Date(subscription.end_date).toLocaleDateString('en-US')}. Visit the "Service Package" page to create your virtual machine.`,
          );
          this.logger.log(`[activateSubscription] Sent subscription notification to user ${subscription.user_id}`);
        }
      }
    } catch (notificationErr) {
      this.logger.error(`[activateSubscription] Failed to send subscription notification: ${notificationErr.message}`);
    }
  }

  private async updateUserWallet(payment: Payment): Promise<void> {
    this.logger.log(`[updateUserWallet] start paymentId=${payment.id} user_id=${payment.user_id} amount=${payment.amount}`);
    // Find user wallet
    const userWallet = await this.userWalletRepository.findOne({
      where: { user_id: payment.user_id },
    });

    this.logger.debug(`[updateUserWallet] findOne returned ${userWallet ? 'wallet id=' + userWallet.id : 'null'}`);

    if (!userWallet) {
      throw new NotFoundException(`User wallet for user ${payment.user_id} not found`);
    }

    const balanceBefore = Number(userWallet.balance);
    const paymentAmountNum = Number(payment.amount);

    // Atomic balance increment done entirely in the database (balance = balance + amount)
    // instead of a read-modify-write on the in-memory entity. This avoids the
    // lost-update race where a concurrent deduction (subscribe-with-balance) and
    // this deposit both read the old balance and one overwrites the other.
    const updateResult = await this.userWalletRepository
      .createQueryBuilder()
      .update(UserWallet)
      .set({ balance: () => 'balance + :amt' })
      .where('id = :id', { id: userWallet.id })
      .setParameter('amt', paymentAmountNum)
      .returning('balance')
      .execute();

    const balanceAfter = Number(updateResult.raw?.[0]?.balance ?? balanceBefore + paymentAmountNum);
    this.logger.log(`[updateUserWallet] userWallet id=${userWallet.id} balanceBefore=${balanceBefore} paymentAmount=${paymentAmountNum} balanceAfter=${balanceAfter}`);

    // Create wallet transaction record
    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: payment.id,
      change_amount: payment.amount,
      balance_after: balanceAfter,
      type: 'deposit',
    });

    const savedTx = await this.walletTransactionRepository.save(walletTransaction);
    this.logger.log(`[updateUserWallet] walletTransaction saved id=${savedTx.id} wallet_id=${savedTx.wallet_id} change_amount=${savedTx.change_amount}`);

    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(paymentAmountNum);
    const formattedBalance = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balanceAfter);

    await this.notificationService.notify(
      payment.user_id,
      NotificationType.WALLET_CREDIT,
      '💰 Nạp tiền thành công',
      `Bạn đã nạp thành công ${formattedAmount} vào tài khoản. Số dư mới: ${formattedBalance}.`,
      {
        amount: paymentAmountNum,
        balance_after: balanceAfter,
        payment_id: payment.id,
      },
      '💰 Deposit successful',
      `You have successfully deposited ${formattedAmount} to your account. New balance: ${formattedBalance}.`,
    );
  }

  async handleSepayCallback(data: any): Promise<any> {
    // DEPRECATED legacy webhook (Wallet-F1). This path has NO bank-tx idempotency ledger
    // (it relies only on the payment-status CAS) and does not share idempotency with the
    // primary /sepay/webhook handler, so if the SAME transfer were delivered to BOTH
    // endpoints it could be credited twice. The modern SePay integration uses
    // /sepay/webhook (SepayService). This endpoint should be retired once ops confirm
    // SePay is not configured to call it. Logging loudly so any real use is visible.
    this.logger.warn('[DEPRECATED] /payments/sepay-callback invoked — confirm SePay webhook URL and retire this endpoint (Wallet-F1).');
    try {
      const { amount, content, status } = data;
      
      if (status === 'success') {
        // Extract transaction code from content
        const transactionCode = this.extractTransactionCode(content);
        
        if (transactionCode) {
          const payment = await this.processSuccessfulPayment(transactionCode, amount);
          return { success: true, payment };
        }
      }
      
      return { success: false, message: 'Invalid callback data' };
    } catch (error) {
      // SECURITY: Do not echo raw error.message back to the webhook caller —
      // it can leak SQL fragments, stack frames or PII. Log internally and
      // return a generic message.
      this.logger.error(`handleSepayCallback failed: ${error?.message}`, error?.stack);
      return { success: false, message: 'Internal error processing callback' };
    }
  }

  private extractTransactionCode(content: string): string | null {
    // Extract transaction code from payment content
    // This depends on how the transaction code is embedded in the content
    const matches = content.match(/PAY_\d+_[a-f0-9]{8}/);
    return matches ? matches[0] : null;
  }

  /**
   * Mark all pending payments older than `ageMinutes` minutes as 'failed'.
   * Called on startup and every 30 minutes by the scheduler.
   */
  async cleanupExpiredPendingPayments(ageMinutes = 60): Promise<void> {
    const cutoff = new Date(Date.now() - ageMinutes * 60 * 1000);
    const stale = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: 'pending' })
      .andWhere('payment.created_at < :cutoff', { cutoff })
      .getMany();

    if (stale.length === 0) return;

    for (const payment of stale) {
      payment.status = 'expired';
      await this.paymentRepository.save(payment);
    }

    this.logger.log(`Marked ${stale.length} expired pending payment(s) as expired (older than ${ageMinutes} min)`);
  }

  // Admin manually accept a pending payment
  async acceptPayment(id: string): Promise<Payment> {
    const payment = await this.findOne(id);

    if (payment.status !== 'pending') {
      throw new Error(`Cannot accept payment with status: ${payment.status}`);
    }

    // Use the same logic as successful payment processing
    // This will handle both deposit (update wallet) and subscription (activate subscription) payments
    return await this.completePayment(payment);
  }
}