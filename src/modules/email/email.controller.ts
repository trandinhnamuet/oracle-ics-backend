import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

/**
 * Operational status only.
 *
 * This controller used to expose POST /email/test, /email/verify and
 * /email/reset-password with no authentication. Each accepted a recipient
 * address in the request body and sent through the application's own SMTP
 * identity, so anyone on the internet could use the service to send mail —
 * spam, phishing under our sender reputation, and metered cost.
 *
 * They were diagnostic helpers: no client ever called them, and the real
 * registration, verification and password-reset flows call EmailService
 * in-process (auth.service.ts, otp.service.ts), generating the recipient and
 * message content from stored server-side state. The endpoints are therefore
 * removed rather than merely guarded — the abuse surface is gone, not gated.
 */
@Controller('email')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * GET /email/status - health of the SMTP transport. Administrators only.
   */
  @Get('status')
  async getEmailStatus() {
    this.logger.log('Checking email service status');
    const result = await this.emailService.checkEmailService();
    return {
      success: true,
      status: result.status ? 'ready' : 'unavailable',
      message: result.message,
      timestamp: new Date().toISOString(),
    };
  }
}
