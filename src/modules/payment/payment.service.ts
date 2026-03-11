import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async create(createPaymentDto: CreatePaymentDto): Promise<Payment> {
    // Generate unique transaction code if not provided
    if (!createPaymentDto.transaction_code) {
      createPaymentDto.transaction_code = `PAY_${Date.now()}_${uuidv4().substring(0, 8)}`;
    }

    // Tạo object payment mà không include metadata
    const { metadata, ...paymentData } = createPaymentDto;
    
    const payment = this.paymentRepository.create({
      ...paymentData,
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
      relations: ['user'],
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

    // Update payment status
    payment.status = 'success';
    await this.paymentRepository.save(payment);

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
      console.warn(
        `[PaymentService][recordSubscriptionExpense] No wallet found for user ${payment.user_id}`,
      );
      return;
    }

    const currentBalance = Number(userWallet.balance);
    const amount = Number(payment.amount);

    // Credit: tiền vào hệ thống qua QR — tính vào Tổng nạp
    await this.walletTransactionRepository.save(
      this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: payment.id,
        change_amount: amount,
        balance_after: currentBalance,
        type: 'qr_payment_received',
      }),
    );

    // Debit: chi phí gói dịch vụ — tính vào Tổng chi
    await this.walletTransactionRepository.save(
      this.walletTransactionRepository.create({
        wallet_id: userWallet.id,
        payment_id: payment.id,
        change_amount: -amount,
        balance_after: currentBalance,
        type: 'qr_subscription_payment',
      }),
    );

    console.log(
      `[PaymentService][recordSubscriptionExpense] Recorded QR credit+debit ` +
        `paymentId=${payment.id} amount=${amount} userId=${payment.user_id}`,
    );
  }

  private async activateSubscription(subscriptionId: string): Promise<void> {
    console.log(`[PaymentService][activateSubscription] activating subscription id=${subscriptionId}`);
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      console.warn(`[PaymentService][activateSubscription] subscription not found id=${subscriptionId}`);
      throw new NotFoundException(`Subscription with ID ${subscriptionId} not found`);
    }

    subscription.status = 'active';
    await this.subscriptionRepository.save(subscription);
    console.log(`[PaymentService][activateSubscription] subscription activated id=${subscriptionId}`);

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
          console.log(`[PaymentService][activateSubscription] Sent subscription notification to user ${subscription.user_id}`);
        }
      }
    } catch (notificationErr) {
      console.error(`[PaymentService][activateSubscription] Failed to send subscription notification: ${notificationErr.message}`);
    }
  }

  private async updateUserWallet(payment: Payment): Promise<void> {
    console.log(`[PaymentService][updateUserWallet] start paymentId=${payment.id} user_id=${payment.user_id} amount=${payment.amount}`);
    // Find user wallet
    const userWallet = await this.userWalletRepository.findOne({
      where: { user_id: payment.user_id },
    });

    console.log(`[PaymentService][updateUserWallet] findOne returned ${userWallet ? 'wallet id=' + userWallet.id : 'null'}`);

    if (!userWallet) {
      throw new NotFoundException(`User wallet for user ${payment.user_id} not found`);
    }

    const balanceBefore = Number(userWallet.balance);
    const paymentAmountNum = Number(payment.amount);
    console.log(`[PaymentService][updateUserWallet] calculating: balanceBefore(${typeof balanceBefore})=${balanceBefore} + paymentAmount(${typeof paymentAmountNum})=${paymentAmountNum}`);
    const balanceAfter = balanceBefore + paymentAmountNum;
    console.log(`[PaymentService][updateUserWallet] balanceAfter=${balanceAfter}`);

    // Update wallet balance
    userWallet.balance = balanceAfter;
    const savedWallet = await this.userWalletRepository.save(userWallet);
    console.log(`[PaymentService][updateUserWallet] userWallet saved id=${savedWallet.id} balanceBefore=${balanceBefore} paymentAmount=${paymentAmountNum} balanceAfter=${balanceAfter} savedBalance=${savedWallet.balance}`);

    // Create wallet transaction record
    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: payment.id,
      change_amount: payment.amount,
      balance_after: balanceAfter,
      type: 'deposit',
    });

    const savedTx = await this.walletTransactionRepository.save(walletTransaction);
    console.log(`[PaymentService][updateUserWallet] walletTransaction saved id=${savedTx.id} wallet_id=${savedTx.wallet_id} change_amount=${savedTx.change_amount}`);
  }

  async handleSepayCallback(data: any): Promise<any> {
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
      return { success: false, error: error.message };
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

    console.log(`[PaymentService] Marked ${stale.length} expired pending payment(s) as expired (older than ${ageMinutes} min)`);
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