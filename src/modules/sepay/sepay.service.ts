import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, DataSource, EntityManager } from 'typeorm';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';
import { Payment } from '../../entities/payment.entity';
import { Subscription } from '../../entities/subscription.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { ProcessedSepayTransaction } from '../../entities/processed-sepay-transaction.entity';
import { UserWalletService } from '../user-wallet/user-wallet.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private static readonly PAYMENT_EXPIRE_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(ProcessedSepayTransaction)
    private processedTxRepository: Repository<ProcessedSepayTransaction>,
    private userWalletService: UserWalletService,
    private notificationService: NotificationService,
    private dataSource: DataSource,
  ) {}

  /**
   * PostgreSQL unique-violation SQLSTATE. Used to detect a duplicate/concurrent
   * webhook delivery when claiming the idempotency row.
   */
  private static readonly PG_UNIQUE_VIOLATION = '23505';

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === SepayService.PG_UNIQUE_VIOLATION
    );
  }

  async handleWebhook(webhookData: SepayWebhookDto): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Received Sepay webhook: transaction ${webhookData.id}, amount ${webhookData.transferAmount}`);

      if (webhookData.transferType !== 'in' || webhookData.transferAmount <= 0) {
        this.logger.warn('Transaction is not money in or amount is 0, skipping...');
        return { success: false, message: 'Not a valid incoming transaction' };
      }

      // Tìm payment theo transaction_code trong nội dung chuyển khoản (chỉ dùng cách này,
      // không fallback theo amount để tránh lỗ hổng bảo mật gian lận thanh toán).
      const validFrom = new Date(Date.now() - SepayService.PAYMENT_EXPIRE_MS);
      const content = (webhookData.content || '').toUpperCase();

      let payment: Payment | null = null;

      if (content) {
        // Thử khớp từng từ trong nội dung với transaction_code
        payment = await this.paymentRepository
          .createQueryBuilder('payment')
          .where('UPPER(payment.transaction_code) = ANY(string_to_array(UPPER(:content), \' \'))', { content })
          .andWhere('payment.status = :status', { status: 'pending' })
          .andWhere('payment.created_at >= :validFrom', { validFrom })
          .getOne();

        // Fallback: tìm transaction_code là chuỗi con của nội dung
        if (!payment) {
          const pendingPayments = await this.paymentRepository
            .createQueryBuilder('payment')
            .where('payment.status = :status', { status: 'pending' })
            .andWhere('payment.created_at >= :validFrom', { validFrom })
            .andWhere('payment.transaction_code IS NOT NULL')
            .getMany();
          payment = pendingPayments.find(p => content.includes(p.transaction_code.toUpperCase())) || null;
        }
      }

      // Không tìm được payment theo transaction_code → từ chối
      // (Đã bỏ fallback theo amount để tránh credit nhầm tài khoản)
      if (!payment) {
        this.logger.warn(`[SEPAY] No pending payment matched transaction code in content: "${webhookData.content}"`);
        return { success: false, message: 'No matching payment found' };
      }

      // Kiểm tra hết hạn
      const paymentAgeMs = Date.now() - new Date(payment.created_at).getTime();
      if (paymentAgeMs >= SepayService.PAYMENT_EXPIRE_MS) {
        await this.paymentRepository.update(payment.id, { status: 'expired' });
        this.logger.warn(`Payment ${payment.id} expired before webhook confirmation`);
        return { success: false, message: 'Payment expired (over 15 minutes)' };
      }

      // IDEMPOTENCY: claim this bank transaction before applying any money side
      // effect. A retried/duplicate delivery (esp. of an underpayment, which keeps
      // the payment 'pending' and would otherwise re-match) hits the unique index
      // and is skipped; two concurrent deliveries race on the same insert and only
      // one wins. The claim is rolled back below if processing then throws, so a
      // genuine operator replay is still possible.
      const bankTxId = String(webhookData.id);
      try {
        await this.processedTxRepository.insert({ bankTxId, paymentId: payment.id });
      } catch (claimErr) {
        if (this.isUniqueViolation(claimErr)) {
          this.logger.warn(`[SEPAY] Duplicate webhook for bank tx ${bankTxId} ignored (already processed).`);
          return { success: true, message: 'Duplicate webhook ignored (already processed)' };
        }
        throw claimErr;
      }

      const received = webhookData.transferAmount;
      const expected = Number(payment.amount);

      this.logger.log(`[SEPAY] Payment ${payment.id}: received=${received}, expected=${expected}`);

      try {
        if (received < expected) {
          // Thiếu tiền: cộng số tiền nhận được vào ví, giữ payment pending
          await this.handleUnderpayment(payment, received, expected);
          return {
            success: true,
            message: `Underpayment: received ${received}, expected ${expected}. Amount credited to wallet; payment still pending.`,
          };
        }

        // Đủ hoặc dư tiền: kích hoạt subscription / deposit, hoàn tiền dư vào ví
        const excess = received - expected;
        await this.handleFullPayment(payment, received, expected, excess);
        return { success: true, message: 'Payment processed successfully' };
      } catch (processErr) {
        // Release the idempotency claim so the operator/Sepay can replay this
        // transfer after the underlying failure is resolved.
        try {
          await this.processedTxRepository.delete({ bankTxId });
        } catch (releaseErr) {
          this.logger.error(
            `CRITICAL: failed to release idempotency claim for bank tx ${bankTxId}; a replay will be blocked. Error: ${(releaseErr as Error)?.message}`,
          );
        }
        throw processErr;
      }

    } catch (error) {
      // Transient/internal failure while processing a REAL transfer. Throw a 5xx so
      // SePay's retry mechanism redelivers — returning HTTP 200 here made SePay treat
      // it as delivered and the customer's credit was silently lost (M-P1). Terminal
      // business outcomes (not-in / no-match / duplicate / expired) already returned
      // 200 above and never reach here; the idempotency claim is released on the
      // processing path so a redelivery re-runs cleanly.
      this.logger.error(`Error processing Sepay webhook: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error processing webhook; please retry');
    }
  }

  /**
   * Xử lý khi user chuyển khoản ít hơn số tiền cần thanh toán.
   * - Không kích hoạt subscription.
   * - Cộng số tiền đã nhận vào ví để user không mất tiền.
   * - Payment giữ nguyên trạng thái pending để user có thể tạo lại.
   */
  private async handleUnderpayment(payment: Payment, received: number, expected: number): Promise<void> {
    this.logger.log(`[SEPAY] Underpayment for payment ${payment.id}: crediting ${received} VND to wallet`);

    const updatedWallet = await this.userWalletService.addBalance(payment.user_id, received);

    // IMPORTANT: once the wallet has been credited we must NOT let a later failure
    // propagate to handleWebhook's catch — that would release the idempotency claim
    // while the payment is still 'pending', and a webhook replay would re-credit the
    // wallet (double-credit). So from here on we swallow errors (logged for manual
    // reconciliation) and keep the claim, guaranteeing the credit happens at most once.
    try {
      const userWallet = await this.userWalletService.findByUserId(payment.user_id);
      await this.userWalletService.createTransaction({
        wallet_id: userWallet.id,
        payment_id: payment.id,
        subscription_id: payment.subscription_id ?? null,
        change_amount: received,
        balance_after: updatedWallet.balance,
        type: 'underpayment_deposit',
      });
    } catch (ledgerErr) {
      this.logger.error(
        `CRITICAL: wallet credited for underpayment on payment ${payment.id} but ledger write failed; ` +
          `manual reconciliation needed. Error: ${(ledgerErr as Error)?.message}`,
      );
    }

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

    try {
      await this.notificationService.notify(
        payment.user_id,
        NotificationType.WALLET_CREDIT,
        '⚠️ Thanh toán chưa đủ - Đã nạp vào ví',
        `Bạn đã chuyển ${fmt(received)} nhưng cần ${fmt(expected)} để kích hoạt gói dịch vụ. Số tiền đã được nạp vào ví. Số dư mới: ${fmt(updatedWallet.balance)}. Vui lòng tạo lại giao dịch mới để thanh toán đủ.`,
        { received, expected, balance_after: updatedWallet.balance, payment_id: payment.id },
        '⚠️ Underpayment – Credited to wallet',
        `You transferred ${fmt(received)} but needed ${fmt(expected)} to activate the subscription. The amount has been credited to your wallet. New balance: ${fmt(updatedWallet.balance)}. Please create a new payment to complete the purchase.`,
      );
    } catch (notifyErr) {
      this.logger.error(`Failed to send underpayment notification for payment ${payment.id}: ${notifyErr?.message}`);
    }
  }

  /**
   * Xử lý khi user chuyển khoản đúng hoặc nhiều hơn số tiền cần thanh toán.
   * - Kích hoạt subscription (hoặc nạp ví nếu là deposit).
   * - Cộng phần tiền dư (nếu có) vào ví.
   * - Lưu lịch sử giao dịch đầy đủ.
   */
  /**
   * Credit an amount to the user's wallet INSIDE a caller-supplied transaction, and
   * insert the ledger row in the SAME transaction. Auto-creates the wallet if missing
   * (F5). Returns the post-credit balance. Because it runs in the caller's transaction,
   * a downstream failure rolls the credit AND ledger back together — no lost/duplicated
   * money and no ledger-less credit.
   */
  private async creditWalletTx(manager: EntityManager, userId: number, amount: number, paymentId: string): Promise<number> {
    let wallet = await manager.findOne(UserWallet, { where: { user_id: userId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet) {
      await manager.insert(UserWallet, { user_id: userId, balance: 0, currency: 'VND', status: 'active', is_active: true } as any);
      wallet = await manager.findOne(UserWallet, { where: { user_id: userId }, lock: { mode: 'pessimistic_write' } });
    }
    const balAfter = parseFloat(wallet!.balance.toString()) + Number(amount);
    wallet!.balance = balAfter as any;
    await manager.save(wallet!);
    await manager.save(
      manager.create(WalletTransaction, {
        wallet_id: wallet!.id,
        payment_id: paymentId,
        subscription_id: null,
        change_amount: amount,
        balance_after: balAfter,
        type: 'deposit',
      }),
    );
    return balAfter;
  }

  private async handleFullPayment(
    payment: Payment,
    received: number,
    expected: number,
    excess: number,
  ): Promise<void> {
    // M4: the payment CAS, wallet credit / subscription activation, and every ledger
    // row commit in ONE transaction. A crash or any error rolls it ALL back — the
    // payment stays 'pending' so SePay's redelivery reprocesses cleanly (no lost
    // credit, no stuck 'failed' dead-end, no double-credit on operator replay). The
    // bankTx idempotency claim (inserted by the caller) still blocks same-tx replays,
    // and is released by the caller on throw. Notifications run AFTER commit.
    const outcome = await this.dataSource.transaction(async (manager) => {
      const claim = await manager.update(Payment, { id: payment.id, status: 'pending' }, { status: 'success' });
      if (!claim.affected) {
        // M6: already completed by a DIFFERENT bank tx — this is a 2nd real transfer.
        const balanceAfter = await this.creditWalletTx(manager, payment.user_id, received, payment.id);
        return { kind: 'credited' as const, amount: received, balanceAfter };
      }

      if (payment.payment_type === 'deposit') {
        const balanceAfter = await this.creditWalletTx(manager, payment.user_id, received, payment.id);
        return { kind: 'deposit' as const, amount: received, balanceAfter };
      }

      // subscription: activate ONLY while still pending (CAS)
      const activated = payment.subscription_id
        ? (await manager.update(Subscription, { id: payment.subscription_id, status: 'pending' }, { status: 'active' })).affected
        : 0;
      if (!activated) {
        // M-S2: gone (auto-deleted) or already active → credit the real transfer to wallet.
        const balanceAfter = await this.creditWalletTx(manager, payment.user_id, received, payment.id);
        return { kind: 'reconciled' as const, amount: received, balanceAfter };
      }

      // Activated: two net-zero statistical ledger rows (money went to the bank, not the
      // wallet) + excess refund — all in the same transaction.
      let wallet = await manager.findOne(UserWallet, { where: { user_id: payment.user_id }, lock: { mode: 'pessimistic_write' } });
      if (!wallet) {
        await manager.insert(UserWallet, { user_id: payment.user_id, balance: 0, currency: 'VND', status: 'active', is_active: true } as any);
        wallet = await manager.findOne(UserWallet, { where: { user_id: payment.user_id }, lock: { mode: 'pessimistic_write' } });
      }
      const bal = parseFloat(wallet!.balance.toString());
      await manager.save(manager.create(WalletTransaction, { wallet_id: wallet!.id, payment_id: payment.id, subscription_id: payment.subscription_id ?? null, change_amount: expected, balance_after: bal + expected, type: 'qr_payment_received' }));
      await manager.save(manager.create(WalletTransaction, { wallet_id: wallet!.id, payment_id: payment.id, subscription_id: payment.subscription_id ?? null, change_amount: -expected, balance_after: bal, type: 'qr_subscription_payment' }));
      let balanceAfter = bal;
      if (excess > 0) {
        balanceAfter = bal + excess;
        wallet!.balance = balanceAfter as any;
        await manager.save(wallet!);
        await manager.save(manager.create(WalletTransaction, { wallet_id: wallet!.id, payment_id: payment.id, subscription_id: payment.subscription_id ?? null, change_amount: excess, balance_after: balanceAfter, type: 'overpayment_refund' }));
      }
      return { kind: 'activated' as const, excess, balanceAfter };
    });

    // ---- post-commit notifications (best-effort, outside the transaction) ----
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    try {
      if (outcome.kind === 'deposit') {
        await this.notificationService.notify(payment.user_id, NotificationType.WALLET_CREDIT, '💰 Nạp tiền thành công',
          `Bạn đã nạp thành công ${fmt(outcome.amount)} vào tài khoản. Số dư mới: ${fmt(outcome.balanceAfter)}.`,
          { amount: outcome.amount, balance_after: outcome.balanceAfter, payment_id: payment.id },
          '💰 Deposit successful', `You have successfully deposited ${fmt(outcome.amount)}. New balance: ${fmt(outcome.balanceAfter)}.`);
      } else if (outcome.kind === 'credited' || outcome.kind === 'reconciled') {
        await this.notificationService.notify(payment.user_id, NotificationType.WALLET_CREDIT, '💰 Tiền đã được cộng vào ví',
          `${fmt(outcome.amount)} đã được cộng vào ví. Số dư mới: ${fmt(outcome.balanceAfter)}.`,
          { amount: outcome.amount, balance_after: outcome.balanceAfter, payment_id: payment.id },
          '💰 Credited to wallet', `${fmt(outcome.amount)} credited to your wallet. New balance: ${fmt(outcome.balanceAfter)}.`);
      } else if (outcome.kind === 'activated') {
        if (outcome.excess > 0) {
          await this.notificationService.notify(payment.user_id, NotificationType.WALLET_CREDIT, '💰 Hoàn tiền dư vào ví',
            `Gói dịch vụ đã được kích hoạt. Bạn đã chuyển dư ${fmt(outcome.excess)}, số tiền này đã được nạp vào ví. Số dư mới: ${fmt(outcome.balanceAfter)}.`,
            { excess: outcome.excess, balance_after: outcome.balanceAfter, payment_id: payment.id },
            '💰 Excess payment credited to wallet', `Subscription activated. You overpaid by ${fmt(outcome.excess)}. Credited to wallet. New balance: ${fmt(outcome.balanceAfter)}.`);
        }
        const subscription = await this.subscriptionRepository.findOne({ where: { id: payment.subscription_id }, relations: ['cloudPackage'] });
        if (subscription?.cloudPackage) {
          const pkgName = subscription.cloudPackage.name;
          const endDate = new Date(subscription.end_date).toLocaleDateString('vi-VN');
          await this.notificationService.notify(payment.user_id, NotificationType.SUBSCRIPTION_CREATED, '🚀 Đăng ký gói dịch vụ thành công',
            `Gói "${pkgName}" (${fmt(expected)}) đã được kích hoạt. Hạn sử dụng: ${endDate}.`,
            { subscription_id: subscription.id, package_name: pkgName, amount: expected, end_date: subscription.end_date },
            '🚀 Subscription activated', `"${pkgName}" (${fmt(expected)}) is now active until ${new Date(subscription.end_date).toLocaleDateString('en-US')}.`);
        }
      }
    } catch (notifyErr: any) {
      this.logger.error(`[SEPAY] post-commit notification failed for payment ${payment.id}: ${notifyErr?.message ?? notifyErr}`);
    }
    this.logger.log(`[SEPAY] Payment ${payment.id} processed (kind=${outcome.kind}, excess=${excess}).`);
  }

  async createPayment(createPaymentDto: CreatePaymentDto): Promise<{ paymentId: string; qrUrl: string }> {
    const paymentId = `PAY_${createPaymentDto.userId}_${createPaymentDto.packageId}_${Date.now()}`;
    const transferContent = `${createPaymentDto.planName} U${createPaymentDto.userId}P${createPaymentDto.packageId}`;
    const qrUrl = this.generateQRUrl(createPaymentDto.amount.toString(), transferContent);

    this.logger.log(`Created payment ${paymentId} for user ${createPaymentDto.userId}, package ${createPaymentDto.packageId}`);
    return { paymentId, qrUrl };
  }

  private generateQRUrl(amount: string, description: string): string {
    const baseUrl = 'https://qr.sepay.vn/img';
    const acc = process.env.BANK_ACCOUNT_NUMBER || '1036053562';
    const bank = process.env.BANK_NAME || 'Vietcombank';
    const params = new URLSearchParams({ acc, bank, amount, des: description });
    return `${baseUrl}?${params.toString()}`;
  }
}
