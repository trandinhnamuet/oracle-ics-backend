import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailVerification } from '../../entities/email-verification.entity';
import { EmailService } from '../email/email.service';
import { otpEmailTemplate } from '../../templates/otp-email.template';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 5;
  private readonly RESEND_COOLDOWN_SECONDS = 30;

  constructor(
    @InjectRepository(EmailVerification)
    private emailVerificationRepository: Repository<EmailVerification>,
    private emailService: EmailService,
  ) {}

  /**
   * Generate 6-digit OTP
   */
  generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Create or update OTP verification record
   */
  async createOrUpdateOtp(email: string): Promise<{ otpCode: string; canResend: boolean }> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Check existing record
      const existing = await this.emailVerificationRepository.findOne({
        where: { email },
      });

      // Check resend cooldown
      if (existing && existing.lastResendAt) {
        const timeSinceLastResend = now.getTime() - existing.lastResendAt.getTime();
        const cooldownMs = this.RESEND_COOLDOWN_SECONDS * 1000;
        
        if (timeSinceLastResend < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastResend) / 1000);
          throw new BadRequestException(`Please wait ${remainingSeconds} seconds before requesting new OTP`);
        }
      }

      const otpCode = this.generateOtp();

      if (existing) {
        // Update existing record
        existing.otpCode = otpCode;
        existing.expiresAt = expiresAt;
        existing.lastResendAt = now;
        existing.attemptCount = 0; // Reset attempts on new OTP
        await this.emailVerificationRepository.save(existing);
      } else {
        // Create new record
        const verification = this.emailVerificationRepository.create({
          email,
          otpCode,
          expiresAt,
          lastResendAt: now,
          attemptCount: 0,
        });
        await this.emailVerificationRepository.save(verification);
      }

      // Send OTP email
      const emailTemplate = otpEmailTemplate(otpCode);
      await this.emailService.sendEmail({
        to: email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text,
      });

      this.logger.log(`OTP created and sent to ${email}: ${otpCode}`);
      return { otpCode, canResend: true };
    } catch (error) {
      this.logger.error(`Failed to create OTP for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(email: string, otpCode: string): Promise<{ valid: boolean; error?: string }> {
    try {
      this.logger.log(`Attempting to verify OTP for email: ${email}, code: ${otpCode}`);
      
      const verification = await this.emailVerificationRepository.findOne({
        where: { email },
      });

      if (!verification) {
        this.logger.log(`No OTP record found for email: ${email}`);
        return { valid: false, error: 'No OTP found for this email' };
      }

      this.logger.log(`Found OTP record for ${email}: code=${verification.otpCode}, expires=${verification.expiresAt}, attempts=${verification.attemptCount}`);

      // Check expiry
      if (new Date() > verification.expiresAt) {
        await this.emailVerificationRepository.delete({ email });
        return { valid: false, error: 'OTP has expired. Please request a new one.' };
      }

      // Check attempts
      if (verification.attemptCount >= this.MAX_ATTEMPTS) {
        await this.emailVerificationRepository.delete({ email });
        return { valid: false, error: 'Too many failed attempts. Please request a new OTP.' };
      }

      // Check OTP code
      if (verification.otpCode !== otpCode) {
        verification.attemptCount += 1;
        await this.emailVerificationRepository.save(verification);
        const remaining = this.MAX_ATTEMPTS - verification.attemptCount;
        this.logger.log(`Invalid OTP for ${email}. Expected: ${verification.otpCode}, Received: ${otpCode}`);
        return { valid: false, error: `Invalid OTP. ${remaining} attempts remaining.` };
      }

      // OTP is valid - delete the record
      await this.emailVerificationRepository.delete({ email });
      this.logger.log(`OTP verified successfully for ${email}`);
      return { valid: true };
    } catch (error) {
      this.logger.error(`Failed to verify OTP for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Check if can resend OTP (for rate limiting)
   */
  async canResendOtp(email: string): Promise<{ canResend: boolean; remainingSeconds?: number }> {
    try {
      const verification = await this.emailVerificationRepository.findOne({
        where: { email },
      });

      if (!verification || !verification.lastResendAt) {
        return { canResend: true };
      }

      const now = new Date().getTime();
      const lastResend = verification.lastResendAt.getTime();
      const timeSinceLastResend = now - lastResend;
      const cooldownMs = this.RESEND_COOLDOWN_SECONDS * 1000;

      if (timeSinceLastResend < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastResend) / 1000);
        return { canResend: false, remainingSeconds };
      }

      return { canResend: true };
    } catch (error) {
      this.logger.error(`Failed to check resend status for ${email}:`, error);
      return { canResend: false };
    }
  }

  /**
   * Get OTP time remaining (for frontend countdown)
   */
  async getOtpTimeRemaining(email: string): Promise<number | null> {
    try {
      const verification = await this.emailVerificationRepository.findOne({
        where: { email },
      });

      if (!verification) return null;

      const now = new Date().getTime();
      const expiresAt = new Date(verification.expiresAt).getTime();
      const remaining = Math.max(0, expiresAt - now);

      return remaining; // in milliseconds
    } catch (error) {
      this.logger.error(`Failed to get OTP time remaining for ${email}:`, error);
      return null;
    }
  }

  /**
   * Cleanup expired OTPs (called by scheduler)
   */
  async cleanupExpiredOtps(): Promise<void> {
    try {
      const result = await this.emailVerificationRepository
        .createQueryBuilder()
        .delete()
        .where('expires_at < :now', { now: new Date() })
        .execute();
        
      this.logger.log(`Cleaned up ${result.affected} expired OTP records`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired OTPs:', error);
    }
  }
}