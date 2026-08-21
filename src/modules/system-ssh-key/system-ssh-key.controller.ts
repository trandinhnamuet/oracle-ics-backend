import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { SystemSshKeyService } from './system-ssh-key.service';

/**
 * Controller for managing system SSH keys
 */
@Controller('system-ssh-key')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SystemSshKeyController {
  constructor(private readonly systemSshKeyService: SystemSshKeyService) {}

  // SECURITY: the endpoint that returned the fleet master PRIVATE key over HTTP
  // has been removed. It had no client caller, and exposing the key that grants
  // root to every Linux VM through any read endpoint is an unacceptable blast
  // radius (one stolen admin token / XSS / guard regression = whole-fleet root).
  // Internal callers use SystemSshKeyService.getAdminKey() directly.

  /**
   * Get admin public SSH key only
   *
   * @returns {Promise<{publicKey: string}>} Public SSH key of admin
   */
  @Get('admin-public-key')
  async getAdminPublicKey(): Promise<{
    publicKey: string;
    fingerprint: string;
  }> {
    const adminKey = await this.systemSshKeyService.getAdminKey();
    
    return {
      publicKey: adminKey.publicKey,
      fingerprint: adminKey.fingerprint,
    };
  }
}
