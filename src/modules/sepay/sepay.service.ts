import { Injectable, Logger } from '@nestjs/common';
import { UserPackageService } from '../user-package/user-package.service';
import { SepayWebhookDto, CreatePaymentDto } from './dto/sepay.dto';

@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);

  constructor(
    private readonly userPackageService: UserPackageService,
  ) {}

  async handleWebhook(webhookData: SepayWebhookDto): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Received Sepay webhook: ${JSON.stringify(webhookData)}`);

      // Kiểm tra giao dịch có tiền vào không
      if (webhookData.amountIn <= 0) {
        this.logger.warn('Transaction has no money in, skipping...');
        return { success: false, message: 'No money in' };
      }

      // Parse nội dung chuyển khoản để lấy userId và packageId
      const { userId, packageId } = this.parseTransferContent(webhookData.content);
      
      if (!userId || !packageId) {
        this.logger.warn(`Cannot parse userId or packageId from content: ${webhookData.content}`);
        return { success: false, message: 'Invalid transfer content' };
      }

      // Kiểm tra xem đã có bản ghi chưa
      const existingRecord = await this.userPackageService.findByUserAndPackage(userId, packageId);
      
      if (existingRecord) {
        // Cập nhật trạng thái thanh toán
        await this.userPackageService.markAsPaid(existingRecord.id);
        this.logger.log(`Updated payment status for user ${userId}, package ${packageId}`);
      } else {
        // Tạo bản ghi mới với trạng thái đã thanh toán
        await this.userPackageService.create({
          userId,
          packageId,
          isPaid: true,
        });
        this.logger.log(`Created new paid subscription for user ${userId}, package ${packageId}`);
      }

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

    // Tạo bản ghi user-package với trạng thái chưa thanh toán
    await this.userPackageService.create({
      userId: createPaymentDto.userId,
      packageId: createPaymentDto.packageId,
      isPaid: false,
    });

    this.logger.log(`Created payment ${paymentId} for user ${createPaymentDto.userId}, package ${createPaymentDto.packageId}`);

    return { paymentId, qrUrl };
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