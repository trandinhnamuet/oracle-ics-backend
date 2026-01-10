import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { 
  TestEmailDto, 
  EmailVerificationDto, 
  PasswordResetDto 
} from './dto/send-email.dto';

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * GET /email/status - Kiểm tra trạng thái email service
   */
  @Get('status')
  async getEmailStatus() {
    this.logger.log('📊 Checking email service status...');
    
    const status = await this.emailService.checkEmailService();
    const config = this.emailService.getEmailConfig();
    
    return {
      ...status,
      config: {
        ...config,
        // Ẩn thông tin nhạy cảm
        user: config.user ? config.user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'Not configured',
        pass: config.isConfigured ? '***configured***' : 'Not configured',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /email/test - Gửi email test
   */
  @Post('test')
  async sendTestEmail(@Body() testEmailDto: TestEmailDto) {
    this.logger.log(`🧪 Sending test email to: ${testEmailDto.to}`);
    
    try {
      const success = await this.emailService.sendTestEmail(testEmailDto);
      
      if (success) {
        return {
          success: true,
          message: `Test email sent successfully to ${testEmailDto.to}`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          message: 'Failed to send test email',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error('❌ Error in sendTestEmail:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * POST /email/verify - Gửi email xác thực đăng ký
   */
  @Post('verify')
  async sendEmailVerification(@Body() emailVerificationDto: EmailVerificationDto) {
    this.logger.log(`📧 Sending email verification to: ${emailVerificationDto.to}`);
    
    try {
      const success = await this.emailService.sendEmailVerification({
        to: emailVerificationDto.to,
        userName: emailVerificationDto.userName,
        verificationCode: emailVerificationDto.verificationCode,
        expirationMinutes: emailVerificationDto.expirationMinutes,
      });
      
      if (success) {
        return {
          success: true,
          message: `Email verification sent successfully to ${emailVerificationDto.to}`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          message: 'Failed to send email verification',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error('❌ Error in sendEmailVerification:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * POST /email/reset-password - Gửi email đặt lại mật khẩu
   */
  @Post('reset-password')
  async sendPasswordReset(@Body() passwordResetDto: PasswordResetDto) {
    this.logger.log(`🔐 Sending password reset to: ${passwordResetDto.to}`);
    
    try {
      const success = await this.emailService.sendPasswordReset({
        to: passwordResetDto.to,
        userName: passwordResetDto.userName,
        resetCode: passwordResetDto.resetCode,
        expirationMinutes: passwordResetDto.expirationMinutes,
      });
      
      if (success) {
        return {
          success: true,
          message: `Password reset email sent successfully to ${passwordResetDto.to}`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          message: 'Failed to send password reset email',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error('❌ Error in sendPasswordReset:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}