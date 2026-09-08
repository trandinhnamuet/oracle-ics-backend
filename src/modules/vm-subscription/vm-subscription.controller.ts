import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Headers,
  HttpStatus,
  HttpCode,
  Logger, ParseUUIDPipe, } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VmSubscriptionService } from './vm-subscription.service';
import { ConfigureVmDto, RequestNewKeyDto, ResetWindowsPasswordDto, SendActionOtpDto } from './dto';
import { VmActionDto } from '../vm-provisioning/dto';

@Controller('vm-subscription')
@UseGuards(JwtAuthGuard)
export class VmSubscriptionController {
  private readonly logger = new Logger(VmSubscriptionController.name);
  constructor(private readonly vmSubscriptionService: VmSubscriptionService) {}

  /**
   * Get VM details for a subscription
   * GET /vm-subscription/:subscriptionId
   */
  @Get(':subscriptionId')
  async getSubscriptionVm(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
  ) {
    const userId = req.user.id;
    const role = req.user.role;
    return this.vmSubscriptionService.getSubscriptionVm(subscriptionId, userId, role);
  }

  /**
   * Reveal the initial Windows password to the VM owner — once.
   * POST /vm-subscription/:subscriptionId/reveal-initial-password
   *
   * POST (not GET) because it mutates: the stored password is erased as it is
   * returned, so it can never be read a second time. Admins are rejected by the
   * service; they may reset a password but never read one.
   */
  @Post(':subscriptionId/reveal-initial-password')
  @HttpCode(HttpStatus.OK)
  async revealInitialWindowsPassword(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
  ) {
    return this.vmSubscriptionService.revealInitialWindowsPassword(
      subscriptionId,
      req.user.id,
      req.user.role,
    );
  }

  /**
   * Configure VM for a subscription (create new or reconfigure)
   * POST /vm-subscription/:subscriptionId/configure
   */
  @Post(':subscriptionId/configure')
  @HttpCode(HttpStatus.OK)
  async configureVm(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Body() configureVmDto: ConfigureVmDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const userId = req.user.id;
    this.logger.log(`[ConfigureVm] accept-language header: "${acceptLanguage ?? 'undefined'}"`);
    return this.vmSubscriptionService.configureSubscriptionVm(
      subscriptionId,
      userId,
      configureVmDto,
      acceptLanguage,
    );
  }

  /**
   * Send an OTP to the user's email to confirm a sensitive VM action.
   * POST /vm-subscription/:subscriptionId/send-action-otp
   * Body: { action: 'request-key' | 'reset-password' }
   * The language of the OTP email follows the Accept-Language header.
   */
  @Post(':subscriptionId/send-action-otp')
  @HttpCode(HttpStatus.OK)
  async sendActionOtp(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Body() body: SendActionOtpDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const userId = req.user.id;
    await this.vmSubscriptionService.sendActionOtp(
      subscriptionId,
      userId,
      body.action,
      acceptLanguage,
    );
    return { success: true, message: 'OTP has been sent to your email.' };
  }

  /**
   * Request new SSH key for subscription's VM
   * POST /vm-subscription/:subscriptionId/request-key
   */
  @Post(':subscriptionId/request-key')
  @HttpCode(HttpStatus.OK)
  async requestNewKey(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Body() requestNewKeyDto: RequestNewKeyDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    this.logger.log(
      `Request New SSH Key endpoint hit (subscriptionId=${subscriptionId}, userId=${req.user?.id})`,
    );

    const userId = req.user.id;
    return this.vmSubscriptionService.requestNewSshKey(
      subscriptionId,
      userId,
      requestNewKeyDto.email,
      acceptLanguage,
      requestNewKeyDto.otpCode,
    );
  }

  /**
   * Perform action on subscription's VM (Start, Stop, Restart)
   * POST /vm-subscription/:subscriptionId/action
   */
  @Post(':subscriptionId/action')
  @HttpCode(HttpStatus.OK)
  async performVmAction(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Body() vmActionDto: VmActionDto,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    this.logger.log(
      `VM action requested: action=${vmActionDto.action} subscriptionId=${subscriptionId} userId=${userId} userRole=${userRole}`,
    );

    return this.vmSubscriptionService.performVmAction(
      subscriptionId,
      userId,
      vmActionDto.action,
      userRole,
    );
  }

  /**
   * Start an async Windows password reset job.
   * POST /vm-subscription/:subscriptionId/reset-windows-password
   * Body: { otpCode: string, newPassword?: string }
   * Returns 202 Accepted with { jobId }. Poll the status endpoint for the result.
   */
  @Post(':subscriptionId/reset-windows-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async resetWindowsPassword(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Body() body: ResetWindowsPasswordDto,
  ) {
    this.logger.log(
      `Reset Windows password requested: subscriptionId=${subscriptionId} userId=${req.user?.id} customPasswordProvided=${!!body?.newPassword}`,
    );

    const userId = req.user.id;
    const jobId = await this.vmSubscriptionService.startResetWindowsPasswordAsync(
      subscriptionId,
      userId,
      body?.newPassword,
      body?.otpCode,
    );
    return { jobId };
  }

  /**
   * Poll the status of an async Windows password reset job.
   * GET /vm-subscription/:subscriptionId/reset-windows-password-status/:jobId
   */
  @Get(':subscriptionId/reset-windows-password-status/:jobId')
  async getResetWindowsPasswordStatus(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
    @Param('jobId') jobId: string,
  ) {
    const isAdmin = req.user?.role === 'admin';
    const job = this.vmSubscriptionService.getResetPasswordJobStatus(
      subscriptionId,
      jobId,
      req.user?.id,
      isAdmin,
    );
    if (!job) {
      return { status: 'not_found' };
    }
    // SECURITY: the completed job carries the new plaintext password. It is meant
    // for the VM owner only — an administrator may trigger a reset but must never
    // receive the resulting credential, so strip it for admin callers.
    if (req.user?.role === 'admin') {
      const { newPassword: _withheld, ...safeJob } = job as any;
      return safeJob;
    }
    return job;
  }

  /**
   * Delete VM only (keep subscription)
   * DELETE /vm-subscription/:subscriptionId/vm-only
   */
  @Delete(':subscriptionId/vm-only')
  @HttpCode(HttpStatus.OK)
  async deleteVmOnly(
    @Request() req,
    @Param('subscriptionId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) subscriptionId: string,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    return this.vmSubscriptionService.deleteVmOnly(
      subscriptionId,
      userId,
      userRole,
    );
  }
}
