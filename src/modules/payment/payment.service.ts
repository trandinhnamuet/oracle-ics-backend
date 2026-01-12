import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { UserWallet } from '../../entities/user-wallet.entity';
import { WalletTransaction } from '../../entities/wallet-transaction.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
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
      // order: {
      //   created_at: 'DESC',
      // },
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

    // Update payment status
    payment.status = 'success';
    await this.paymentRepository.save(payment);

    // If payment type is deposit, update user wallet
    if (payment.payment_type === 'deposit') {
      await this.updateUserWallet(payment);
    }

    return payment;
  }

  private async updateUserWallet(payment: Payment): Promise<void> {
    // Find user wallet
    const userWallet = await this.userWalletRepository.findOne({
      where: { user_id: payment.user_id },
    });

    if (!userWallet) {
      throw new NotFoundException(`User wallet for user ${payment.user_id} not found`);
    }

    const balanceBefore = userWallet.balance;
    const balanceAfter = balanceBefore + payment.amount;

    // Update wallet balance
    userWallet.balance = balanceAfter;
    await this.userWalletRepository.save(userWallet);

    // Create wallet transaction record
    const walletTransaction = this.walletTransactionRepository.create({
      wallet_id: userWallet.id,
      payment_id: payment.id,
      change_amount: payment.amount,
      balance_after: balanceAfter,
      type: 'deposit',
    });

    await this.walletTransactionRepository.save(walletTransaction);
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

  // Admin manually accept a pending payment
  async acceptPayment(id: string): Promise<Payment> {
    const payment = await this.findOne(id);

    if (payment.status !== 'pending') {
      throw new Error(`Cannot accept payment with status: ${payment.status}`);
    }

    // Update payment status to success
    payment.status = 'success';
    await this.paymentRepository.save(payment);

    // If payment type is deposit, update user wallet
    if (payment.payment_type === 'deposit') {
      await this.updateUserWallet(payment);
    }

    return payment;
  }
}