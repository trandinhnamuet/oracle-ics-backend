import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VmProvisioningService } from '../vm-provisioning/vm-provisioning.service';
import { SystemSshKeyService } from '../system-ssh-key/system-ssh-key.service';
import { Subscription } from '../../entities/subscription.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { ConfigureVmDto } from './dto';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

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
  ) {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
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
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId, user_id: userId },
      relations: ['cloudPackage'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check if subscription is paid
    if (subscription.status === 'pending') {
      throw new BadRequestException('Subscription payment is pending');
    }

    if (subscription.status === 'cancelled') {
      throw new BadRequestException('Subscription is cancelled');
    }

    if (subscription.status === 'expired') {
      throw new BadRequestException('Subscription has expired');
    }

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

    // Step 2: Check if VM already exists for this subscription
    let existingVm = await this.vmInstanceRepo.findOne({
      where: { user_id: userId },
      relations: [],
    });

    // For now, find the first VM or we need to add subscription_id to vm_instances table
    const allVms = await this.vmProvisioningService.getUserVms(userId);
    existingVm = allVms.length > 0 ? await this.vmInstanceRepo.findOne({ where: { id: allVms[0].id } }) : null;

    try {
      let vmResult;
      let userSshKeyPair;

      if (existingVm) {
        // Reconfigure existing VM
        this.logger.log(`Reconfiguring existing VM: ${existingVm.id}`);
        
        // TODO: Implement VM reconfiguration logic
        // For now, we'll create a new VM
        // In production, you might want to:
        // 1. Stop the old VM
        // 2. Create a new VM with new config
        // 3. Optionally preserve data
        
        throw new BadRequestException('VM reconfiguration not yet implemented. Please delete the old VM first.');
      } else {
        // Create new VM
        this.logger.log('Creating new VM for subscription');

        // Generate SSH key pair for user
        userSshKeyPair = this.generateSshKeyPair();

        // Provision VM
        vmResult = await this.vmProvisioningService.provisionVm(userId, {
          displayName: configureVmDto.displayName,
          imageId: configureVmDto.imageId,
          shape: configureVmDto.shape,
          ocpus: configureVmDto.ocpus,
          memoryInGBs: configureVmDto.memoryInGBs,
          bootVolumeSizeInGBs: configureVmDto.bootVolumeSizeInGBs,
          userSshPublicKey: userSshKeyPair.publicKey,
          description: configureVmDto.description || `VM for subscription ${subscriptionId}`,
          subscriptionId: subscriptionId,
        });
      }

      // Step 3: Update subscription with VM info
      subscription.vm_instance_id = vmResult.id; // Use database UUID, not OCI instance ID
      subscription.status = 'active';
      await this.subscriptionRepo.save(subscription);

      // Step 4: Send SSH key to user via email
      const userEmail = configureVmDto.notificationEmail || subscription['user']?.email;
      if (userEmail && userSshKeyPair) {
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
      }

      this.logger.log(`VM configuration completed for subscription ${subscriptionId}`);

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
          // Don't send private key in response, only via email
          fingerprint: userSshKeyPair.fingerprint,
        } : undefined,
      };
    } catch (error) {
      this.logger.error(`Error configuring VM for subscription ${subscriptionId}:`, error);
      throw new InternalServerErrorException(
        `Failed to configure VM: ${error.message}`,
      );
    }
  }

  /**
   * Get VM details for a subscription
   */
  async getSubscriptionVm(subscriptionId: string, userId: number) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId, user_id: userId },
      relations: ['cloudPackage', 'user'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // If no VM OCID, subscription is not configured yet
    if (!subscription.vm_instance_id) {
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

    // Find VM by OCID
    const vm = await this.vmInstanceRepo.findOne({
      where: { instance_id: subscription.vm_instance_id },
    });

    if (!vm) {
      this.logger.warn(`VM not found for subscription ${subscriptionId}, OCID: ${subscription.vm_instance_id}`);
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

    // Get fresh data from OCI
    const vmDetail = await this.vmProvisioningService.getVmById(userId, vm.id);

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
    this.logger.log(`Requesting new SSH key for subscription ${subscriptionId}`);

    const subscription = await this.checkSubscriptionEligibility(subscriptionId, userId);

    if (!subscription.vm_instance_id) {
      throw new BadRequestException('VM not configured for this subscription');
    }

    // Find VM
    const vm = await this.vmInstanceRepo.findOne({
      where: { instance_id: subscription.vm_instance_id },
    });

    if (!vm) {
      throw new NotFoundException('VM not found');
    }

    // Generate new SSH key pair
    const newKeyPair = this.generateSshKeyPair();

    // Update VM with new user SSH key
    vm.ssh_public_key = newKeyPair.publicKey;
    await this.vmInstanceRepo.save(vm);

    // TODO: Update SSH key in OCI instance
    // This would require stopping the instance, updating metadata, and restarting
    // For now, we'll just log it
    this.logger.warn('SSH key updated in database, but not yet applied to OCI instance');

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
      message: 'New SSH key generated and sent to your email',
      sshKey: {
        publicKey: newKeyPair.publicKey,
        fingerprint: newKeyPair.fingerprint,
      },
    };
  }

  /**
   * Generate SSH key pair for user
   */
  private generateSshKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // Convert to OpenSSH format for public key
    const publicKeySSH = this.convertPemToOpenSSH(publicKey);
    
    // Calculate fingerprint
    const keyData = Buffer.from(publicKeySSH.split(' ')[1], 'base64');
    const hash = crypto.createHash('md5').update(keyData).digest('hex');
    const fingerprint = hash.match(/.{2}/g)?.join(':') || '';

    return {
      publicKey: publicKeySSH,
      privateKey: privateKey,
      fingerprint: fingerprint,
    };
  }

  /**
   * Convert PEM public key to OpenSSH format
   */
  private convertPemToOpenSSH(pemPublicKey: string): string {
    // Remove PEM headers and convert to OpenSSH format
    const base64 = pemPublicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    
    return `ssh-rsa ${base64} user@oraclecloud`;
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
            .code-block { background-color: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 13px; }
            .button { display: inline-block; background-color: #f80000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isNewKey ? 'New SSH Key Generated' : 'VM Successfully Created!'}</h1>
            </div>
            
            <div class="content">
              <h2>Hello,</h2>
              <p>${isNewKey 
                ? 'Your new SSH key has been generated successfully.' 
                : 'Your Oracle Cloud VM has been provisioned and is ready to use!'
              }</p>
              
              <div class="info-box">
                <h3>📋 VM Information</h3>
                <p><strong>VM Name:</strong> ${vmInfo.displayName}</p>
                <p><strong>Public IP:</strong> ${vmInfo.publicIp || 'Pending...'}</p>
                <p><strong>Instance ID:</strong> ${vmInfo.instanceOcid}</p>
                <p><strong>Subscription ID:</strong> ${subscription.id}</p>
              </div>

              <div class="warning">
                <h3>⚠️ Important Security Information</h3>
                <p><strong>Keep your private key secure!</strong> Never share it with anyone. This is the only time you'll receive it.</p>
              </div>

              <h3>🔑 Your SSH Private Key:</h3>
              <div class="code-block">${sshKeyPair.privateKey}</div>

              <h3>📝 How to Connect:</h3>
              
              <h4>Step 1: Save Private Key</h4>
              <p>Save the private key above to a file:</p>
              
              <p><strong>Windows (PowerShell):</strong></p>
              <div class="code-block">
# Save key to file
Set-Content -Path "$HOME\.ssh\oracle-vm-key.pem" -Value @"
[PASTE PRIVATE KEY HERE]
"@
              </div>
              
              <p><strong>Linux/Mac:</strong></p>
              <div class="code-block">
# Save key to file
cat > ~/.ssh/oracle-vm-key.pem << 'EOF'
[PASTE PRIVATE KEY HERE]
EOF

# Set correct permissions
chmod 600 ~/.ssh/oracle-vm-key.pem
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
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><code>ssh -i ~/.ssh/oracle-vm-key.pem opc@${vmInfo.publicIp || 'YOUR_VM_IP'}</code></td>
                </tr>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px;">Ubuntu</td>
                  <td style="border: 1px solid #ddd; padding: 8px;"><code>ubuntu</code></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><code>ssh -i ~/.ssh/oracle-vm-key.pem ubuntu@${vmInfo.publicIp || 'YOUR_VM_IP'}</code></td>
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
}
