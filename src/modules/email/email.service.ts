import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { 
  EmailOptions, 
  TestEmailData, 
  EmailVerificationData, 
  PasswordResetData 
} from './interfaces/email-options.interface';
import { TestEmailTemplate } from './templates/test-email.template';
import { EmailVerificationTemplate } from './templates/email-verification.template';
import { PasswordResetTemplate } from './templates/password-reset.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    try {
      // Cấu hình SMTP từ environment variables
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false, // Cho development, nên set true trong production
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.logger.log('✅ Email service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize email service:', error);
    }
  }

  /**
   * Gửi email chung (raw email)
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `${process.env.SMTP_FROM_NAME || 'Oracle ICS'} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      this.logger.log(`📧 Email sent successfully to: ${options.to}`);
      this.logger.debug(`Message ID: ${result.messageId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  /**
   * Gửi email test
   */
  async sendTestEmail(data: TestEmailData): Promise<boolean> {
    try {
      this.logger.log(`🧪 Sending test email to: ${data.to}`);
      
      const { subject, html } = TestEmailTemplate.generate(data);
      
      return await this.sendEmail({
        to: data.to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('❌ Failed to send test email:', error);
      return false;
    }
  }

  /**
   * Gửi email xác thực đăng ký
   */
  async sendEmailVerification(data: EmailVerificationData): Promise<boolean> {
    try {
      this.logger.log(`📧 Sending email verification to: ${data.to}`);
      
      const { subject, html } = EmailVerificationTemplate.generate(data);
      
      return await this.sendEmail({
        to: data.to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('❌ Failed to send email verification:', error);
      return false;
    }
  }

  /**
   * Gửi email đặt lại mật khẩu
   */
  async sendPasswordReset(data: PasswordResetData): Promise<boolean> {
    try {
      this.logger.log(`🔐 Sending password reset to: ${data.to}`);
      
      const { subject, html } = PasswordResetTemplate.generate(data);
      
      return await this.sendEmail({
        to: data.to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('❌ Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Kiểm tra trạng thái email service
   */
  async checkEmailService(): Promise<{ status: boolean; message: string }> {
    try {
      if (!this.transporter) {
        return {
          status: false,
          message: 'Email transporter not initialized'
        };
      }

      await this.transporter.verify();
      
      return {
        status: true,
        message: 'Email service is working properly'
      };
    } catch (error) {
      return {
        status: false,
        message: `Email service error: ${error.message}`
      };
    }
  }

  /**
   * Lấy cấu hình email hiện tại (cho debugging)
   */
  getEmailConfig(): any {
    return {
      host: process.env.SMTP_HOST || 'Not configured',
      port: process.env.SMTP_PORT || 'Not configured',
      user: process.env.SMTP_USER || 'Not configured',
      from: process.env.SMTP_FROM || 'Not configured',
      fromName: process.env.SMTP_FROM_NAME || 'Oracle ICS',
      isConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    };
  }
}