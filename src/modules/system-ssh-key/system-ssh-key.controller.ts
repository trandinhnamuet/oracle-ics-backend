import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SystemSshKeyService } from './system-ssh-key.service';

/**
 * Controller for managing system SSH keys
 */
@Controller('system-ssh-key')
@UseGuards(JwtAuthGuard)
export class SystemSshKeyController {
  constructor(private readonly systemSshKeyService: SystemSshKeyService) {}

  /**
   * Get admin decrypted private SSH key
   * ⚠️ WARNING: This endpoint returns sensitive data. Use with extreme caution.
   * Should only be called by authorized administrators.
   * 
   * @returns {Promise<{privateKey: string}>} Decrypted private SSH key of admin
   */
  @Get('admin-private-key')
  async getAdminPrivateKey(): Promise<{
    privateKey: string;
    publicKey: string;
    fingerprint: string;
  }> {
    console.log('\n🔐 API CALL: GET /system-ssh-key/admin-private-key');
    console.log('=' .repeat(80));
    
    const adminKey = await this.systemSshKeyService.getAdminKey();
    
    console.log('\n📤 Preparing response...');
    console.log(`   Public key: ${adminKey.publicKey.substring(0, 80)}...`);
    console.log(`   Public key starts with: ${adminKey.publicKey.substring(0, 20)}`);
    console.log(`   Private key starts with: ${adminKey.privateKey.substring(0, 50)}`);
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);
    console.log('=' .repeat(80) + '\n');
    
    return {
      privateKey: adminKey.privateKey,
      publicKey: adminKey.publicKey,
      fingerprint: adminKey.fingerprint,
    };
  }

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
