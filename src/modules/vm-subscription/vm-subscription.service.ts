import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VmProvisioningService } from '../vm-provisioning/vm-provisioning.service';
import { SystemSshKeyService } from '../system-ssh-key/system-ssh-key.service';
import { OciService } from '../oci/oci.service';
import { encryptPrivateKey, decryptPrivateKey } from '../../utils/system-ssh-key.util';
import { Subscription } from '../../entities/subscription.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { ConfigureVmDto } from './dto';
import { VmActionType } from '../vm-provisioning/dto';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class VmSubscriptionService {
  private readonly logger = new Logger(VmSubscriptionService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(VmInstance)
    private readonly vmInstanceRepo: Repository<VmInstance>,
    private readonly vmProvisioningService: VmProvisioningService,
    private readonly systemSshKeyService: SystemSshKeyService,
    private readonly ociService: OciService,
  ) {
    // Initialize email transporter
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465, // true for port 465 (SMTPS), false for 587 (STARTTLS)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Check if subscription can be configured (paid and not expired)
   */
  async checkSubscriptionEligibility(subscriptionId: string, userId: number) {
    console.log('\n========== CHECK SUBSCRIPTION ELIGIBILITY ==========');
    console.log('🔍 Searching for subscription...');
    console.log('📋 Subscription ID:', subscriptionId);
    console.log('👤 User ID:', userId);
    console.log('👤 User ID Type:', typeof userId);
    
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId, user_id: userId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      // Log all subscriptions for this user to help debug
      console.log('❌ Subscription NOT FOUND');
      const allUserSubscriptions = await this.subscriptionRepo.find({
        where: { user_id: userId },
      });
      console.log('📊 Total subscriptions for user:', allUserSubscriptions.length);
      console.log('📋 All subscriptions for this user:');
      allUserSubscriptions.forEach((sub, index) => {
        console.log(`  [${index}] ID: ${sub.id}, Status: ${sub.status}, Created: ${sub.created_at}`);
      });
      
      // Also check if subscription exists with ANY user_id
      const subscriptionAnyUser = await this.subscriptionRepo.findOne({
        where: { id: subscriptionId },
      });
      if (subscriptionAnyUser) {
        console.log('⚠️  Subscription EXISTS but belongs to different user!');
        console.log('   Subscription user_id:', subscriptionAnyUser.user_id);
        console.log('   Request user_id:', userId);
      } else {
        console.log('❌ Subscription does NOT exist in database at all');
      }
      console.log('=============================================\n');
      throw new NotFoundException('Subscription not found');
    }

    console.log('✅ Subscription FOUND');
    console.log('📊 Subscription Status:', subscription.status);
    console.log('📊 Configuration Status:', subscription.configuration_status);
    console.log('📊 VM Instance ID:', subscription.vm_instance_id);

    // Check if subscription is paid
    if (subscription.status === 'pending') {
      console.log('⚠️  Subscription payment is pending');
      throw new BadRequestException('Subscription payment is pending');
    }

    if (subscription.status === 'cancelled') {
      console.log('⚠️  Subscription is cancelled');
      throw new BadRequestException('Subscription is cancelled');
    }

    if (subscription.status === 'expired') {
      console.log('⚠️  Subscription has expired');
      throw new BadRequestException('Subscription has expired');
    }

    console.log('✅ Subscription eligibility check PASSED');
    console.log('=============================================\n');
    return subscription;
  }

  /**
   * Configure VM for a subscription (new or reconfigure)
   */
  async configureSubscriptionVm(
    subscriptionId: string,
    userId: number,
    configureVmDto: ConfigureVmDto,
  ) {
    this.logger.log(`Configuring VM for subscription ${subscriptionId}`);

    // Step 1: Check subscription eligibility
    const subscription = await this.checkSubscriptionEligibility(subscriptionId, userId);

    // Update configuration status to 'configuring'
    subscription.configuration_status = 'configuring';
    await this.subscriptionRepo.save(subscription);

    // Step 2: Check if VM already exists for THIS SPECIFIC SUBSCRIPTION
    let existingVm = await this.vmInstanceRepo.findOne({
      where: { 
        subscription_id: subscriptionId,  // Check by subscription_id, not user_id
        user_id: userId,
      },
      relations: [],
    });

    try {
      let vmResult;
      let userSshKeyPair;

      if (existingVm) {
        // Reconfigure existing VM: terminate old VM then provision new one
        this.logger.log(`Subscription ${subscriptionId} already has VM ${existingVm.id}. Terminating old VM before reinstall...`);

        // Step A: Terminate old VM on OCI
        if (existingVm.instance_id && existingVm.instance_id !== 'PENDING') {
          try {
            this.logger.log(`Terminating old VM on OCI: ${existingVm.instance_id}`);
            await this.ociService.terminateInstance(existingVm.instance_id, false);
            this.logger.log(`✅ Old VM terminated on OCI successfully`);
          } catch (ociError) {
            this.logger.warn(`Failed to terminate old VM on OCI (continuing): ${ociError.message}`);
          }
        }

        // Step B: Delete old VM from database
        await this.vmInstanceRepo.remove(existingVm);
        this.logger.log(`✅ Old VM record deleted from database`);

        // Step C: Clear subscription VM reference
        subscription.vm_instance_id = null;
        await this.subscriptionRepo.save(subscription);

        // Step D: Provision new VM
        subscription.configuration_status = 'provisioning';
        await this.subscriptionRepo.save(subscription);

        userSshKeyPair = this.generateSshKeyPair();

        vmResult = await this.vmProvisioningService.provisionVm(userId, {
          displayName: configureVmDto.displayName,
          imageId: configureVmDto.imageId,
          shape: configureVmDto.shape,
          ocpus: configureVmDto.ocpus,
          memoryInGBs: configureVmDto.memoryInGBs,
          bootVolumeSizeInGBs: configureVmDto.bootVolumeSizeInGBs,
          userSshPublicKey: userSshKeyPair.publicKey,
          userSshPrivateKey: userSshKeyPair.privateKey,
          description: configureVmDto.description || `VM for subscription ${subscriptionId}`,
          subscriptionId: subscriptionId,
        });
      } else {
        // Create new VM for this subscription
        this.logger.log(`Creating new VM for subscription ${subscriptionId}`);

        // Update status to provisioning
        subscription.configuration_status = 'provisioning';
        await this.subscriptionRepo.save(subscription);

        // Generate SSH key pair for user
        userSshKeyPair = this.generateSshKeyPair();

        // Provision VM with user's SSH key pair
        vmResult = await this.vmProvisioningService.provisionVm(userId, {
          displayName: configureVmDto.displayName,
          imageId: configureVmDto.imageId,
          shape: configureVmDto.shape,
          ocpus: configureVmDto.ocpus,
          memoryInGBs: configureVmDto.memoryInGBs,
          bootVolumeSizeInGBs: configureVmDto.bootVolumeSizeInGBs,
          userSshPublicKey: userSshKeyPair.publicKey,
          userSshPrivateKey: userSshKeyPair.privateKey, // Pass private key to be encrypted and saved
          description: configureVmDto.description || `VM for subscription ${subscriptionId}`,
          subscriptionId: subscriptionId,
        });
      }

      // Step 3: Update subscription with VM info
      subscription.vm_instance_id = vmResult.id; // Use database UUID, not OCI instance ID
      subscription.status = 'active';
      subscription.configuration_status = 'active';
      subscription.last_configured_at = new Date();
      subscription.provisioning_error = null; // Clear any previous error
      await this.subscriptionRepo.save(subscription);

      // Step 3.5: Poll VM until it reaches RUNNING state
      this.logger.log(`⏳ Waiting for VM to reach RUNNING state...`);
      try {
        const finalState = await this.pollVmUntilRunning(
          vmResult.instanceId, // OCI instance OCID
          5 * 60 * 1000, // 5 minutes max wait
          10 * 1000, // Poll every 10 seconds
        );

        // Update VM state in database
        vmResult.lifecycleState = finalState;
        await this.vmInstanceRepo.update(vmResult.id, {
          lifecycle_state: finalState,
        });

        if (finalState !== 'RUNNING') {
          this.logger.warn(`⚠️ VM did not reach RUNNING state within timeout. Current state: ${finalState}`);
        }
      } catch (pollError) {
        this.logger.error(`❌ Error while polling VM state:`, pollError);
        // Continue with email sending even if polling fails
        // User will still get credentials and can check VM manually
      }

      // Step 4: Send credentials to user via email (SSH key for Linux or password for Windows)
      const userEmail = configureVmDto.notificationEmail || subscription['user']?.email;
      this.logger.log(`📧 ========== EMAIL SENDING CHECK ==========`);
      this.logger.log(`📧 User Email: ${userEmail || 'NOT FOUND'}`);
      this.logger.log(`📧 VM OS: ${vmResult.operatingSystem || 'Unknown'}`);
      
      if (userEmail) {
        const isWindows = vmResult.operatingSystem?.toLowerCase().includes('windows');
        this.logger.log(`📧 Is Windows: ${isWindows}`);
        this.logger.log(`📧 Has Windows Password: ${!!vmResult.windowsInitialPassword}`);
        this.logger.log(`📧 Has SSH Key Pair: ${!!userSshKeyPair}`);
        
        if (isWindows === true) {
          // Confirmed Windows VM
          if (vmResult.windowsInitialPassword) {
            // Windows VM with password - send RDP credentials
            this.logger.log('📧 Sending Windows RDP credentials email...');
            await this.sendWindowsPasswordEmail(
              userEmail,
              {
                name: vmResult.instanceName,
                publicIp: vmResult.publicIp,
                operatingSystem: vmResult.operatingSystem,
                status: vmResult.lifecycleState,
              },
              {
                username: 'opc', // Default OCI Windows username
                password: vmResult.windowsInitialPassword,
              },
              subscription,
            );
            this.logger.log('✅ Windows credentials email sent successfully');
          } else {
            // Windows VM without password - password will be retrieved by background job
            // and sent via email automatically when ready (usually within 5-10 minutes)
            this.logger.warn('⚠️  Windows password not available yet - will be sent via email when ready');
            this.logger.warn('⚠️  Background job is retrieving password and will email user automatically');
            this.logger.warn('⚠️  User does NOT need to access OCI Console');
          }
        } else if (isWindows === false && userSshKeyPair) {
          // Confirmed Linux VM - send SSH key
          this.logger.log('📧 Sending Linux SSH key email...');
          await this.sendSshKeyEmail(
            userEmail,
            {
              displayName: vmResult.instanceName,
              publicIp: vmResult.publicIp,
              instanceOcid: vmResult.instanceId,
            },
            userSshKeyPair,
            subscription,
          );
          this.logger.log('✅ SSH key email sent successfully');
        } else {
          // isWindows is undefined (OS unknown) or missing credentials
          this.logger.warn(`⚠️  Could not send credentials email - OS type unknown or missing required data`);
          this.logger.warn(`⚠️  Is Windows: ${isWindows}, Has Password: ${!!vmResult.windowsInitialPassword}, Has SSH Key: ${!!userSshKeyPair}`);
          this.logger.warn(`⚠️  Operating System: ${vmResult.operatingSystem}`);
          if (isWindows === undefined) {
            this.logger.error('❌ CRITICAL: Could not determine OS type! VM was created but no credentials email sent.');
            this.logger.error('❌ User will need to retrieve credentials manually from OCI Console.');
          }
        }
      } else {
        this.logger.error('❌ No email address found for user!');
      }
      this.logger.log(`📧 ==========================================`);

      this.logger.log(`VM configuration completed for subscription ${subscriptionId}`);
      
      // Return success message (generic for both Linux and Windows)
      const isWindows = vmResult.operatingSystem?.toLowerCase().includes('windows');
      const isWindowsPending = isWindows && !vmResult.windowsInitialPassword;

      return {
        success: true,
        vm: vmResult,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          vmInstanceOcid: subscription.vm_instance_id,
        },
        sshKey: userSshKeyPair ? {
          publicKey: userSshKeyPair.publicKey,
          privateKey: userSshKeyPair.privateKey,
          fingerprint: userSshKeyPair.fingerprint,
        } : undefined,
        message: isWindowsPending 
          ? 'Máy ảo đã tạo thành công. Mật khẩu ban đầu đang được lấy (5-10 phút), sẽ hiển thị trong trang quản lý VM.'
          : 'Máy ảo đã tạo thành công. Vui lòng lưu lại thông tin truy cập đang hiển thị trên màn hình.',
      };
    } catch (error) {
      this.logger.error(`Error configuring VM for subscription ${subscriptionId}:`, error);
      
      // Update subscription status to failed
      try {
        subscription.configuration_status = 'failed';
        subscription.provisioning_error = error.message || 'Unknown error occurred';
        await this.subscriptionRepo.save(subscription);
      } catch (saveError) {
        this.logger.error('Failed to update subscription status:', saveError);
      }
      
      throw new InternalServerErrorException(
        `Failed to configure VM: ${error.message}`,
      );
    }
  }

  /**
   * Poll VM instance state until it reaches RUNNING
   * @param instanceOcid - OCI instance OCID
   * @param maxWaitTimeMs - Maximum time to wait in milliseconds (default: 5 minutes)
   * @param pollIntervalMs - Polling interval in milliseconds (default: 10 seconds)
   * @returns Final lifecycle state
   */
  private async pollVmUntilRunning(
    instanceOcid: string,
    maxWaitTimeMs: number = 5 * 60 * 1000, // 5 minutes default
    pollIntervalMs: number = 10 * 1000, // 10 seconds default
  ): Promise<string> {
    const startTime = Date.now();
    let currentState = 'PROVISIONING';

    this.logger.log(`⏳ Starting to poll VM state for instance: ${instanceOcid}`);
    this.logger.log(`⏳ Max wait time: ${maxWaitTimeMs / 1000}s, Poll interval: ${pollIntervalMs / 1000}s`);

    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const instanceDetails = await this.ociService.getInstance(instanceOcid);
        currentState = instanceDetails.lifecycleState;

        this.logger.log(`🔍 VM state check: ${currentState} (elapsed: ${Math.floor((Date.now() - startTime) / 1000)}s)`);

        if (currentState === 'RUNNING') {
          this.logger.log(`✅ VM is now RUNNING after ${Math.floor((Date.now() - startTime) / 1000)}s`);
          return currentState;
        }

        // Check for failed states
        if (currentState === 'TERMINATED' || currentState === 'TERMINATING') {
          this.logger.error(`❌ VM entered terminal state: ${currentState}`);
          throw new InternalServerErrorException(`VM provisioning failed: Instance is ${currentState}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        this.logger.error(`❌ Error polling VM state:`, error);
        throw error;
      }
    }

    // Timeout reached
    this.logger.warn(`⚠️ Polling timeout reached. VM still in ${currentState} state after ${maxWaitTimeMs / 1000}s`);
    return currentState;
  }

  /**
   * Get VM details for a subscription
   */
  async getSubscriptionVm(subscriptionId: string, userId: number, role?: string) {
    console.log('\n========== GET SUBSCRIPTION VM ==========');
    console.log('🔑 Subscription ID:', subscriptionId);
    console.log('👤 User ID:', userId);
    console.log('🛡️  Role:', role);

    const isAdmin = role === 'admin';

    const subscription = await this.subscriptionRepo.findOne({
      where: isAdmin ? { id: subscriptionId } : { id: subscriptionId, user_id: userId },
      relations: ['cloudPackage', 'user'],
    });

    if (!subscription) {
      console.log('❌ Subscription NOT FOUND');
      console.log('========================================\n');
      throw new NotFoundException('Subscription not found');
    }
    
    console.log('✅ Subscription FOUND');

    // If no VM OCID, subscription is not configured yet
    if (!subscription.vm_instance_id) {
      console.log('⚠️  VM not configured yet for this subscription');
      console.log('========================================\n');
      return {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          packageName: subscription.cloudPackage?.name,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
        },
        vm: null,
        isConfigured: false,
      };
    }

    console.log('🔑 VM Instance ID:', subscription.vm_instance_id);

    // Find VM by ID
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: subscription.vm_instance_id },
    });

    if (!vm) {
      console.log('⚠️  VM Instance not found in database');
      console.log('========================================\n');
      this.logger.warn(`VM not found for subscription ${subscriptionId}, ID: ${subscription.vm_instance_id}`);
      return {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          packageName: subscription.cloudPackage?.name,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
        },
        vm: null,
        isConfigured: false,
      };
    }

    console.log('✅ VM found in database');

    // Get fresh data from OCI (use subscription owner's userId to pass vm-provisioning ownership check)
    const vmDetail = await this.vmProvisioningService.getVmById(subscription.user_id, vm.id);
    console.log('✅ VM details retrieved from OCI');
    console.log('========================================\n');

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        packageName: subscription.cloudPackage?.name,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        autoRenew: subscription.auto_renew,
      },
      vm: vmDetail,
      isConfigured: true,
    };
  }

  /**
   * Request new SSH key for subscription's VM
   */
  async requestNewSshKey(subscriptionId: string, userId: number, email?: string) {
    this.logger.log('========================================');
    this.logger.log(`🔑 REQUEST NEW SSH KEY`);
    this.logger.log(`📋 Subscription ID: ${subscriptionId}`);
    this.logger.log(`👤 User ID: ${userId}`);
    this.logger.log(`📧 Email: ${email || 'Not provided'}`);
    this.logger.log('========================================');

    const subscription = await this.checkSubscriptionEligibility(subscriptionId, userId);
    this.logger.log(`✅ Subscription eligibility check passed`);

    if (!subscription.vm_instance_id) {
      throw new BadRequestException('VM not configured for this subscription');
    }

    // Find VM
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: subscription.vm_instance_id },
    });

    if (!vm) {
      this.logger.error(`❌ VM not found with ID: ${subscription.vm_instance_id}`);
      throw new NotFoundException('VM not found');
    }

    this.logger.log(`✅ VM found: ${vm.instance_name} (${vm.operating_system})`);

    // Check if this is a Windows VM
    const isWindows = vm.operating_system?.toLowerCase().includes('windows');
    this.logger.log(`🖥️  Operating System: ${vm.operating_system}`);
    this.logger.log(`🪟 Is Windows: ${isWindows}`);
    
    if (isWindows) {
      this.logger.warn(`❌ Cannot generate SSH key for Windows VM`);
      throw new BadRequestException(
        'SSH key regeneration is not applicable for Windows VMs. ' +
        'Windows VMs use RDP with password authentication. ' +
        'To reset your password, please use the "Reset Password" option or contact support.'
      );
    }

    // Generate new SSH key pair
    this.logger.log(`🔐 Generating new SSH key pair...`);
    const newKeyPair = this.generateSshKeyPair();
    this.logger.log(`✅ New SSH key generated`);
    this.logger.log(`   Fingerprint: ${newKeyPair.fingerprint}`);

    let updateResult: { id: string; keysCount: number; userKeysCount: number; removedOldest: boolean };

    try {
      // Get admin SSH key
      this.logger.log(`🔑 Retrieving admin SSH key...`);
      const adminKey = await this.systemSshKeyService.getActiveKey();
      
      if (!adminKey) {
        this.logger.error(`❌ No active admin SSH key found`);
        throw new InternalServerErrorException('Admin SSH key not configured');
      }
      
      this.logger.log(`✅ Admin key retrieved`);
      
      // Decrypt admin private key
      this.logger.log(`🔓 Decrypting admin private key...`);
      let adminPrivateKey = decryptPrivateKey(adminKey.private_key_encrypted);
      
      // Convert PKCS#8 to PKCS#1 (RSA PRIVATE KEY) if needed for ssh2 compatibility
      if (adminPrivateKey.includes('BEGIN PRIVATE KEY')) {
        this.logger.log(`🔄 Converting PKCS#8 key to PKCS#1 format...`);
        try {
          const keyObject = crypto.createPrivateKey(adminPrivateKey);
          adminPrivateKey = keyObject.export({
            type: 'pkcs1',
            format: 'pem',
          }).toString();
          this.logger.log(`✅ Key converted to PKCS#1 (RSA PRIVATE KEY)`);
        } catch (convertError) {
          this.logger.warn(`⚠️  Key conversion failed: ${convertError.message}`);
        }
      }
      
      // Ensure key has proper format (newline at end if missing)
      if (!adminPrivateKey.endsWith('\n')) {
        adminPrivateKey += '\n';
      }
      
      this.logger.log(`✅ Admin key decrypted`);
      this.logger.log(`   Key starts with: ${adminPrivateKey.substring(0, 50)}...`);
      this.logger.log(`   Key length: ${adminPrivateKey.length} bytes`);
      
      // Determine SSH username from OS
      const username = this.getOsSshUsername(vm.operating_system);
      this.logger.log(`👤 SSH Username: ${username}`);
      
      // Check if VM has public IP
      if (!vm.public_ip) {
        throw new BadRequestException('VM does not have a public IP address');
      }
      
      // Update SSH keys via SSH connection
      updateResult = await this.ociService.updateInstanceSshKeys(
        vm.instance_id,
        newKeyPair.publicKey,
        vm.public_ip,
        username,
        adminPrivateKey,
      );

      this.logger.log(
        `SSH keys updated. Total keys: ${updateResult.keysCount}, ` +
        `User keys: ${updateResult.userKeysCount}, ` +
        `Oldest user key removed: ${updateResult.removedOldest}`,
      );

      // Update VM record with the new public key (store the most recent one)
      vm.ssh_public_key = newKeyPair.publicKey;
      vm.updated_at = new Date();
      await this.vmInstanceRepo.save(vm);

      // Send new key via email
      const userEmail = email || subscription['user']?.email;
      if (userEmail) {
        await this.sendSshKeyEmail(
          userEmail,
          {
            id: vm.id,
            displayName: vm.instance_name,
            publicIp: vm.public_ip,
            instanceOcid: vm.instance_id,
          },
          newKeyPair,
          subscription,
          true, // isNewKey = true
        );
      }

      return {
        success: true,
        message: `New SSH key generated and applied successfully. ${
          updateResult.removedOldest 
            ? 'The oldest key was removed to maintain the 3-key limit.' 
            : 'Previous keys are still active.'
        }`,
        sshKey: {
          publicKey: newKeyPair.publicKey,
          privateKey: newKeyPair.privateKey,
          fingerprint: newKeyPair.fingerprint,
        },
        keysInfo: {
          totalKeys: updateResult.keysCount,
          removedOldest: updateResult.removedOldest,
        },
      };
    } catch (error) {
      this.logger.error('Error updating SSH keys in OCI:', error);
      throw new BadRequestException(
        `Failed to update SSH keys on VM: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Generate SSH key pair for user
   */
  private generateSshKeyPair() {
    // Generate key pair in proper SSH format directly
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'pkcs1',  // Use PKCS1 for RSA - compatible with SSH
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // Convert PEM RSA public key to SSH format properly
    const publicKeySSH = this.convertRsaPemToOpenSSH(publicKey);
    
    // Calculate fingerprint from the SSH-formatted key
    const keyParts = publicKeySSH.split(' ');
    if (keyParts.length < 2) {
      throw new Error('Invalid SSH public key format');
    }
    
    const keyData = Buffer.from(keyParts[1], 'base64');
    const hash = crypto.createHash('md5').update(keyData).digest('hex');
    const fingerprint = hash.match(/.{2}/g)?.join(':') || '';

    return {
      publicKey: publicKeySSH,
      privateKey: privateKey,
      fingerprint: fingerprint,
    };
  }

  /**
   * Convert RSA PEM public key (PKCS1) to OpenSSH format
   * OpenSSH format: "ssh-rsa [base64-encoded-key] [comment]"
   */
  private convertRsaPemToOpenSSH(pemPublicKey: string): string {
    // Import the PEM key
    const keyObject = crypto.createPublicKey(pemPublicKey);
    
    // Export as SPKI DER format
    const spkiDer = keyObject.export({ type: 'spki', format: 'der' }) as Buffer;
    
    // Parse SPKI to extract RSA key components (n, e)
    // SPKI structure for RSA contains: algorithm OID + BIT STRING with RSA public key
    // For simplicity, we'll use the full SPKI DER in SSH format
    
    // SSH RSA public key format (RFC 4253):
    // string    "ssh-rsa"
    // mpint     e (public exponent)
    // mpint     n (modulus)
    
    // For proper conversion, extract modulus and exponent from SPKI
    const publicKeyInfo = crypto.createPublicKey(pemPublicKey);
    const jwk = publicKeyInfo.export({ format: 'jwk' }) as any;
    
    // Convert JWK n and e to SSH format
    const nBuffer = Buffer.from(jwk.n, 'base64url');
    const eBuffer = Buffer.from(jwk.e, 'base64url');
    
    // Build SSH RSA public key format
    const sshFormatBuffer = this.buildSshRsaPublicKey(eBuffer, nBuffer);
    const base64Key = sshFormatBuffer.toString('base64');
    
    return `ssh-rsa ${base64Key} user@oraclecloud`;
  }

  /**
   * Build SSH RSA public key format according to RFC 4253
   * Format: string "ssh-rsa" + mpint e + mpint n
   */
  private buildSshRsaPublicKey(e: Buffer, n: Buffer): Buffer {
    const algorithmName = 'ssh-rsa';
    
    // Helper to write SSH string
    const writeString = (str: string): Buffer => {
      const strBuf = Buffer.from(str, 'utf-8');
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32BE(strBuf.length, 0);
      return Buffer.concat([lenBuf, strBuf]);
    };
    
    // Helper to write SSH mpint (multiple precision integer)
    const writeMpint = (buf: Buffer): Buffer => {
      // Add leading zero byte if high bit is set (to keep it positive)
      let mpintBuf = buf;
      if (buf[0] & 0x80) {
        mpintBuf = Buffer.concat([Buffer.from([0x00]), buf]);
      }
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32BE(mpintBuf.length, 0);
      return Buffer.concat([lenBuf, mpintBuf]);
    };
    
    // Build the SSH public key
    const parts = [
      writeString(algorithmName),
      writeMpint(e),
      writeMpint(n),
    ];
    
    return Buffer.concat(parts);
  }

  /**
   * Send SSH key to user via email
   */
  private async sendSshKeyEmail(
    email: string,
    vmInfo: any,
    sshKeyPair: { publicKey: string; privateKey: string; fingerprint: string },
    subscription: Subscription,
    isNewKey: boolean = false,
  ) {
    const subject = isNewKey
      ? 'New SSH Key for Your Oracle Cloud VM'
      : 'Your Oracle Cloud VM is Ready!';

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f80000; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; margin: 20px 0; }
            .info-box { background-color: #e8f4f8; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
            .success { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0; }
            .code-block { background-color: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; word-wrap: break-word; }
            .button { display: inline-block; background-color: #f80000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isNewKey ? '🔑 New SSH Key Generated' : '✅ VM Successfully Created!'}</h1>
            </div>
            
            <div class="content">
              <h2>Hello,</h2>
              <p>${isNewKey 
                ? 'Your new SSH key has been generated and applied to your VM successfully.' 
                : 'Your Oracle Cloud VM has been provisioned and is ready to use!'
              }</p>
              
              ${isNewKey ? `
                <div class="success">
                  <h3>✅ Key Management Info</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li><strong>New key has been added</strong> to your VM</li>
                    <li><strong>Old keys remain active</strong> - you can still use them</li>
                    <li>Maximum 3 keys are kept (oldest removed automatically)</li>
                    <li>This provides zero-downtime key rotation</li>
                  </ul>
                </div>
              ` : ''}
              
              <div class="info-box">
                <h3>📋 VM Information</h3>
                <p><strong>VM Name:</strong> ${vmInfo.displayName}</p>
                <p><strong>Public IP:</strong> ${vmInfo.publicIp || 'Pending...'}</p>
                <p><strong>Instance ID:</strong> ${vmInfo.instanceOcid}</p>
                <p><strong>Subscription ID:</strong> ${subscription.id}</p>
              </div>

              <div class="warning">
                <h3>⚠️ Thông tin bảo mật quan trọng</h3>
                <p><strong>🔐 Vì lý do bảo mật, SSH private key không được gửi qua email.</strong></p>
                <p style="margin-top: 10px;">SSH private key đã được hiển thị <strong>1 lần duy nhất</strong> trên nền tảng ngay khi máy ảo được tạo thành công.</p>
                ${isNewKey ? '<p style="margin-top: 10px;">Nếu bạn cần SSH key mới, vui lòng sử dụng chức năng "Tạo SSH Key mới" trên trang quản lý VM.</p>' : ''}
              </div>

              <h3>🔑 SSH Private Key:</h3>
              <div class="info-box">
                <p>Vì lý do bảo mật, khóa SSH không được hiển thị tại đây. Vui lòng kiểm tra lại nền tảng để xem khóa đã được hiển thị khi tạo máy ảo.</p>
              </div>

              <h3>📝 How to Connect:</h3>
              
              <h4>Step 1: Save Private Key</h4>
              <p>Save the private key above to a file:</p>
              
              <p><strong>Windows (PowerShell):</strong></p>
              <div class="code-block">
# Save key to file
Set-Content -Path "$HOME\\.ssh\\oracle-vm-key${isNewKey ? '-new' : ''}.pem" -Value @"
[PASTE PRIVATE KEY HERE]
"@
              </div>
              
              <p><strong>Linux/Mac:</strong></p>
              <div class="code-block">
# Save key to file
cat > ~/.ssh/oracle-vm-key${isNewKey ? '-new' : ''}.pem << 'EOF'
[PASTE PRIVATE KEY HERE]
EOF

# Set correct permissions
chmod 600 ~/.ssh/oracle-vm-key${isNewKey ? '-new' : ''}.pem
              </div>

              <h4>Step 2: Connect via SSH</h4>
              <p>Use the appropriate username based on your VM's operating system:</p>
              
              <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
                <tr style="background-color: #f0f0f0;">
                  <th style="border: 1px solid #ddd; padding: 8px;">Operating System</th>
                  <th style="border: 1px solid #ddd; padding: 8px;">Username</th>
                  <th style="border: 1px solid #ddd; padding: 8px;">SSH Command</th>
                </tr>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">Oracle Linux</td>
                  <td style="border: 1px solid #ddd; padding: 8px;"><code>opc</code></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><code>ssh -i ~/.ssh/oracle-vm-key${isNewKey ? '-new' : ''}.pem opc@${vmInfo.publicIp || 'YOUR_VM_IP'}</code></td>
                </tr>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">Ubuntu</td>
                  <td style="border: 1px solid #ddd; padding: 8px;"><code>root</code></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><code>ssh -i ~/.ssh/oracle-vm-key${isNewKey ? '-new' : ''}.pem root@${vmInfo.publicIp || 'YOUR_VM_IP'}</code></td>
                </tr>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">CentOS/Rocky</td>
                  <td style="border: 1px solid #ddd; padding: 8px;"><code>centos</code> or <code>rocky</code></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><code>ssh -i ~/.ssh/oracle-vm-key.pem centos@${vmInfo.publicIp || 'YOUR_VM_IP'}</code></td>
                </tr>
              </table>

              <h4>Step 3: First Login Commands</h4>
              <div class="code-block">
# Check system info
uname -a

# Update system (Oracle Linux/CentOS/Rocky)
sudo dnf update -y

# Update system (Ubuntu)
sudo apt update && sudo apt upgrade -y

# Switch to root (if needed)
sudo su -
              </div>

              <h3>🔐 SSH Key Fingerprint:</h3>
              <p><code>${sshKeyPair.fingerprint}</code></p>

              <div class="warning">
                <h3>🔒 Security Best Practices</h3>
                <ul>
                  <li>Never share your private key with anyone</li>
                  <li>Keep a backup of your private key in a secure location</li>
                  <li>Never commit the key to Git or any version control</li>
                  <li>Consider using SSH config file for easier connections</li>
                  <li>You can request a new SSH key anytime from the dashboard</li>
                </ul>
              </div>

              <div class="info-box">
                <h3>💡 Troubleshooting</h3>
                <p><strong>Connection timeout:</strong> Make sure the VM is in RUNNING state and port 22 is open (already configured automatically).</p>
                <p><strong>Permission denied:</strong> Check that your private key file has correct permissions (600 on Linux/Mac).</p>
                <p><strong>Wrong username:</strong> Try different usernames based on the table above.</p>
              </div>

              <a href="https://oraclecloud.vn/package-management/${subscription.id}" class="button">
                Manage Your VM
              </a>
            </div>

            <div class="footer">
              <p>© 2026 Oracle Cloud Management Platform</p>
              <p>If you have any questions, please contact support@oraclecloud.vn</p>
            </div>
          </div>
        </body>
      </html>

    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@oraclecloud.vn',
        to: email,
        subject: subject,
        html: htmlContent,
      });

      this.logger.log(`SSH key email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send SSH key email to ${email}:`, error);
      // Don't throw error, just log it
    }
  }

  /**
   * Send Windows password to user via email
   */
  private async sendWindowsPasswordEmail(
    email: string,
    vmInfo: any,
    windowsCredentials: { username: string; password: string },
    subscription: any,
  ) {
    this.logger.log('📧 ========== SENDING WINDOWS EMAIL ==========');
    this.logger.log(`📧 To: ${email}`);
    this.logger.log(`📧 VM: ${vmInfo.name}`);
    this.logger.log(`📧 IP: ${vmInfo.publicIp}`);
    this.logger.log(`📧 Username: ${windowsCredentials.username}`);
    
    const subject = `🪟 Windows VM Access Credentials - ${vmInfo.name || 'Your VM'}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #0078D4 0%, #0053A4 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .content {
              padding: 40px;
            }
            h1 {
              margin: 0;
              font-size: 28px;
            }
            h2 {
              color: #0078D4;
              margin-top: 30px;
            }
            h3 {
              color: #333;
              margin-top: 20px;
            }
            .vm-details {
              background-color: #f8f9fa;
              border-left: 4px solid #0078D4;
              padding: 20px;
              margin: 20px 0;
            }
            .vm-details p {
              margin: 10px 0;
            }
            .code-block {
              background-color: #2d2d2d;
              color: #ffffff;
              padding: 15px;
              border-radius: 5px;
              font-family: 'Consolas', 'Monaco', monospace;
              font-size: 14px;
              overflow-x: auto;
              margin: 10px 0;
              white-space: pre-wrap;
            }
            .warning {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
            }
            .info-box {
              background-color: #e7f3ff;
              border-left: 4px solid #0078D4;
              padding: 15px;
              margin: 20px 0;
            }
            .credentials-box {
              background-color: #fff5f5;
              border: 2px solid #dc3545;
              padding: 20px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .button {
              display: inline-block;
              background-color: #0078D4;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 15px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
            }
            code {
              background-color: #f5f5f5;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: 'Consolas', 'Monaco', monospace;
              font-size: 13px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🪟 Windows VM Access Credentials</h1>
              <p>Your Windows Server is ready to use!</p>
            </div>

            <div class="content">
              <h2>VM Information</h2>
              <div class="vm-details">
                <p><strong>VM Name:</strong> ${vmInfo.name || 'N/A'}</p>
                <p><strong>Public IP:</strong> <code>${vmInfo.publicIp || 'Retrieving...'}</code></p>
                <p><strong>Operating System:</strong> ${vmInfo.operatingSystem || 'Windows Server'}</p>
                <p><strong>Status:</strong> ${vmInfo.status || 'PROVISIONING'}</p>
              </div>

              <div class="credentials-box">
                <h3>⚠️ Thông tin bảo mật quan trọng</h3>
                <p><strong>🔐 Vì lý do bảo mật, mật khẩu sẽ không hiển thị tại đây.</strong></p>
                <p style="margin-top: 10px;">Mật khẩu máy chủ đã được hiển thị <strong>1 lần duy nhất</strong> trên nền tảng khi tạo máy ảo. Vui lòng kiểm tra trang quản lý VM để xem mật khẩu.</p>
              </div>

              <h3>🔑 Windows Credentials:</h3>
              <p><strong>Username:</strong> <code>${windowsCredentials.username}</code></p>
              <div class="info-box">
                <p>Mật khẩu không được gửi qua email vì lý do bảo mật. Vui lòng đăng nhập vào nền tảng để xem mật khẩu trong trang quản lý VM.</p>
              </div>

              <h3>📝 How to Connect:</h3>
              
              <h4>Option 1: Windows Remote Desktop (Recommended)</h4>
              <p><strong>On Windows:</strong></p>
              <ol>
                <li>Press <code>Win + R</code> and type <code>mstsc</code></li>
                <li>Enter your VM's IP address: <code>${vmInfo.publicIp || 'YOUR_VM_IP'}</code></li>
                <li>Click "Connect"</li>
                <li>When prompted, enter your username: <code>${windowsCredentials.username}</code> and your password (available in the VM management dashboard)</li>
              </ol>

              <h4>Option 2: Using RDP File</h4>
              <p>Create a file named <code>oracle-vm.rdp</code> with this content:</p>
              <div class="code-block">full address:s:${vmInfo.publicIp || 'YOUR_VM_IP'}
username:s:${windowsCredentials.username}
prompt for credentials:i:1
administrative session:i:1</div>
              <p>Double-click the file and enter your password when prompted.</p>

              <h4>Option 3: From Mac</h4>
              <ol>
                <li>Download "Microsoft Remote Desktop" from Mac App Store</li>
                <li>Click "+ Add PC"</li>
                <li>Enter PC Name: <code>${vmInfo.publicIp || 'YOUR_VM_IP'}</code></li>
                <li>Enter credentials when connecting</li>
              </ol>

              <h4>Option 4: From Linux</h4>
              <p>Install Remmina or use rdesktop:</p>
              <div class="code-block"># Using rdesktop
rdesktop -u ${windowsCredentials.username} ${vmInfo.publicIp || 'YOUR_VM_IP'}

# Using xfreerdp
xfreerdp /v:${vmInfo.publicIp || 'YOUR_VM_IP'} /u:${windowsCredentials.username}</div>

              <h3>🔐 First Login Recommendations:</h3>
              <div class="info-box">
                <h4>After your first login, we recommend:</h4>
                <ol>
                  <li><strong>Change your password immediately:</strong>
                    <div class="code-block"># In PowerShell as Administrator
net user ${windowsCredentials.username} *</div>
                  </li>
                  <li><strong>Update Windows:</strong> Run Windows Update to get latest security patches</li>
                  <li><strong>Configure Windows Firewall:</strong> Set up appropriate firewall rules</li>
                  <li><strong>Enable automatic updates:</strong> Keep your system secure</li>
                </ol>
              </div>

              <div class="warning">
                <h3>🔒 Security Best Practices</h3>
                <ul>
                  <li>Change the default password immediately after first login</li>
                  <li>Never share your credentials with anyone</li>
                  <li>Use strong passwords with a mix of letters, numbers, and symbols</li>
                  <li>Enable Windows Defender and keep it updated</li>
                  <li>Regularly backup your data</li>
                  <li>Keep Windows updated with latest security patches</li>
                  <li>Consider enabling Network Level Authentication (NLA)</li>
                </ul>
              </div>

              <div class="info-box">
                <h3>💡 Troubleshooting</h3>
                <p><strong>Cannot connect:</strong> Make sure the VM is in RUNNING state and port 3389 is open.</p>
                <p><strong>Connection timeout:</strong> Check your firewall settings and ensure the VM's public IP is correct.</p>
                <p><strong>Credentials not working:</strong> Make sure you're using the exact username and password (case-sensitive).</p>
                <p><strong>Need new password:</strong> Contact support if you've lost access to your VM.</p>
              </div>

              <h3>📊 VM Management</h3>
              <p>You can manage your VM (start, stop, restart) from your dashboard:</p>
              <a href="https://oraclecloud.vn/package-management/${subscription.id}" class="button">
                Manage Your VM
              </a>
            </div>

            <div class="footer">
              <p>© 2026 Oracle Cloud Management Platform</p>
              <p>If you have any questions, please contact support@oraclecloud.vn</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@oraclecloud.vn',
        to: email,
        subject: subject,
        html: htmlContent,
      });

      this.logger.log(`✅ Windows credentials email sent successfully to ${email}`);
      this.logger.log('📧 ==========================================');
    } catch (error) {
      this.logger.error('❌ ========== EMAIL SEND FAILED ==========');
      this.logger.error(`❌ Failed to send Windows credentials email to ${email}`);
      this.logger.error(`❌ Error: ${error.message}`);
      this.logger.error(`❌ Stack: ${error.stack}`);
      this.logger.error('❌ ========================================');
      // Don't throw error, just log it
    }
  }

  /**
   * Determine SSH username based on operating system
   */
  private getOsSshUsername(operatingSystem: string): string {
    const osLower = (operatingSystem || '').toLowerCase();
    
    if (osLower.includes('ubuntu')) {
      return 'ubuntu';
    } else if (osLower.includes('centos')) {
      return 'centos';
    } else if (osLower.includes('rocky')) {
      return 'rocky';
    } else if (osLower.includes('oracle')) {
      return 'opc';
    } else {
      // Default to 'opc' for Oracle Cloud
      return 'opc';
    }
  }

  /**
   * Perform action on subscription's VM (Start, Stop, Restart)
   */
  async performVmAction(
    subscriptionId: string,
    userId: number,
    action: VmActionType,
    userRole?: string,
  ) {
    const isAdmin = userRole === 'admin';
    console.log('\n========== PERFORM VM ACTION SERVICE ==========');
    console.log(`🎯 Action: ${action}`);
    console.log(`📋 Subscription ID: ${subscriptionId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`👤 User Role: ${userRole} | isAdmin: ${isAdmin}`);
    this.logger.log(`Performing ${action} on VM for subscription ${subscriptionId} (role: ${userRole})`);

    // Step 1: Find subscription
    // Admin can access any subscription regardless of owner
    console.log('🔍 Step 1: Looking up subscription...');
    let subscription: Subscription | null;
    if (isAdmin) {
      console.log('🔐 Admin mode: searching without user_id filter');
      subscription = await this.subscriptionRepo.findOne({
        where: { id: subscriptionId },
        relations: ['cloudPackage'],
      });
    } else {
      subscription = await this.subscriptionRepo.findOne({
        where: { id: subscriptionId, user_id: userId },
        relations: ['cloudPackage'],
      });
    }

    if (!subscription) {
      console.log('❌ Step 1 FAILED: Subscription not found');
      throw new NotFoundException('Subscription not found');
    }
    console.log('✅ Step 1 PASSED: Subscription found, owner user_id:', subscription.user_id);
    console.log('📊 Subscription Status:', subscription.status);

    // Check subscription status (applies to admin too)
    if (subscription.status === 'pending') {
      throw new BadRequestException('Subscription payment is pending');
    }
    if (subscription.status === 'cancelled') {
      throw new BadRequestException('Subscription is cancelled');
    }
    if (subscription.status === 'expired') {
      throw new BadRequestException('Subscription has expired');
    }

    console.log('🔍 Step 2: Checking VM instance configuration...');
    if (!subscription.vm_instance_id) {
      console.log('❌ Step 2 FAILED: VM not configured');
      throw new BadRequestException('VM not configured for this subscription');
    }
    console.log('✅ Step 2 PASSED: VM configured, ID:', subscription.vm_instance_id);

    // Find VM by database ID
    console.log('🔍 Step 3: Loading VM instance from database...');
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: subscription.vm_instance_id },
    });

    if (!vm) {
      console.log('❌ Step 3 FAILED: VM instance not found in database');
      console.log('   VM ID searched:', subscription.vm_instance_id);
      throw new NotFoundException('VM not found');
    }
    console.log('✅ Step 3 PASSED: VM found');
    console.log('   VM ID:', vm.id);
    console.log('   VM user_id (owner):', vm.user_id);
    console.log('   VM Compartment ID:', vm.compartment_id);

    // Use the subscription owner's user_id when calling vmProvisioningService
    // This is crucial for admin: admin (user 8) controlling user 82's VM
    const ownerUserId = subscription.user_id;
    console.log(`🔍 Step 4: Executing VM action on OCI (using owner user_id: ${ownerUserId})...`);
    const result = await this.vmProvisioningService.performVmAction(
      ownerUserId,
      vm.id,
      action,
    );
    console.log('✅ Step 4 PASSED: Action executed successfully');
    console.log('✅ ALL STEPS PASSED');
    console.log('==============================================\n');

    this.logger.log(`Action ${action} completed successfully on VM ${vm.id} (owner: ${ownerUserId}, actor: ${userId})`);

    return {
      success: true,
      action: action,
      vm: result,
      message: `VM ${action.toLowerCase()} operation completed successfully`,
    };
  }

  /**
   * Get admin public SSH key for manual installation or debugging
   */
  async getAdminPublicKey() {
    const adminKey = await this.systemSshKeyService.getActiveKey();
    
    if (!adminKey) {
      throw new InternalServerErrorException('Admin SSH key not configured');
    }

    this.logger.log(`📋 Retrieved admin public key for display`);
    
    return {
      publicKey: adminKey.public_key,
      fingerprint: adminKey.fingerprint,
      createdAt: adminKey.created_at,
      message: 'This is the system admin public key. Add this to your VM\'s ~/.ssh/authorized_keys if needed.',
    };
  }

  /**
   * Delete VM only (keep subscription active)
   * This allows user to reconfigure a new VM for the same subscription
   */
  async deleteVmOnly(subscriptionId: string, userId: number, userRole?: string) {
    const isAdmin = userRole === 'admin';
    this.logger.log(`Deleting VM only for subscription ${subscriptionId} (role: ${userRole})`);

    // Step 1: Load subscription
    const subscription = await this.subscriptionRepo.findOne({
      where: isAdmin
        ? { id: subscriptionId }
        : { id: subscriptionId, user_id: userId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.vm_instance_id) {
      throw new BadRequestException('This subscription has no VM to delete');
    }

    // Step 2: Load VM instance
    const vmInstance = await this.vmInstanceRepo.findOne({
      where: { id: subscription.vm_instance_id },
    });

    if (!vmInstance) {
      this.logger.warn(`VM instance ${subscription.vm_instance_id} not found in database`);
      // Continue to clean up subscription reference
    } else {
      // Step 3: Terminate VM on OCI
      if (vmInstance.instance_id && vmInstance.instance_id !== 'PENDING') {
        try {
          this.logger.log(`Terminating VM on OCI: ${vmInstance.instance_id}`);
          await this.ociService.terminateInstance(vmInstance.instance_id, false);
          this.logger.log(`✅ VM terminated on OCI successfully`);
        } catch (ociError) {
          this.logger.warn(`Failed to terminate VM on OCI: ${ociError.message}`);
          // Continue with database cleanup even if OCI termination fails
        }
      }

      // Step 4a: Delete bandwidth_logs first (FK NOT NULL constraint prevents SET NULL cascade)
      try {
        await this.vmInstanceRepo.manager.query(
          'DELETE FROM oracle.bandwidth_logs WHERE vm_instance_id = $1',
          [vmInstance.id],
        );
        this.logger.log(`✅ Deleted bandwidth_logs for VM instance ${vmInstance.id}`);
      } catch (bwError) {
        this.logger.warn(`Failed to delete bandwidth_logs: ${bwError.message}`);
      }

      // Step 4b: Delete VM from database
      await this.vmInstanceRepo.remove(vmInstance);
      this.logger.log(`✅ VM instance deleted from database`);
    }

    // Step 5: Update subscription - reset VM reference and status
    subscription.vm_instance_id = null;
    subscription.configuration_status = 'pending_setup';
    subscription.last_configured_at = null;
    subscription.provisioning_error = null;
    await this.subscriptionRepo.save(subscription);
    this.logger.log(`✅ Subscription updated - VM reference cleared`);

    return {
      success: true,
      message: 'VM deleted successfully. Subscription is still active and can be reconfigured with a new VM.',
    };
  }

  /**
   * [Cronjob] Stop all VMs whose subscription has expired or been cancelled.
   * Called periodically by SchedulerService.
   */
  async stopExpiredSubscriptionVms(): Promise<void> {
    this.logger.log('[VmSubscription] Checking for VMs to stop due to expired/cancelled subscriptions...');

    // 1. Find all expired or cancelled subscriptions
    const inactiveSubscriptions = await this.subscriptionRepo.find({
      where: { status: In(['expired', 'cancelled']) },
      select: ['id'],
    });

    if (inactiveSubscriptions.length === 0) {
      this.logger.debug('[VmSubscription] No expired/cancelled subscriptions found.');
      return;
    }

    const subscriptionIds = inactiveSubscriptions.map((s) => s.id);

    // 2. Find associated running VMs (not already STOPPED/TERMINATED)
    const runningVms = await this.vmInstanceRepo.find({
      where: {
        subscription_id: In(subscriptionIds),
        lifecycle_state: In(['RUNNING', 'STARTING']),
      },
    });

    if (runningVms.length === 0) {
      this.logger.debug('[VmSubscription] No running VMs found for expired/cancelled subscriptions.');
      return;
    }

    this.logger.log(`[VmSubscription] Found ${runningVms.length} VM(s) to stop.`);

    // 3. Stop each VM
    for (const vm of runningVms) {
      try {
        this.logger.log(`[VmSubscription] Stopping VM ${vm.instance_id} (subscription: ${vm.subscription_id})`);
        await this.ociService.stopInstance(vm.instance_id);

        // Update lifecycle state in DB
        vm.lifecycle_state = 'STOPPING';
        await this.vmInstanceRepo.save(vm);

        this.logger.log(`[VmSubscription] ✅ VM ${vm.instance_id} stop command sent successfully.`);
      } catch (error) {
        this.logger.error(
          `[VmSubscription] ❌ Failed to stop VM ${vm.instance_id} (subscription: ${vm.subscription_id}):`,
          error,
        );
        // Continue with other VMs even if one fails
      }
    }

    this.logger.log(`[VmSubscription] Completed VM stop sweep. Processed ${runningVms.length} VM(s).`);
  }
}

