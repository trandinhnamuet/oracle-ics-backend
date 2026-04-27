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

      // Kiểm tra giao dịch có tiền vào không (transferType = "in" và transferAmount > 0)
      if (webhookData.transferType !== 'in' || webhookData.transferAmount <= 0) {
        this.logger.warn('Transaction is not money in or amount is 0, skipping...');
        return { success: false, message: 'Not a valid incoming transaction' };
      }

      // Đã xác nhận có tiền vào
      this.logger.log(`[SEPAY] Incoming transfer: id=${webhookData.id}, amount=${webhookData.transferAmount}`);

      // Tìm payment theo transaction_code trong nội dung chuyển khoản (ưu tiên),
      // hoặc fallback bằng amount + thời gian gần đây
      const validFrom = new Date(Date.now() - SepayService.PAYMENT_EXPIRE_MS);
      const content = (webhookData.content || '').toUpperCase();

      // Ưu tiên tìm theo transaction_code trong nội dung chuyển khoản
      let payment: Payment | null = null;
      if (content) {
        payment = await this.paymentRepository
          .createQueryBuilder('payment')
          .where('UPPER(payment.transaction_code) = ANY(string_to_array(UPPER(:content), \' \'))', { content })
          .andWhere('payment.status = :status', { status: 'pending' })
          .andWhere('payment.created_at >= :validFrom', { validFrom })
          .getOne();

        // Nếu không match bằng word split, thử tìm transaction_code trong content
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

      // Fallback: tìm theo amount nếu không match được transaction_code
      if (!payment) {
        payment = await this.paymentRepository
          .createQueryBuilder('payment')
          .where('payment.amount = :amount', { amount: webhookData.transferAmount })
          .andWhere('payment.status = :status', { status: 'pending' })
          .andWhere('payment.created_at >= :validFrom', { validFrom })
          .orderBy('payment.id', 'DESC')
          .getOne();
      }

      this.logger.log(`Looking for payment with amount: ${webhookData.transferAmount}`);
      
      if (payment) {
        const paymentAgeMs = Date.now() - new Date(payment.created_at).getTime();
        if (paymentAgeMs >= SepayService.PAYMENT_EXPIRE_MS) {
          await this.paymentRepository.update(payment.id, { status: 'expired' });
          this.logger.warn(`Payment ${payment.id} expired before webhook confirmation`);
          return { success: false, message: 'Payment expired (over 15 minutes)' };
        }

        this.logger.log(`Found payment: ${payment.id}, type: ${payment.payment_type}, subscription_id: ${payment.subscription_id}`);
        // Cập nhật payment status
        await this.paymentRepository.update(payment.id, { status: 'success' });

        // SECURITY/CORRECTNESS: Wrap downstream side effects (wallet credit,
        // subscription activation, statistical transactions) in try-catch with
        // a best-effort rollback of the payment status. Without this, a
        // failure after the payment row is flipped to "success" leaves the
        // user without their money / subscription while the payment looks
        // settled — silently dropping funds.
        // We do NOT use a TypeORM QueryRunner here because the dependent
        // services manage their own connections and may already have been
        // partially committed. Best we can do at this layer is mark the
        // payment as 'failed' so support / a retry job can replay it.
        try {
          // Xử lý theo loại payment
          if (payment.payment_type === 'deposit') {
            // Nạp tiền vào wallet
            const updatedWallet = await this.userWalletService.addBalance(payment.user_id, payment.amount);
            this.logger.log(`Added ${payment.amount} VND to user ${payment.user_id} wallet`);

            // Notification: wallet credit (failures here must NOT roll back the
            // wallet credit — the money has landed; just log).
            try {
              const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(payment.amount);
              await this.notificationService.notify(
                payment.user_id,
                NotificationType.WALLET_CREDIT,
                '💰 Nạp tiền thành công',
                `Bạn đã nạp thành công ${formatted} vào tài khoản. Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(updatedWallet.balance)}.`,
                { amount: payment.amount, balance_after: updatedWallet.balance, payment_id: payment.id },
                '💰 Deposit successful',
                `You have successfully deposited ${formatted} to your account. New balance: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(updatedWallet.balance)}.`,
              );
            } catch (notifyErr) {
              this.logger.error(`Failed to send wallet credit notification for payment ${payment.id}: ${notifyErr?.message}`);
            }
          } else if (payment.payment_type === 'subscription') {
            // Kích hoạt subscription
            if (payment.subscription_id) {
              await this.subscriptionRepository.update(payment.subscription_id, {
                status: 'active'
              });
              this.logger.log(`Activated subscription ${payment.subscription_id}`);

              // Send notification to user about successful subscription payment
              try {
                const subscription = await this.subscriptionRepository.findOne({
                  where: { id: payment.subscription_id },
                  relations: ['cloudPackage'],
                });

                if (subscription && subscription.cloudPackage) {
                  const pkgName = subscription.cloudPackage.name;
                  const fmtAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(payment.amount);
                  const endDate = new Date(subscription.end_date).toLocaleDateString('vi-VN');

                  await this.notificationService.notify(
                    payment.user_id,
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
                  this.logger.log(`Sent subscription notification to user ${payment.user_id}`);
                }
              } catch (notificationErr) {
                this.logger.error(`Failed to send subscription notification: ${notificationErr.message}`);
              }
            }

            // Ghi nhận 2 giao dịch thống kê cho subscription qua QR:
            //   credit (+amount, 'qr_payment_received')    → tính vào Tổng nạp
            //   debit  (-amount, 'qr_subscription_payment') → tính vào Tổng chi
            // Ví của người dùng không thay đổi (tiền đến thẳng ngân hàng).
            const userWallet = await this.userWalletService.findByUserId(payment.user_id);
            const currentWalletBalance = Number(userWallet.balance);
            const balanceAfterCredit = currentWalletBalance + Number(payment.amount);

            // Credit — Tổng nạp
            await this.userWalletService.createTransaction({
              wallet_id: userWallet.id,
              payment_id: payment.id,
              change_amount: payment.amount,
              balance_after: balanceAfterCredit,
              type: 'qr_payment_received',
            });

            // Debit — Tổng chi
            await this.userWalletService.createTransaction({
              wallet_id: userWallet.id,
              payment_id: payment.id,
              change_amount: -payment.amount,
              balance_after: currentWalletBalance,
              type: 'qr_subscription_payment',
            });

            this.logger.log(`Recorded QR credit+debit for payment ${payment.id}`);
          }
        } catch (postUpdateErr) {
          // Roll back payment status so this transaction does not appear
          // settled while user-visible side effects failed. Operators can
          // manually investigate / retry payments left in 'failed'.
          this.logger.error(
            `Post-payment side effects failed for payment ${payment.id}; rolling back payment to 'failed'. Error: ${postUpdateErr?.message}`,
            postUpdateErr?.stack,
          );
          try {
            await this.paymentRepository.update(payment.id, { status: 'failed' });
          } catch (rollbackErr) {
            this.logger.error(
              `CRITICAL: failed to roll back payment ${payment.id} status after side-effect failure. Manual intervention required. Error: ${rollbackErr?.message}`,
              rollbackErr?.stack,
            );
          }
          return { success: false, message: 'Internal error finalizing payment; rolled back' };
        }

        this.logger.log(`Updated payment ${payment.id} to success for amount ${webhookData.transferAmount}`);
      } else {
        this.logger.warn(`No pending payment found for amount: ${webhookData.transferAmount}`);
        return { success: false, message: 'No matching payment found' };
      }

      this.logger.log(`Payment webhook processed successfully for amount ${webhookData.transferAmount}`);

      return { success: true, message: 'Payment processed successfully' };
    } catch (error) {
      this.logger.error(`Error processing Sepay webhook: ${error.message}`, error.stack);
      return { success: false, message: 'Internal server error' };
    }
  }

  async createPayment(createPaymentDto: CreatePaymentDto): Promise<{ paymentId: string; qrUrl: string }> {
    // Tạo mã thanh toán duy nhất
    const paymentId = `PAY_${createPaymentDto.userId}_${createPaymentDto.packageId}_${Date.now()}`;
    
    // Tạo nội dung chuyển khoản
    const transferContent = `${createPaymentDto.planName} U${createPaymentDto.userId}P${createPaymentDto.packageId}`;
    
    // Tạo URL QR Sepay
    const qrUrl = this.generateQRUrl(createPaymentDto.amount.toString(), transferContent);

    // TODO: Replace with new payment logic using 6 tables
    // Tạo bản ghi user-package với trạng thái chưa thanh toán
    // await this.userPackageService.create({
    //   userId: createPaymentDto.userId,
    //   packageId: createPaymentDto.packageId,
    //   isPaid: false,
    // });

    this.logger.log(`Created payment ${paymentId} for user ${createPaymentDto.userId}, package ${createPaymentDto.packageId} - Logic will be implemented with new tables`);

    return { paymentId, qrUrl };
  }

  private parseTransactionCode(content: string): string | null {
    try {
      // Tìm transaction code có format NAP + timestamp + random (ví dụ: NAP1729654321ABC123)
      const match = content.match(/NAP\d+[A-Z0-9]+/);
      return match ? match[0] : null;
    } catch (error) {
      this.logger.error(`Error parsing transaction code from content: ${content}`, error);
      return null;
    }
  }

  private parseTransferContent(content: string): { userId: number | null; packageId: number | null } {
    try {
      // Format: "Plan Name U123P456" hoặc tương tự
      const userMatch = content.match(/U(\d+)/);
      const packageMatch = content.match(/P(\d+)/);

      const userId = userMatch ? parseInt(userMatch[1]) : null;
      const packageId = packageMatch ? parseInt(packageMatch[1]) : null;

      return { userId, packageId };
    } catch (error) {
      this.logger.error(`Error parsing transfer content: ${content}`, error);
      return { userId: null, packageId: null };
    }
  }

  private generateQRUrl(amount: string, description: string): string {
    const baseUrl = 'https://qr.sepay.vn/img';
    // Read bank credentials from environment to avoid leaking real account
    // numbers in source control. Fall back to known defaults only when env
    // vars are unset (legacy behavior). Configure BANK_ACCOUNT_NUMBER and
    // BANK_NAME in your deployment environment.
    const acc = process.env.BANK_ACCOUNT_NUMBER || '1036053562';
    const bank = process.env.BANK_NAME || 'Vietcombank';
    const params = new URLSearchParams({
      acc,
      bank,
      amount: amount,
      des: description
    });
    return `${baseUrl}?${params.toString()}`;
  }
}