import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OciService } from '../oci/oci.service';
import { SystemSshKeyService } from '../system-ssh-key/system-ssh-key.service';
import { encryptPrivateKey } from '../../utils/system-ssh-key.util';
import { User } from '../../entities/user.entity';
import { UserCompartment } from '../../entities/user-compartment.entity';
import { VcnResource } from '../../entities/vcn-resource.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { VmActionsLog } from '../../entities/vm-actions-log.entity';
import { CompartmentAccount } from '../../entities/compartment-account.entity';
import { Subscription } from '../../entities/subscription.entity';
import { CreateVmDto, VmActionType } from './dto';
import * as nodemailer from 'nodemailer';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

@Injectable()
export class VmProvisioningService {
  private readonly logger = new Logger(VmProvisioningService.name);
  private transporter: nodemailer.Transporter;

  // Fallback shapes ordered by preference (for capacity issues)
  private readonly fallbackShapes = [
    'VM.Standard.E2.1.Micro',    // x86 Always Free micro
    'VM.Standard.E3.Flex',        // AMD EPYC 3rd Gen flexible
    'VM.Standard3.Flex',          // AMD EPYC 4th Gen flexible
    'VM.Standard2.1',             // Intel Xeon standard
  ];

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserCompartment)
    private readonly userCompartmentRepo: Repository<UserCompartment>,
    @InjectRepository(VcnResource)
    private readonly vcnResourceRepo: Repository<VcnResource>,
    @InjectRepository(VmInstance)
    private readonly vmInstanceRepo: Repository<VmInstance>,
    @InjectRepository(VmActionsLog)
    private readonly vmActionsLogRepo: Repository<VmActionsLog>,
    @InjectRepository(CompartmentAccount)
    private readonly compartmentAccountRepo: Repository<CompartmentAccount>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly ociService: OciService,
    private readonly systemSshKeyService: SystemSshKeyService,
    private readonly notificationService: NotificationService,
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
   * Provision a new VM for a user
   * This includes: creating/retrieving compartment, VCN, subnet, and launching the instance
   */
  async provisionVm(userId: number, createVmDto: CreateVmDto): Promise<any> {
    this.logger.log(`Starting VM provisioning for user ${userId}`);

    try {
      // Step 1: Ensure user has a compartment
      let userCompartment = await this.ensureUserCompartment(userId);

      // Step 2: Ensure VCN and subnet exist
      let vcnResource = await this.ensureVcnAndSubnet(userCompartment);

      // Step 3: Get active system SSH key (admin key)
      const adminSshKey = await this.systemSshKeyService.getActiveKey();
      if (!adminSshKey) {
        throw new InternalServerErrorException('No active system SSH key found');
      }

      // Step 4: Prepare SSH keys array (user key + admin key)
      const sshPublicKeys = [
        createVmDto.userSshPublicKey.trim(),
        adminSshKey.public_key.trim(),
      ];
      
      this.logger.log(`✅ Prepared SSH keys: ${sshPublicKeys.length} keys total`);
      this.logger.log(`  - User key preview: ${sshPublicKeys[0].substring(0, 50)}...`);
      this.logger.log(`  - Admin key preview: ${sshPublicKeys[1].substring(0, 50)}...`);
      this.logger.log(`📝 Full Admin Public Key:`);
      this.logger.log(adminSshKey.public_key);
      this.logger.log(`📝 Admin Key Length: ${adminSshKey.public_key.length} characters`);

      // Step 5: Get availability domain for launching instance
      const availabilityDomains = await this.ociService.listAvailabilityDomains(
        userCompartment.compartment_ocid,
      );
      if (availabilityDomains.length === 0) {
        throw new InternalServerErrorException('No availability domains found');
      }
      const availabilityDomain = availabilityDomains[0].name;
      if (!availabilityDomain) {
        throw new InternalServerErrorException('Availability domain name is undefined');
      }

      // Step 5.5: Get user email for instance naming
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      
      // Format email for instance name (e.g., trandinhnamuet@gmail.com -> trandinhnamuet-gmail-com)
      const emailPrefix = user.email
        .toLowerCase()
        .replace('@', '-')
        .replace(/\./g, '-');

      // Step 5.6: Create a temporary VM record in database to get auto-increment ID
      // We'll update it with OCI details after successful launch
      const tempVmInstance = this.vmInstanceRepo.create({
        user_id: userId,
        compartment_id: userCompartment.compartment_ocid,
        instance_id: 'PENDING', // Will be updated after OCI launch
        instance_name: 'PENDING', // Will be updated after OCI launch
        shape: createVmDto.shape,
        image_id: createVmDto.imageId,
        image_name: createVmDto.imageId,
        lifecycle_state: 'PROVISIONING',
        ssh_public_key: createVmDto.userSshPublicKey,
        vcn_id: vcnResource.vcn_ocid,
        subnet_id: vcnResource.subnet_ocid,
        availability_domain: availabilityDomain,
        subscription_id: createVmDto.subscriptionId,
        vm_started_at: null as any,
      }) as VmInstance;

      const savedTempVm = await this.vmInstanceRepo.save(tempVmInstance) as VmInstance;
      const vmId = savedTempVm.id;
      
      // Create instance name using auto-increment ID: email-vm-ID
      const instanceName = `${emailPrefix}-vm-${vmId}`;
      this.logger.log(`Generated instance name: ${instanceName}`);

      // Step 6: Launch the instance with fallback shapes on capacity errors
      let ociInstance;
      let usedShape = createVmDto.shape;
      let launchError: any = null;

      // Build list of shapes to try: requested shape first, then fallbacks
      const shapesToTry = [
        createVmDto.shape,
        ...this.fallbackShapes.filter(s => s !== createVmDto.shape)
      ];

      this.logger.log(`Launching instance in OCI with shape priority: ${shapesToTry.join(' -> ')}`);

      // Track if we encountered any shape incompatibility errors
      let hasIncompatibilityError = false;
      let consecutiveIncompatibilityErrors = 0;

      for (const shapeAttempt of shapesToTry) {
        // Early exit: if we've had 3+ consecutive incompatibility errors, all remaining shapes are likely incompatible
        if (consecutiveIncompatibilityErrors >= 3 && hasIncompatibilityError) {
          this.logger.error(`Multiple consecutive shape incompatibility errors detected. All fallback shapes are incompatible with the selected image.`);
          throw new InternalServerErrorException(
            `Out of host capacity for shape ${createVmDto.shape}. ` +
            `All alternative shapes are incompatible with the selected image (architecture mismatch). ` +
            `Please try again later or select a different image/shape combination. ` +
            `Note: ARM images (for A1.Flex) and x86 images (for other shapes) are not interchangeable.`
          );
        }
        try {
          // Adjust memory for shapes that don't support the requested memory
          let ocpus = createVmDto.ocpus;
          let memoryInGBs = createVmDto.memoryInGBs;

          // E2.1.Micro and Standard2.1 have fixed resources
          if (shapeAttempt === 'VM.Standard.E2.1.Micro') {
            ocpus = 1;
            memoryInGBs = 1;
          } else if (shapeAttempt === 'VM.Standard2.1') {
            ocpus = 1;
            memoryInGBs = 15;
          } else if (!shapeAttempt.includes('Flex')) {
            // For non-flex shapes, use reasonable defaults
            ocpus = ocpus || 1;
            memoryInGBs = memoryInGBs || 4;
          }

          this.logger.log(`Attempting to launch with shape: ${shapeAttempt} (${ocpus} OCPU, ${memoryInGBs}GB)`);

          ociInstance = await this.ociService.launchInstance(
            userCompartment.compartment_ocid,
            instanceName,
            availabilityDomain,
            vcnResource.subnet_ocid,
            createVmDto.imageId,
            shapeAttempt,
            sshPublicKeys,
            ocpus,
            memoryInGBs,
            createVmDto.bootVolumeSizeInGBs,
          );

          usedShape = shapeAttempt;
          this.logger.log(`Successfully launched with shape: ${shapeAttempt}`);
          consecutiveIncompatibilityErrors = 0; // Reset counter on success
          break; // Success, exit the loop

        } catch (error) {
          launchError = error;
          const errorMessage = error.message || '';

          // Check if this is a shape incompatibility error (architecture mismatch)
          if (errorMessage.includes('is not valid for image')) {
            hasIncompatibilityError = true;
            consecutiveIncompatibilityErrors++;
            
            // If this is the first attempt (original requested shape), it's a user error
            if (shapeAttempt === createVmDto.shape) {
              this.logger.error(`Shape ${shapeAttempt} is incompatible with selected image. Please choose a different shape or image.`);
              throw new BadRequestException(
                `The selected image is not compatible with shape ${shapeAttempt}. ` +
                `Please ensure you select an image that matches your chosen shape's architecture ` +
                `(ARM images for A1.Flex, x86/AMD64 images for other shapes).`
              );
            } else {
              // This is a fallback shape that's incompatible - skip it
              this.logger.warn(`Fallback shape ${shapeAttempt} is incompatible with image, skipping...`);
              continue;
            }
          }

          // Reset incompatibility counter if we got a different error
          if (!errorMessage.includes('is not valid for image')) {
            consecutiveIncompatibilityErrors = 0;
          }

          // Check if this is a capacity error that warrants trying fallback shapes
          if (errorMessage.includes('Out of host capacity')) {
            if (shapeAttempt !== shapesToTry[shapesToTry.length - 1]) {
              this.logger.warn(`Capacity exhausted for shape ${shapeAttempt}, trying fallback...`);
              continue; // Try next shape
            } else {
              // Last shape, all fallbacks failed
              // If we had incompatibility errors, it means fallbacks weren't suitable
              if (hasIncompatibilityError) {
                throw new InternalServerErrorException(
                  `Out of host capacity for shape ${createVmDto.shape}. ` +
                  `Alternative shapes are not compatible with the selected image (architecture mismatch). ` +
                  `Please try again later or select a different image that supports multiple architectures.`
                );
              }
              throw error;
            }
          }
          
          // For any other error on last attempt, throw it
          if (shapeAttempt === shapesToTry[shapesToTry.length - 1]) {
            throw error;
          }
        }
      }

      if (!ociInstance) {
        // Launch failed, clean up the temporary VM record
        await this.vmInstanceRepo.remove(savedTempVm);
        throw launchError || new InternalServerErrorException('Failed to launch instance with all available shapes');
      }

      // Step 7: Update VM instance in database with OCI details
      savedTempVm.instance_id = ociInstance.id;
      savedTempVm.instance_name = instanceName;
      savedTempVm.shape = usedShape;
      savedTempVm.lifecycle_state = ociInstance.lifecycleState;
      savedTempVm.vm_started_at = ociInstance.lifecycleState === 'RUNNING' ? new Date() : (null as any);
      
      // Step 7.5: Encrypt and save user's private key if provided (for Linux VMs)
      if (createVmDto.userSshPrivateKey) {
        try {
          savedTempVm.ssh_private_key_encrypted = encryptPrivateKey(createVmDto.userSshPrivateKey);
          this.logger.log('✅ User\'s SSH private key encrypted and saved');
        } catch (error) {
          this.logger.error('Failed to encrypt private key:', error);
        }
      }
      
      // Step 7.6: Save admin SSH key reference
      savedTempVm.system_ssh_key_id = adminSshKey.id;
      savedTempVm.has_admin_access = true;

      const savedVm = await this.vmInstanceRepo.save(savedTempVm) as VmInstance;

      // Step 8: Log the creation action
      await this.logVmAction(
        savedVm.id,
        userId,
        'CREATE',
        `VM instance created: ${instanceName} with shape ${usedShape}`,
        { ociInstanceId: ociInstance.id, shape: usedShape },
      );

      // Notify user: VM provisioned
      await this.notificationService.notify(
        userId,
        NotificationType.VM_PROVISIONED,
        '🖥️ VM đã được khởi tạo thành công',
        `Máy chủ ảo "${instanceName}" (${usedShape}) vừa được tạo thành công. IP công khai: ${ociInstance.id ? 'đang cấp phát...' : 'chưa có'}.`,
        { vm_id: savedVm.id, instance_name: instanceName, shape: usedShape },
        '🖥️ VM created successfully',
        `Virtual machine "${instanceName}" (${usedShape}) was created successfully. Public IP: ${ociInstance.id ? 'being assigned...' : 'not yet available'}.`,
      );

      // Step 9: Get fresh instance state from OCI
      this.logger.log('📊 Fetching fresh instance state from OCI...');
      try {
        const freshInstance = await this.ociService.getInstance(ociInstance.id);
        savedVm.lifecycle_state = freshInstance.lifecycleState;
        this.logger.log(`✅ Instance lifecycle state: ${freshInstance.lifecycleState}`);
        
        // Update vm_started_at if instance is running
        if (freshInstance.lifecycleState === 'RUNNING') {
          savedVm.vm_started_at = new Date();
          this.logger.log('✅ Instance is RUNNING, setting vm_started_at');
        }
        
        await this.vmInstanceRepo.save(savedVm);
      } catch (error) {
        this.logger.error('❌ Could not get fresh instance state from OCI:', error.message);
      }

      // Step 10: Wait a bit and get public IP
      this.logger.log('🌐 Waiting for instance to get public IP...');
      await this.sleep(5000); // Wait 5 seconds

      let publicIp: string | null = null;
      try {
        publicIp = await this.ociService.getInstancePublicIp(
          userCompartment.compartment_ocid,
          ociInstance.id,
        );
        
        if (publicIp) {
          savedVm.public_ip = publicIp;
          await this.vmInstanceRepo.save(savedVm);
          this.logger.log(`✅ Instance public IP: ${publicIp}`);
        } else {
          this.logger.warn('⚠️  Public IP not available yet');
        }
      } catch (error) {
        this.logger.warn('⚠️  Could not retrieve public IP yet:', error.message);
      }

      // Step 11: Check if this is a Windows VM and get initial credentials
      // This step is wrapped in try-catch to not affect the main flow
      this.logger.log('🔍 Checking OS type and credentials...');
      try {
        // Get image details to check OS type
        this.logger.log(`📦 Fetching image details for: ${createVmDto.imageId}`);
        const imageDetails = await this.ociService.getImage(createVmDto.imageId);
        this.logger.log(`📦 Image OS: ${imageDetails?.operatingSystem || 'Unknown'}`);
        
        const isWindows = imageDetails?.operatingSystem?.toLowerCase().includes('windows');

        // Persist image metadata for admin/package-management UI.
        savedVm.image_name = imageDetails?.displayName || savedVm.image_name;
        savedVm.operating_system = imageDetails?.operatingSystem || savedVm.operating_system;
        savedVm.operating_system_version = imageDetails?.operatingSystemVersion || savedVm.operating_system_version;
        await this.vmInstanceRepo.save(savedVm);
        this.logger.log(
          `✅ Image metadata saved: OS=${savedVm.operating_system || 'Unknown'}, Version=${savedVm.operating_system_version || 'Unknown'}, Image=${savedVm.image_name || 'Unknown'}`,
        );
        
        if (isWindows) {
          this.logger.log('🪟 ========== WINDOWS VM DETECTED ==========');
          this.logger.log(`🪟 Image: ${imageDetails.displayName}`);
          this.logger.log(`🪟 OS: ${imageDetails.operatingSystem}`);
          
          this.logger.log('✅ OS type saved to database');
          
          // Step 11.1: Ensure RDP port 3389 is open in Security List
          try {
            this.logger.log('🔐 Ensuring RDP port 3389 is open for Windows VM...');
            
            // Get VCN details to find security list
            const vcnDetails = await this.ociService.getVcn(vcnResource.vcn_ocid);
            if (vcnDetails.defaultSecurityListId) {
              await this.ociService.ensureRdpAccessEnabled(vcnDetails.defaultSecurityListId);
              this.logger.log('✅ RDP port 3389 is now accessible');
            } else {
              this.logger.warn('⚠️  Could not find default security list for VCN');
            }
          } catch (rdpError) {
            this.logger.error('❌ Failed to open RDP port:', rdpError.message);
            // Continue anyway, user can open it manually
          }
          
          // For Windows VM, schedule background job to get password
          // This avoids blocking the API response (preventing frontend timeout)
          this.logger.log('🔑 Windows VM detected - scheduling background password retrieval');
          this.logger.log('📧 User will receive Windows credentials via email when ready');
          this.logger.log('⏱️  Expected time: 5-10 minutes');
          
          // Schedule async background job with subscription ID for email sending
          const subscriptionId = savedVm.subscription_id;
          this.scheduleWindowsPasswordRetrieval(savedVm.id, ociInstance.id, subscriptionId).catch(error => {
            this.logger.error(`❌ Background password retrieval failed for VM ${savedVm.id}:`, error.message);
          });
        } else {
          // Linux VM
          this.logger.log('🐧 Linux VM detected');
          savedVm.operating_system = imageDetails?.operatingSystem || 'Linux';
          await this.vmInstanceRepo.save(savedVm);
          this.logger.log(`✅ OS type saved: ${savedVm.operating_system}`);
        }
      } catch (osError) {
        this.logger.error('❌ ========== ERROR CHECKING OS TYPE ==========');
        this.logger.error(`❌ Error: ${osError.message}`);
        this.logger.error(`❌ Stack: ${osError.stack}`);
        this.logger.error('❌ Attempting fallback OS detection from imageId...');
        
        // Fallback: Try to detect OS from imageId string
        // Windows images typically have 'windows' in the imageId or name
        const imageIdLower = createVmDto.imageId.toLowerCase();
        
        if (imageIdLower.includes('windows') || imageIdLower.includes('win-server')) {
          this.logger.log('🪟 Fallback: Detected Windows from imageId pattern');
          savedVm.operating_system = 'Windows Server';
          savedVm.operating_system_version = savedVm.operating_system_version || 'Unknown';
        } else if (imageIdLower.includes('ubuntu')) {
          this.logger.log('🐧 Fallback: Detected Ubuntu from imageId pattern');
          savedVm.operating_system = 'Ubuntu';
          savedVm.operating_system_version = savedVm.operating_system_version || 'Unknown';
        } else if (imageIdLower.includes('oracle-linux') || imageIdLower.includes('ol-')) {
          this.logger.log('🐧 Fallback: Detected Oracle Linux from imageId pattern');
          savedVm.operating_system = 'Oracle Linux';
          savedVm.operating_system_version = savedVm.operating_system_version || 'Unknown';
        } else if (imageIdLower.includes('centos')) {
          this.logger.log('🐧 Fallback: Detected CentOS from imageId pattern');
          savedVm.operating_system = 'CentOS';
          savedVm.operating_system_version = savedVm.operating_system_version || 'Unknown';
        } else {
          this.logger.warn('⚠️  Could not detect OS from imageId, marking as Unknown');
          savedVm.operating_system = 'Unknown Linux';
          savedVm.operating_system_version = savedVm.operating_system_version || 'Unknown';
        }

        savedVm.image_name = savedVm.image_name || createVmDto.imageId;
        
        await this.vmInstanceRepo.save(savedVm);
        this.logger.log(`✅ Fallback OS saved: ${savedVm.operating_system}`);
        this.logger.error('❌ ==========================================');
      }

      this.logger.log(`✅ ========== VM PROVISIONING COMPLETED ==========`);
      this.logger.log(`✅ VM ID: ${savedVm.id}`);
      this.logger.log(`✅ Instance Name: ${instanceName}`);
      this.logger.log(`✅ Shape: ${usedShape}`);
      this.logger.log(`✅ Lifecycle State: ${savedVm.lifecycle_state}`);
      this.logger.log(`✅ Public IP: ${savedVm.public_ip || 'Not available'}`);
      this.logger.log(`✅ OS: ${savedVm.operating_system || 'Unknown'}`);
      this.logger.log(`✅ ================================================`);
      return this.formatVmResponse(savedVm);
    } catch (error) {
      this.logger.error('Error provisioning VM:', error);
      throw new InternalServerErrorException(
        `Failed to provision VM: ${error.message}`,
      );
    }
  }

  /**
   * Get all VMs for a user
   */
  async getUserVms(userId: number): Promise<any[]> {
    const vms = await this.vmInstanceRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    return vms.map(vm => this.formatVmResponse(vm));
  }

  /**
   * Get specific VM by ID
   */
  async getVmById(userId: number, vmId: number): Promise<any> {
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: vmId, user_id: userId },
    });

    if (!vm) {
      throw new NotFoundException('VM not found');
    }

    // Try to update status and public IP from OCI
    try {
      const ociInstance = await this.ociService.getInstance(vm.instance_id);
      vm.lifecycle_state = ociInstance.lifecycleState;

      if (!vm.public_ip) {
        const publicIp = await this.ociService.getInstancePublicIp(
          vm.compartment_id,
          vm.instance_id,
        );
        if (publicIp) {
          vm.public_ip = publicIp;
        }
      }

      await this.vmInstanceRepo.save(vm);
    } catch (error) {
      this.logger.warn(`Could not update VM status from OCI: ${error.message}`);
    }

    return this.formatVmResponse(vm);
  }

  /**
   * Perform action on VM (start, stop, restart, terminate)
   */
  async performVmAction(userId: number, vmId: number, action: VmActionType): Promise<any> {
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: vmId, user_id: userId },
    });

    if (!vm) {
      throw new NotFoundException('VM not found');
    }

    this.logger.log(`Performing action ${action} on VM ${vmId}`);

    // Step 1: Check if VM still exists on OCI before performing action
    try {
      const instanceDetails = await this.ociService.getInstance(vm.instance_id);
      
      // Update VM state from OCI
      if (instanceDetails && instanceDetails.lifecycleState) {
        vm.lifecycle_state = instanceDetails.lifecycleState;
        await this.vmInstanceRepo.save(vm);
        
        this.logger.log(`VM ${vmId} exists on OCI with state: ${instanceDetails.lifecycleState}`);
        
        // Check if VM is in a state that doesn't allow this action
        if (instanceDetails.lifecycleState === 'TERMINATED' || instanceDetails.lifecycleState === 'TERMINATING') {
          throw new BadRequestException(
            `VM is in ${instanceDetails.lifecycleState} state and cannot perform ${action} action.`
          );
        }
      }
    } catch (checkError: any) {
      // If VM not found on OCI (404 error), mark as TERMINATED in database
      if (checkError.statusCode === 404 || checkError.serviceCode === 'NotAuthorizedOrNotFound') {
        this.logger.warn(`VM ${vmId} (OCI ID: ${vm.instance_id}) not found on Oracle Cloud. Marking as TERMINATED.`);
        
        vm.lifecycle_state = 'TERMINATED';
        await this.vmInstanceRepo.save(vm);
        
        // Log the check failure
        await this.logVmAction(
          vmId,
          userId,
          'CHECK',
          `VM not found on Oracle Cloud - marked as TERMINATED`,
          { 
            error: checkError.message,
            instanceId: vm.instance_id 
          },
        );
        
        throw new NotFoundException(
          `VM không còn tồn tại trên Oracle Cloud. VM có thể đã bị xóa thủ công hoặc do lỗi hệ thống. ` +
          `Vui lòng xóa subscription này và tạo VM mới nếu cần.`
        );
      }
      
      // If it's another error, re-throw it
      this.logger.error(`Error checking VM existence:`, checkError);
      throw new InternalServerErrorException(
        `Không thể kiểm tra trạng thái VM: ${checkError.message}`
      );
    }

    // Step 2: Perform the action
    try {
      let result;
      switch (action) {
        case VmActionType.START:
          result = await this.ociService.startInstance(vm.instance_id);
          vm.lifecycle_state = result.lifecycleState;
          // Set vm_started_at when VM transitions to RUNNING
          if (result.lifecycleState === 'RUNNING' && !vm.vm_started_at) {
            vm.vm_started_at = new Date();
          }
          break;

        case VmActionType.STOP:
          result = await this.ociService.stopInstance(vm.instance_id);
          vm.lifecycle_state = result.lifecycleState;
          break;

        case VmActionType.RESTART:
          result = await this.ociService.restartInstance(vm.instance_id);
          vm.lifecycle_state = result.lifecycleState;
          // Update vm_started_at when restarting
          if (result.lifecycleState === 'RUNNING') {
            vm.vm_started_at = new Date();
          }
          break;

        case VmActionType.TERMINATE:
          result = await this.ociService.terminateInstance(vm.instance_id, false);
          vm.lifecycle_state = 'TERMINATING';
          break;

        default:
          throw new BadRequestException('Invalid action');
      }

      await this.vmInstanceRepo.save(vm);

      // Log the action
      await this.logVmAction(
        vmId,
        userId,
        action,
        `VM action performed: ${action}`,
        { result },
      );

      // Notify user about VM action result
      const vmName = vm.instance_name || `VM #${vmId}`;
      const VM_NOTIFY_MAP: Record<string, { type: NotificationType; title: string; msg: string; titleEn: string; msgEn: string }> = {
        [VmActionType.START]:     { type: NotificationType.VM_STARTED,    title: '▶️ VM đã được bật',           msg: `Máy chủ "${vmName}" đã được khởi động thành công.`,  titleEn: '▶️ VM started',    msgEn: `Server "${vmName}" started successfully.` },
        [VmActionType.STOP]:      { type: NotificationType.VM_STOPPED,    title: '⏹️ VM đã được tắt',           msg: `Máy chủ "${vmName}" đã được tắt thành công.`,         titleEn: '⏹️ VM stopped',    msgEn: `Server "${vmName}" stopped successfully.` },
        [VmActionType.RESTART]:   { type: NotificationType.VM_RESTARTED,  title: '🔄 VM đã được khởi động lại', msg: `Máy chủ "${vmName}" đã được khởi động lại thành công.`, titleEn: '🔄 VM restarted',  msgEn: `Server "${vmName}" restarted successfully.` },
        [VmActionType.TERMINATE]: { type: NotificationType.VM_TERMINATED, title: '🗑️ VM đã bị xoá',             msg: `Máy chủ "${vmName}" đã được huỷ và xoá khỏi hệ thống.`,   titleEn: '🗑️ VM terminated', msgEn: `Server "${vmName}" was terminated and removed from the system.` },
      };
      const notifyInfo = VM_NOTIFY_MAP[action];
      if (notifyInfo) {
        await this.notificationService.notify(userId, notifyInfo.type, notifyInfo.title, notifyInfo.msg, { vm_id: vmId, action }, notifyInfo.titleEn, notifyInfo.msgEn);
      }

      this.logger.log(`Action ${action} completed successfully on VM ${vmId}`);

      // Fire-and-forget: poll OCI in background until stable state, then update DB
      const STABLE_STATES = ['RUNNING', 'STOPPED', 'TERMINATED'];
      if (!STABLE_STATES.includes(vm.lifecycle_state)) {
        this.pollVmUntilStable(vm.id, vm.instance_id).catch(err =>
          this.logger.error(`Background poll error for VM ${vmId}:`, err),
        );
      }

      return this.formatVmResponse(vm);
    } catch (error) {
      this.logger.error(`Error performing action ${action}:`, error);
      
      // Log the failed action
      await this.logVmAction(
        vmId,
        userId,
        action,
        `VM action failed: ${action}`,
        { error: error.message },
      );

      // Check if it's a 404 error during action (VM was deleted between check and action)
      if (error.statusCode === 404 || error.serviceCode === 'NotAuthorizedOrNotFound') {
        vm.lifecycle_state = 'TERMINATED';
        await this.vmInstanceRepo.save(vm);
        
        throw new NotFoundException(
          `VM không còn tồn tại trên Oracle Cloud. VM có thể đã bị xóa trong khi thực hiện action.`
        );
      }

      throw new InternalServerErrorException(
        `Failed to ${action} VM: ${error.message}`,
      );
    }
  }

  /**
   * Background polling: update DB lifecycle_state until OCI reaches a stable state.
   * Called fire-and-forget after any START/STOP/RESTART action.
   */
  private async pollVmUntilStable(
    vmId: number,
    instanceOcid: string,
    maxWaitMs: number = 10 * 60 * 1000, // 10 minutes
    pollIntervalMs: number = 10 * 1000,  // 10 seconds
  ): Promise<void> {
    const STABLE_STATES = ['RUNNING', 'STOPPED', 'TERMINATED'];
    const startTime = Date.now();

    this.logger.log(`[pollVmUntilStable] Starting background poll for VM ${vmId} (${instanceOcid})`);

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      try {
        const instanceDetails = await this.ociService.getInstance(instanceOcid);
        const currentState = instanceDetails?.lifecycleState;

        this.logger.log(`[pollVmUntilStable] VM ${vmId} state: ${currentState}`);

        // Always persist latest state from OCI
        await this.vmInstanceRepo.update(vmId, { lifecycle_state: currentState });

        if (STABLE_STATES.includes(currentState)) {
          this.logger.log(`[pollVmUntilStable] VM ${vmId} reached stable state: ${currentState}`);
          return;
        }
      } catch (err: any) {
        if (err.statusCode === 404 || err.serviceCode === 'NotAuthorizedOrNotFound') {
          this.logger.warn(`[pollVmUntilStable] VM ${vmId} not found on OCI — marking TERMINATED`);
          await this.vmInstanceRepo.update(vmId, { lifecycle_state: 'TERMINATED' });
          return;
        }
        this.logger.error(`[pollVmUntilStable] Error polling VM ${vmId}:`, err.message);
        // Continue polling on transient errors
      }
    }

    this.logger.warn(`[pollVmUntilStable] Timeout polling VM ${vmId} after ${maxWaitMs / 1000}s`);
  }

  /**
   * Get VM action logs
   */
  async getVmActionLogs(userId: number, vmId: number) {
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: vmId, user_id: userId },
    });

    if (!vm) {
      throw new NotFoundException('VM not found');
    }

    const logs = await this.vmActionsLogRepo.find({
      where: { vm_instance_id: vmId },
      order: { created_at: 'DESC' },
    });

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      metadata: log.metadata,
      createdAt: log.created_at,
    }));
  }

  /**
   * Ensure user has a compartment (create if not exists)
   * If compartment was deleted from OCI, create a new one
   */
  private async ensureUserCompartment(userId: number): Promise<UserCompartment> {
    // Check if user has an ACTIVE compartment in database
    let userCompartment = await this.userCompartmentRepo.findOne({
      where: { user_id: userId, lifecycle_state: 'ACTIVE' },
    });

    if (userCompartment) {
      // Verify that the compartment still exists AND is ACTIVE in OCI
      try {
        const ociCompartment = await this.ociService.getCompartment(userCompartment.compartment_ocid);
        
        // Check if compartment is in ACTIVE state
        if (ociCompartment.lifecycleState !== 'ACTIVE') {
          const staleOcid = userCompartment.compartment_ocid;
          this.logger.warn(
            `Compartment ${staleOcid} exists but is in ${ociCompartment.lifecycleState} state. ` +
            `Need ACTIVE state. Creating new compartment...`
          );
          
          // Delete stale compartment record from database
          await this.userCompartmentRepo.remove(userCompartment);
          // Will create new compartment below
        } else {
          this.logger.log(`Using existing ACTIVE compartment: ${userCompartment.compartment_ocid}`);
          return userCompartment;
        }
      } catch (error) {
        // Compartment was deleted from OCI or not accessible
        const staleOcid = userCompartment.compartment_ocid;
        this.logger.warn(`Compartment ${staleOcid} no longer exists in OCI. Creating new compartment for user ${userId}...`);
        
        // Delete stale compartment record from database
        // This will cascade delete associated VCN and VMs (due to foreign keys)
        await this.userCompartmentRepo.remove(userCompartment);
        // Will create new compartment below
      }
    }

    // Create new compartment in OCI
    this.logger.log(`Creating new compartment for user ${userId}`);
    
    // Get user email to generate compartment name
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    // Convert email to compartment name format
    // Example: trandinhnamuet@gmail.com -> trandinhnamuet-gmail-com
    const compartmentName = user.email
      .toLowerCase()
      .replace('@', '-')
      .replace(/\./g, '-');
    const compartmentDesc = `Compartment for user ${user.email}`;

    const ociCompartment = await this.ociService.createCompartment(
      compartmentName,
      compartmentDesc,
    );

    // Save to database
    userCompartment = this.userCompartmentRepo.create({
      user_id: userId,
      compartment_ocid: ociCompartment.id,
      compartment_name: compartmentName,
      region: 'ap-tokyo-1', // Default region
      lifecycle_state: 'ACTIVE',
      created_at: new Date(),
    }) as UserCompartment;

    userCompartment = await this.userCompartmentRepo.save(userCompartment);
    this.logger.log(`Compartment created: ${userCompartment.compartment_ocid}`);

    // Wait for compartment to be fully synchronized in OCI
    // New compartments need time to propagate across OCI's distributed system
    this.logger.log('Waiting for compartment to be ready...');
    await this.waitForCompartmentReady(userCompartment.compartment_ocid);

    return userCompartment;
  }

  /**
   * Ensure VCN and subnet exist for a compartment (create if not exists)
   * Each user has only ONE VCN shared across all their VMs
   * If VCN was deleted from OCI, create a new one
   */
  private async ensureVcnAndSubnet(
    userCompartment: UserCompartment,
  ): Promise<VcnResource> {
    // CRITICAL: Verify the compartment still exists AND is ACTIVE in OCI before proceeding
    // This prevents "NotAuthorizedOrNotFound" errors when trying to create VCN in deleted/deleting compartments
    try {
      const ociCompartment = await this.ociService.getCompartment(userCompartment.compartment_ocid);
      
      if (ociCompartment.lifecycleState !== 'ACTIVE') {
        this.logger.error(
          `Compartment ${userCompartment.compartment_ocid} is in ${ociCompartment.lifecycleState} state, ` +
          `but ACTIVE state is required to create resources.`
        );
        throw new InternalServerErrorException(
          `Cannot create VCN: Compartment is in ${ociCompartment.lifecycleState} state. ` +
          `Please wait for the compartment to be deleted completely and try again.`
        );
      }
      
      this.logger.log(`Verified compartment is ACTIVE in OCI: ${userCompartment.compartment_ocid}`);
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error; // Re-throw our custom error
      }
      
      this.logger.error(`Compartment ${userCompartment.compartment_ocid} no longer exists in OCI!`);
      this.logger.error(`This should not happen - compartment was verified in ensureUserCompartment.`);
      this.logger.error(`Error: ${error.message}`);
      throw new InternalServerErrorException(
        `Compartment verification failed. The compartment may have been deleted from OCI. ` +
        `Please try again to create a new compartment.`
      );
    }

    // Check if user already has a VCN (regardless of compartment)
    // This ensures one VCN per user, shared by all VMs
    let vcnResource = await this.vcnResourceRepo.findOne({
      where: { 
        user_id: userCompartment.user_id,
        lifecycle_state: 'AVAILABLE' 
      },
      order: { created_at: 'DESC' } as any
    });

    if (vcnResource) {
      // Verify that the VCN still exists in OCI
      try {
        await this.ociService.getVcn(vcnResource.vcn_ocid);
        this.logger.log(`Reusing existing VCN for user ${userCompartment.user_id}: ${vcnResource.vcn_ocid}`);
        return vcnResource;
      } catch (error) {
        // VCN no longer exists in OCI (deleted when compartment was deleted)
        this.logger.warn(`VCN ${vcnResource.vcn_ocid} no longer exists in OCI. Creating new VCN...`);
        
        // Delete the stale record from database
        await this.vcnResourceRepo.remove(vcnResource);
        vcnResource = null as any;
      }
    }

    // Create new VCN, subnet, and internet gateway
    this.logger.log(`Creating new VCN for compartment ${userCompartment.compartment_ocid}`);

    const vcnName = `vcn-${userCompartment.user_id}-${Date.now()}`;
    const cidrBlock = '10.0.0.0/16';
    const subnetCidr = '10.0.1.0/24';
    // DNS label must be 1-15 chars, alphanumeric + hyphen
    const dnsLabel = `vcn${userCompartment.user_id}${Date.now().toString().slice(-6)}`.slice(0, 15);

    // Step 1: Create VCN
    const ociVcn = await this.ociService.createVcn(
      userCompartment.compartment_ocid,
      vcnName,
      cidrBlock,
      dnsLabel,
    );

    // Step 2: Create Internet Gateway
    const igwName = `igw-${userCompartment.user_id}-${Date.now()}`;
    const ociIgw = await this.ociService.createInternetGateway(
      userCompartment.compartment_ocid,
      ociVcn.id,
      igwName,
    );

    // Step 3: Update default route table
    const vcnDetails = await this.ociService.getVcn(ociVcn.id);
    if (!vcnDetails.defaultRouteTableId) {
      throw new InternalServerErrorException('VCN does not have a default route table');
    }
    await this.ociService.updateRouteTable(
      vcnDetails.defaultRouteTableId,
      ociIgw.id,
    );

    // Step 3.5: Update default security list to allow SSH, HTTP, HTTPS
    if (!vcnDetails.defaultSecurityListId) {
      throw new InternalServerErrorException('VCN does not have a default security list');
    }
    this.logger.log('Updating security list to allow SSH, HTTP, and HTTPS...');
    await this.ociService.updateSecurityList(vcnDetails.defaultSecurityListId);

    // Step 4: Get availability domain
    const availabilityDomains = await this.ociService.listAvailabilityDomains(
      userCompartment.compartment_ocid,
    );
    if (availabilityDomains.length === 0) {
      throw new InternalServerErrorException('No availability domains found');
    }
    const availabilityDomain = availabilityDomains[0].name;
    if (!availabilityDomain) {
      throw new InternalServerErrorException('Availability domain name is undefined');
    }

    // Step 5: Create Subnet
    const subnetName = `subnet-${userCompartment.user_id}-${Date.now()}`;
    const subnetDnsLabel = `sub${userCompartment.user_id}${Date.now().toString().slice(-7)}`.slice(0, 15);
    const ociSubnet = await this.ociService.createSubnet(
      userCompartment.compartment_ocid,
      ociVcn.id,
      subnetName,
      subnetCidr,
      availabilityDomain,
      subnetDnsLabel,
    );

    // Save to database
    vcnResource = this.vcnResourceRepo.create({
      user_id: userCompartment.user_id,
      compartment_id: userCompartment.compartment_ocid,
      vcn_ocid: ociVcn.id,
      vcn_name: vcnName,
      vcn_cidr_block: cidrBlock,
      subnet_ocid: ociSubnet.id,
      subnet_name: subnetName,
      internet_gateway_ocid: ociIgw.id,
      route_table_id: vcnDetails.defaultRouteTableId,
      region: userCompartment.region,
      lifecycle_state: 'AVAILABLE',
    }) as VcnResource;

    vcnResource = await this.vcnResourceRepo.save(vcnResource);
    this.logger.log(`VCN and subnet created: ${vcnResource.vcn_ocid}`);

    return vcnResource;
  }

  /**
   * Log VM action to database
   */
  private async logVmAction(
    vmInstanceId: number,
    userId: number,
    action: string,
    description: string,
    metadata?: any,
  ) {
    const log = this.vmActionsLogRepo.create({
      vm_instance_id: vmInstanceId,
      user_id: userId,
      action: action,
      description: description,
      metadata: metadata,
    }) as VmActionsLog;

    await this.vmActionsLogRepo.save(log);
  }

  /**
   * Format VM response
   */
  private formatVmResponse(vm: VmInstance) {
    return {
      id: vm.id,
      subscriptionId: vm.subscription_id,
      instanceName: vm.instance_name,
      instanceId: vm.instance_id,
      compartmentId: vm.compartment_id,
      shape: vm.shape,
      imageId: vm.image_id,
      imageName: vm.image_name,
      operatingSystem: vm.operating_system,
      operatingSystemVersion: vm.operating_system_version,
      region: vm.region,
      availabilityDomain: vm.availability_domain,
      lifecycleState: vm.lifecycle_state,
      publicIp: vm.public_ip,
      privateIp: vm.private_ip,
      vcnId: vm.vcn_id,
      subnetId: vm.subnet_id,
      sshPublicKey: vm.ssh_public_key,
      windowsInitialPassword: vm.windows_initial_password,
      createdAt: vm.created_at,
      startedAt: vm.vm_started_at,
      updatedAt: vm.updated_at,
    };
  }

  /**
   * Helper: sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Schedule background job to retrieve Windows password
   * This runs asynchronously to avoid blocking the API response
   */
  private async scheduleWindowsPasswordRetrieval(vmId: number, instanceId: string, subscriptionId: string): Promise<void> {
    this.logger.log(`🔄 [Background] Starting Windows password retrieval for VM ${vmId}, Subscription ${subscriptionId}`);
    
    try {
      // Wait for instance to reach RUNNING state (max 12 minutes)
      const isRunning = await this.pollInstanceUntilRunning(instanceId, 12);
      
      if (!isRunning) {
        this.logger.warn(`⚠️  [Background] VM ${vmId}: Instance did not reach RUNNING state`);
        return;
      }
      
      // Reload VM from database
      const vm = await this.vmInstanceRepo.findOne({ where: { id: vmId } });
      if (!vm) {
        this.logger.error(`❌ [Background] VM ${vmId} not found in database`);
        return;
      }
      
      // Update state
      vm.lifecycle_state = 'RUNNING';
      vm.vm_started_at = new Date();
      await this.vmInstanceRepo.save(vm);
      this.logger.log(`✅ [Background] VM ${vmId} is RUNNING`);
      
      // Retry fetching Windows credentials for up to 15 minutes (30s interval = 30 attempts)
      this.logger.log(`⏳ [Background] Starting credential retrieval loop (max 15 min, every 30s)...`);
      const maxCredAttempts = 30;
      let credentialsSaved = false;

      for (let attempt = 1; attempt <= maxCredAttempts; attempt++) {
        // Wait 30 seconds between each attempt (first attempt also waits to give OCI time)
        this.logger.log(`⏳ [Background] Waiting 30 seconds before credential attempt ${attempt}/${maxCredAttempts}...`);
        await this.sleep(30000);

        try {
          const credentials = await this.ociService.getWindowsInitialCredentials(instanceId);

          if (credentials) {
            // Reload VM in case DB row changed
            const freshVm = await this.vmInstanceRepo.findOne({ where: { id: vmId } });
            if (!freshVm) {
              this.logger.error(`❌ [Background] VM ${vmId} no longer in database`);
              return;
            }
            freshVm.windows_initial_password = credentials.password;
            await this.vmInstanceRepo.save(freshVm);
            credentialsSaved = true;
            this.logger.log(`🎉 [Background] VM ${vmId}: Windows credentials retrieved on attempt ${attempt}`);
            this.logger.log(`🎉 [Background] Username: ${credentials.username}`);
            this.logger.log(`🎉 [Background] Password saved to database`);

            // Send email notification with password
            try {
              const subscription = await this.subscriptionRepo.findOne({
                where: { id: subscriptionId },
                relations: ['user'],
              });

              if (subscription && subscription.user?.email) {
                this.logger.log(`📧 [Background] Sending Windows credentials email to ${subscription.user.email}...`);

                // Ensure public IP is available
                let publicIp = freshVm.public_ip;
                if (!publicIp) {
                  try {
                    const compartment = await this.userCompartmentRepo.findOne({
                      where: { user_id: freshVm.user_id },
                    });
                    if (compartment) {
                      const retrievedIp = await this.ociService.getInstancePublicIp(
                        compartment.compartment_ocid,
                        instanceId,
                      );
                      if (retrievedIp) {
                        publicIp = retrievedIp;
                        freshVm.public_ip = retrievedIp;
                        await this.vmInstanceRepo.save(freshVm);
                      }
                    }
                  } catch (ipError) {
                    this.logger.warn(`⚠️  Could not retrieve public IP: ${ipError.message}`);
                  }
                }

                await this.sendWindowsPasswordEmail(
                  subscription.user.email,
                  {
                    name: freshVm.instance_name,
                    publicIp: publicIp || 'Check OCI Console',
                    operatingSystem: freshVm.operating_system || 'Windows Server',
                    status: freshVm.lifecycle_state,
                  },
                  {
                    username: credentials.username,
                    password: credentials.password,
                  },
                  subscription,
                );

                this.logger.log(`✅ [Background] Windows credentials email sent successfully`);
              } else {
                this.logger.warn(`⚠️  [Background] Could not find user email for subscription ${subscriptionId}`);
              }
            } catch (emailError) {
              this.logger.error(`❌ [Background] Failed to send email:`, emailError.message);
              // Password is already saved in DB — not fatal
            }

            break; // Credentials retrieved and saved — exit retry loop
          } else {
            this.logger.warn(`⚠️  [Background] VM ${vmId}: Credentials not ready yet (attempt ${attempt}/${maxCredAttempts})`);
          }
        } catch (credError) {
          this.logger.error(`❌ [Background] VM ${vmId}: Error getting credentials (attempt ${attempt}):`, credError.message);
        }
      }

      if (!credentialsSaved) {
        this.logger.error(`❌ [Background] VM ${vmId}: Could not retrieve Windows credentials after ${maxCredAttempts} attempts (15 min)`);
      }
    } catch (error) {
      this.logger.error(`❌ [Background] VM ${vmId}: Error in password retrieval:`, error.message);
    }
  }

  /**
   * Poll instance until it reaches RUNNING state
   * @param instanceId - The OCID of the instance
   * @param maxWaitMinutes - Maximum time to wait in minutes (default: 10)
   * @returns true if RUNNING, false if timeout
   */
  private async pollInstanceUntilRunning(instanceId: string, maxWaitMinutes: number = 10): Promise<boolean> {
    const maxAttempts = (maxWaitMinutes * 60) / 15; // Check every 15 seconds
    let attempts = 0;

    this.logger.log(`⏳ Polling instance state until RUNNING (max ${maxWaitMinutes} minutes)...`);

    while (attempts < maxAttempts) {
      try {
        const instance = await this.ociService.getInstance(instanceId);
        this.logger.log(`📊 Poll attempt ${attempts + 1}/${maxAttempts}: State = ${instance.lifecycleState}`);

        if (instance.lifecycleState === 'RUNNING') {
          this.logger.log('✅ Instance is RUNNING!');
          return true;
        }

        if (instance.lifecycleState === 'TERMINATED' || instance.lifecycleState === 'TERMINATING') {
          this.logger.error('❌ Instance terminated or terminating');
          return false;
        }

        // Wait 15 seconds before next poll
        await this.sleep(15000);
        attempts++;
      } catch (error) {
        this.logger.warn(`⚠️  Error polling instance state: ${error.message}`);
        await this.sleep(15000);
        attempts++;
      }
    }

    this.logger.warn(`⏱️  Timeout waiting for instance to reach RUNNING state after ${maxWaitMinutes} minutes`);
    return false;
  }

  /**
   * Wait for newly created compartment to be ready and synchronized
   * This is necessary because OCI needs time to propagate compartment creation
   * across its distributed infrastructure. Without this wait, subsequent operations
   * (like creating VCN) may fail with "NotAuthorizedOrNotFound" errors.
   */
  private async waitForCompartmentReady(compartmentOcid: string): Promise<void> {
    const maxRetries = 10; // Increased from 5 to 10 for better reliability
    const baseDelay = 3000; // Increased from 2s to 3s
    
    this.logger.log(`⏳ Waiting for compartment ${compartmentOcid} to be fully synchronized...`);
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to verify compartment exists by fetching it
        const compartment = await this.ociService.getCompartment(compartmentOcid);
        
        // Check if compartment is in ACTIVE state
        if (compartment.lifecycleState !== 'ACTIVE') {
          this.logger.warn(`Compartment is in ${compartment.lifecycleState} state, waiting...`);
          
          // Exponential backoff: 3s, 6s, 12s, 24s...
          const delay = baseDelay * Math.pow(2, i);
          this.logger.warn(`Waiting ${delay}ms before retry (attempt ${i + 1}/${maxRetries})...`);
          await this.sleep(delay);
          continue;
        }
        
        // Compartment is ACTIVE, add additional delay to ensure full propagation
        // This is critical for avoiding "NotAuthorizedOrNotFound" errors
        const finalDelay = 5000; // 5 seconds final wait
        this.logger.log(`✅ Compartment is ACTIVE. Waiting additional ${finalDelay}ms for full propagation...`);
        await this.sleep(finalDelay);
        
        this.logger.log(`✅ Compartment ${compartmentOcid} is ready and fully synchronized`);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          // Last retry failed
          this.logger.error(`❌ Compartment ${compartmentOcid} not ready after ${maxRetries} retries`);
          this.logger.error(`Error: ${error.message}`);
          throw new InternalServerErrorException(
            'Compartment creation verification failed. Please try again in a few moments.'
          );
        }
        
        // Exponential backoff: 3s, 6s, 12s, 24s, 48s...
        const delay = baseDelay * Math.pow(2, i);
        this.logger.warn(`⚠️  Compartment not accessible yet: ${error.message}`);
        this.logger.warn(`Retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Send Windows password email to user
   */
  private async sendWindowsPasswordEmail(
    email: string,
    vmInfo: any,
    windowsCredentials: { username: string; password: string },
    subscription: any,
  ) {
    this.logger.log('📧 [Background] ========== SENDING WINDOWS EMAIL ==========');
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
                <p><strong>Status:</strong> ${vmInfo.status || 'RUNNING'}</p>
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
                <li>When prompted, enter the username and password above</li>
              </ol>

              <h4>Option 2: From Mac</h4>
              <ol>
                <li>Download "Microsoft Remote Desktop" from Mac App Store</li>
                <li>Click "+ Add PC"</li>
                <li>Enter PC Name: <code>${vmInfo.publicIp || 'YOUR_VM_IP'}</code></li>
                <li>Enter credentials when connecting</li>
              </ol>

              <h3>🔐 First Login Recommendations:</h3>
              <div class="info-box">
                <h4>After your first login, we recommend:</h4>
                <ol>
                  <li><strong>Change your password immediately</strong> for security</li>
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
                </ul>
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

      this.logger.log(`✅ [Background] Windows credentials email sent successfully to ${email}`);
      this.logger.log('📧 [Background] ==========================================');
    } catch (error) {
      this.logger.error('❌ [Background] ========== EMAIL SEND FAILED ==========');
      this.logger.error(`❌ [Background] Failed to send Windows credentials email to ${email}`);
      this.logger.error(`❌ [Background] Error: ${error.message}`);
      this.logger.error('❌ [Background] ========================================');
      throw error;
    }
  }
}
