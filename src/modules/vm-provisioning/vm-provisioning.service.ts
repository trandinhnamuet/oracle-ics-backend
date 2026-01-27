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
import { CreateVmDto, VmActionType } from './dto';

@Injectable()
export class VmProvisioningService {
  private readonly logger = new Logger(VmProvisioningService.name);

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
    private readonly ociService: OciService,
    private readonly systemSshKeyService: SystemSshKeyService,
  ) {}

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
        
        if (isWindows) {
          this.logger.log('🪟 ========== WINDOWS VM DETECTED ==========');
          this.logger.log(`🪟 Image: ${imageDetails.displayName}`);
          this.logger.log(`🪟 OS: ${imageDetails.operatingSystem}`);
          
          // Update OS first
          savedVm.operating_system = imageDetails.operatingSystem;
          await this.vmInstanceRepo.save(savedVm);
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
          
          // For Windows, we need to wait for the instance to be RUNNING
          // because Windows password is only available when VM is fully running
          this.logger.log('🔑 Windows VM requires RUNNING state to retrieve password');
          this.logger.log('⏳ Waiting for instance to reach RUNNING state (this may take 5-10 minutes)...');
          
          const isRunning = await this.pollInstanceUntilRunning(ociInstance.id, 10);
          
          if (isRunning) {
            // Update state in database
            savedVm.lifecycle_state = 'RUNNING';
            savedVm.vm_started_at = new Date();
            await this.vmInstanceRepo.save(savedVm);
            this.logger.log('✅ Instance is RUNNING, now attempting to get Windows password...');
            
            // Wait a bit more for password to be generated
            this.logger.log('⏳ Waiting additional 30 seconds for password generation...');
            await this.sleep(30000);
            
            try {
              const credentials = await this.ociService.getWindowsInitialCredentials(ociInstance.id);
              
              if (credentials) {
                savedVm.windows_initial_password = credentials.password;
                await this.vmInstanceRepo.save(savedVm);
                this.logger.log('🎉 ========== WINDOWS CREDENTIALS RETRIEVED ==========');
                this.logger.log(`🎉 Username: ${credentials.username}`);
                this.logger.log(`🎉 Password: ${credentials.password.substring(0, 4)}...${credentials.password.substring(credentials.password.length - 4)}`);
                this.logger.log('🎉 Credentials saved to database');
                this.logger.log('🎉 ===============================================');
              } else {
                this.logger.warn('⚠️  ========== WINDOWS CREDENTIALS NOT AVAILABLE ==========');
                this.logger.warn('⚠️  The password is not available via API.');
                this.logger.warn('⚠️  User will need to retrieve it from OCI Console.');
                this.logger.warn('⚠️  =======================================================');
              }
            } catch (credError) {
              this.logger.error('❌ ========== FAILED TO GET WINDOWS CREDENTIALS ==========');
              this.logger.error(`❌ Error: ${credError.message}`);
              this.logger.error(`❌ Status: ${credError.statusCode || 'N/A'}`);
              this.logger.error('❌ User will need to get password from OCI Console');
              this.logger.error('❌ ========================================================');
            }
          } else {
            this.logger.warn('⚠️  ========== TIMEOUT WAITING FOR RUNNING STATE ==========');
            this.logger.warn('⚠️  Instance did not reach RUNNING state in time');
            this.logger.warn('⚠️  User will need to wait and retrieve password from OCI Console');
            this.logger.warn('⚠️  ==========================================================');
            
            // Still update the latest state
            try {
              const latestInstance = await this.ociService.getInstance(ociInstance.id);
              savedVm.lifecycle_state = latestInstance.lifecycleState;
              if (latestInstance.lifecycleState === 'RUNNING') {
                savedVm.vm_started_at = new Date();
              }
              await this.vmInstanceRepo.save(savedVm);
            } catch (e) {
              this.logger.warn('Could not update latest instance state:', e.message);
            }
          }
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
        this.logger.error('❌ Continuing without OS detection...');
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

      this.logger.log(`Action ${action} completed successfully on VM ${vmId}`);
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

      throw new InternalServerErrorException(
        `Failed to ${action} VM: ${error.message}`,
      );
    }
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
}
