import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';
import { Payment } from '../../entities/payment.entity';
import { Subscription } from '../../entities/subscription.entity';
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
    private userWalletService: UserWalletService,
    private notificationService: NotificationService,
  ) {}

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

      const received = webhookData.transferAmount;
      const expected = Number(payment.amount);

      this.logger.log(`[SEPAY] Payment ${payment.id}: received=${received}, expected=${expected}`);

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

    } catch (error) {
      this.logger.error(`Error processing Sepay webhook: ${error.message}`, error.stack);
      return { success: false, message: 'Internal server error' };
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
    const userWallet = await this.userWalletService.findByUserId(payment.user_id);

    await this.userWalletService.createTransaction({
      wallet_id: userWallet.id,
      payment_id: payment.id,
      subscription_id: payment.subscription_id ?? null,
      change_amount: received,
      balance_after: updatedWallet.balance,
      type: 'underpayment_deposit',
    });

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
  private async handleFullPayment(
    payment: Payment,
    received: number,
    expected: number,
    excess: number,
  ): Promise<void> {
    // Đánh dấu payment thành công
    await this.paymentRepository.update(payment.id, { status: 'success' });

    try {
      if (payment.payment_type === 'deposit') {
        // Nạp tiền vào ví: cộng toàn bộ số tiền nhận được
        const updatedWallet = await this.userWalletService.addBalance(payment.user_id, received);
        const userWallet = await this.userWalletService.findByUserId(payment.user_id);

        await this.userWalletService.createTransaction({
          wallet_id: userWallet.id,
          payment_id: payment.id,
          subscription_id: null,
          change_amount: received,
          balance_after: updatedWallet.balance,
          type: 'deposit',
        });

        const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
        try {
          await this.notificationService.notify(
            payment.user_id,
            NotificationType.WALLET_CREDIT,
            '💰 Nạp tiền thành công',
            `Bạn đã nạp thành công ${fmt(received)} vào tài khoản. Số dư mới: ${fmt(updatedWallet.balance)}.`,
            { amount: received, balance_after: updatedWallet.balance, payment_id: payment.id },
            '💰 Deposit successful',
            `You have successfully deposited ${fmt(received)}. New balance: ${fmt(updatedWallet.balance)}.`,
          );
        } catch (notifyErr) {
          this.logger.error(`Failed to send deposit notification for payment ${payment.id}: ${notifyErr?.message}`);
        }

      } else if (payment.payment_type === 'subscription') {
        // Kích hoạt subscription
        if (payment.subscription_id) {
          await this.subscriptionRepository.update(payment.subscription_id, { status: 'active' });
          this.logger.log(`Activated subscription ${payment.subscription_id}`);
        }

        // Ghi 2 giao dịch thống kê (tiền đến thẳng ngân hàng, ví không thay đổi)
        const userWallet = await this.userWalletService.findByUserId(payment.user_id);
        const currentBalance = Number(userWallet.balance);

        await this.userWalletService.createTransaction({
          wallet_id: userWallet.id,
          payment_id: payment.id,
          subscription_id: payment.subscription_id ?? null,
          change_amount: expected,
          balance_after: currentBalance + expected,
          type: 'qr_payment_received',
        });

        await this.userWalletService.createTransaction({
          wallet_id: userWallet.id,
          payment_id: payment.id,
          subscription_id: payment.subscription_id ?? null,
          change_amount: -expected,
          balance_after: currentBalance,
          type: 'qr_subscription_payment',
        });

        // Hoàn tiền dư vào ví (nếu chuyển thừa)
        if (excess > 0) {
          const updatedWallet = await this.userWalletService.addBalance(payment.user_id, excess);

          await this.userWalletService.createTransaction({
            wallet_id: userWallet.id,
            payment_id: payment.id,
            subscription_id: payment.subscription_id ?? null,
            change_amount: excess,
            balance_after: updatedWallet.balance,
            type: 'overpayment_refund',
          });

          const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
          try {
            await this.notificationService.notify(
              payment.user_id,
              NotificationType.WALLET_CREDIT,
              '💰 Hoàn tiền dư vào ví',
              `Gói dịch vụ đã được kích hoạt. Bạn đã chuyển dư ${fmt(excess)}, số tiền này đã được nạp vào ví. Số dư mới: ${fmt(updatedWallet.balance)}.`,
              { excess, balance_after: updatedWallet.balance, payment_id: payment.id },
              '💰 Excess payment credited to wallet',
              `Subscription activated. You overpaid by ${fmt(excess)}. The excess has been credited to your wallet. New balance: ${fmt(updatedWallet.balance)}.`,
            );
          } catch (notifyErr) {
            this.logger.error(`Failed to send overpayment notification for payment ${payment.id}: ${notifyErr?.message}`);
          }
        }

        // Notification kích hoạt subscription
        try {
          const subscription = await this.subscriptionRepository.findOne({
            where: { id: payment.subscription_id },
            relations: ['cloudPackage'],
          });
          if (subscription && subscription.cloudPackage) {
            const pkgName = subscription.cloudPackage.name;
            const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
            const endDate = new Date(subscription.end_date).toLocaleDateString('vi-VN');
            await this.notificationService.notify(
              payment.user_id,
              NotificationType.SUBSCRIPTION_CREATED,
              '🚀 Đăng ký gói dịch vụ thành công',
              `Gói "${pkgName}" (${fmt(expected)}) đã được kích hoạt. Hạn sử dụng: ${endDate}.`,
              { subscription_id: subscription.id, package_name: pkgName, amount: expected, end_date: subscription.end_date },
              '🚀 Subscription activated',
              `"${pkgName}" (${fmt(expected)}) is now active until ${new Date(subscription.end_date).toLocaleDateString('en-US')}.`,
            );
          }
        } catch (notifyErr) {
          this.logger.error(`Failed to send subscription notification for payment ${payment.id}: ${notifyErr?.message}`);
        }

        this.logger.log(`[SEPAY] Payment ${payment.id} completed: subscription activated, excess=${excess}`);
      }
    } catch (postUpdateErr) {
      // Roll back payment status để operator có thể replay thủ công
      this.logger.error(
        `Post-payment side effects failed for payment ${payment.id}; rolling back to 'failed'. Error: ${postUpdateErr?.message}`,
        postUpdateErr?.stack,
      );
      try {
        await this.paymentRepository.update(payment.id, { status: 'failed' });
      } catch (rollbackErr) {
        this.logger.error(
          `CRITICAL: failed to roll back payment ${payment.id}. Manual intervention required. Error: ${rollbackErr?.message}`,
        );
      }
      throw postUpdateErr;
    }
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
