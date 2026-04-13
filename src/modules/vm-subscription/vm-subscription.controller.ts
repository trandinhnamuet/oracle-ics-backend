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
  Logger,
} from '@nestjs/common';
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
    @Param('subscriptionId') subscriptionId: string,
  ) {
    const userId = req.user.id;
    const role = req.user.role;
    return this.vmSubscriptionService.getSubscriptionVm(subscriptionId, userId, role);
  }

  /**
   * Configure VM for a subscription (create new or reconfigure)
   * POST /vm-subscription/:subscriptionId/configure
   */
  @Post(':subscriptionId/configure')
  @HttpCode(HttpStatus.OK)
  async configureVm(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
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
    @Param('subscriptionId') subscriptionId: string,
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
    @Param('subscriptionId') subscriptionId: string,
    @Body() requestNewKeyDto: RequestNewKeyDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    console.log('🚀 Controller: Request New SSH Key endpoint hit');
    console.log('📋 Subscription ID:', subscriptionId);
    console.log('👤 User ID:', req.user?.id);
    console.log('📧 Request Body:', requestNewKeyDto);
    
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
    @Param('subscriptionId') subscriptionId: string,
    @Body() vmActionDto: VmActionDto,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    console.log('\n========== VM ACTION ENDPOINT ==========');
    console.log('📍 Endpoint: POST /vm-subscription/:subscriptionId/action');
    console.log('📋 Subscription ID:', subscriptionId);
    console.log('👤 User ID:', userId);
    console.log('👤 User Role:', userRole);
    console.log('🎯 Action:', vmActionDto.action);
    console.log('========================================\n');
    
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
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: ResetWindowsPasswordDto,
  ) {
    console.log('\n========== RESET WINDOWS PASSWORD ENDPOINT ==========');
    console.log('📋 Subscription ID:', subscriptionId);
    console.log('👤 User ID:', req.user?.id);
    console.log('🔑 Custom password provided:', !!body?.newPassword);
    console.log('====================================================\n');

    const userId = req.user.id;
    const jobId = this.vmSubscriptionService.startResetWindowsPasswordAsync(
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
    @Param('subscriptionId') subscriptionId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = this.vmSubscriptionService.getResetPasswordJobStatus(subscriptionId, jobId);
    if (!job) {
      return { status: 'not_found' };
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
    @Param('subscriptionId') subscriptionId: string,
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
