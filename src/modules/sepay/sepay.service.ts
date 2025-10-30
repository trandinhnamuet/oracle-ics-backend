import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';
import { Payment } from '../../entities/payment.entity';
import { Subscription } from '../../entities/subscription.entity';
import { UserWalletService } from '../user-wallet/user-wallet.service';

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private userWalletService: UserWalletService,
  ) {}

  async handleWebhook(webhookData: SepayWebhookDto): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Received Sepay webhook: ${JSON.stringify(webhookData)}`);
      console.log('Sepay webhook received:', webhookData);

      // Kiểm tra giao dịch có tiền vào không (transferType = "in" và transferAmount > 0)
      if (webhookData.transferType !== 'in' || webhookData.transferAmount <= 0) {
        this.logger.warn('Transaction is not money in or amount is 0, skipping...');
        return { success: false, message: 'Not a valid incoming transaction' };
      }

      // Đã xác nhận có tiền vào
      console.log('[SEPAY] ĐÃ NHẬN TIỀN VÀO:', {
        id: webhookData.id,
        amount: webhookData.transferAmount,
        content: webhookData.content,
        accountNumber: webhookData.accountNumber,
        transactionDate: webhookData.transactionDate
      });

      // Tìm payment theo amount và thời gian gần đây (trong vòng 1 giờ)
      const payment = await this.paymentRepository
        .createQueryBuilder('payment')
        .where('payment.amount = :amount', { amount: webhookData.transferAmount })
        .andWhere('payment.status = :status', { status: 'pending' })
        .orderBy('payment.id', 'DESC')
        .getOne();

      this.logger.log(`Looking for payment with amount: ${webhookData.transferAmount}`);
      
      // Debug: Log all pending payments
      const allPendingPayments = await this.paymentRepository.find({
        where: { status: 'pending' },
        take: 10
      });
      this.logger.log(`Found ${allPendingPayments.length} pending payments in last 10 records:`);
      allPendingPayments.forEach(p => {
        this.logger.log(`- Payment ${p.id}: amount=${p.amount}, type=${p.payment_type}, subscription_id=${p.subscription_id}`);
      });
      
      if (payment) {
        this.logger.log(`Found payment: ${payment.id}, type: ${payment.payment_type}, subscription_id: ${payment.subscription_id}`);
        // Cập nhật payment status
        await this.paymentRepository.update(payment.id, { status: 'success' });
        
        // Xử lý theo loại payment
        if (payment.payment_type === 'deposit') {
          // Nạp tiền vào wallet
          await this.userWalletService.addBalance(payment.user_id, payment.amount);
          this.logger.log(`Added ${payment.amount} VND to user ${payment.user_id} wallet`);
        } else if (payment.payment_type === 'subscription') {
          // Kích hoạt subscription
          if (payment.subscription_id) {
            await this.subscriptionRepository.update(payment.subscription_id, { 
              status: 'active' 
            });
            this.logger.log(`Activated subscription ${payment.subscription_id}`);
          }
          
          // Tạo 2 wallet transactions: credit và debit để cân bằng
          const userWallet = await this.userWalletService.findByUserId(payment.user_id);
          
          // Transaction 1: Credit (tiền vào) 
          await this.userWalletService.createTransaction({
            wallet_id: userWallet.id,
            payment_id: payment.id,
            change_amount: payment.amount, // Positive for credit
            balance_after: userWallet.balance,
            type: 'subscription_payment_in',
          });
          
          // Transaction 2: Debit (tiền ra)
          await this.userWalletService.createTransaction({
            wallet_id: userWallet.id,
            payment_id: payment.id,
            change_amount: -payment.amount, // Negative for debit
            balance_after: userWallet.balance,
            type: 'subscription_payment_out',
          });
          
          this.logger.log(`Created balanced wallet transactions for subscription payment`);
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
    const params = new URLSearchParams({
      acc: '1036053562',
      bank: 'Vietcombank',
      amount: amount,
      des: description
    });
    return `${baseUrl}?${params.toString()}`;
  }
}