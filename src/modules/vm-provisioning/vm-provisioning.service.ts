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
            createVmDto.displayName,
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
        throw launchError || new InternalServerErrorException('Failed to launch instance with all available shapes');
      }

      // Step 7: Save VM instance to database
      const vmInstance = this.vmInstanceRepo.create({
        user_id: userId,
        compartment_id: userCompartment.compartment_ocid,
        instance_id: ociInstance.id,
        instance_name: createVmDto.displayName,
        shape: usedShape,
        image_id: createVmDto.imageId,
        lifecycle_state: ociInstance.lifecycleState,
        ssh_public_key: createVmDto.userSshPublicKey,
        vcn_id: vcnResource.vcn_ocid,
        subnet_id: vcnResource.subnet_ocid,
        availability_domain: availabilityDomain,
        subscription_id: createVmDto.subscriptionId,
        vm_started_at: ociInstance.lifecycleState === 'RUNNING' ? new Date() : (null as any),
      }) as VmInstance;

      const savedVm = await this.vmInstanceRepo.save(vmInstance) as VmInstance;

      // Step 8: Log the creation action
      await this.logVmAction(
        savedVm.id,
        userId,
        'CREATE',
        `VM instance created: ${createVmDto.displayName} with shape ${usedShape}`,
        { ociInstanceId: ociInstance.id, shape: usedShape },
      );

      // Step 9: Wait a bit and get public IP
      this.logger.log('Waiting for instance to get public IP...');
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
          this.logger.log(`Instance public IP: ${publicIp}`);
        }
      } catch (error) {
        this.logger.warn('Could not retrieve public IP yet:', error.message);
      }

      this.logger.log(`VM provisioning completed successfully: ${savedVm.id} with shape ${usedShape}`);
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
  async getVmById(userId: number, vmId: string): Promise<any> {
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
  async performVmAction(userId: number, vmId: string, action: VmActionType): Promise<any> {
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
  async getVmActionLogs(userId: number, vmId: string) {
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
      // Verify that the compartment still exists in OCI
      try {
        await this.ociService.getCompartment(userCompartment.compartment_ocid);
        this.logger.log(`Using existing compartment: ${userCompartment.compartment_ocid}`);
        return userCompartment;
      } catch (error) {
        // Compartment was deleted from OCI
        this.logger.warn(`Compartment ${userCompartment.compartment_ocid} no longer exists in OCI. Creating new compartment for user ${userId}...`);
        
        // Delete stale compartment record from database
        // This will cascade delete associated VCN and VMs (due to foreign keys)
        await this.userCompartmentRepo.remove(userCompartment);
        userCompartment = null as any;
      }
    }

    // Create new compartment in OCI
    this.logger.log(`Creating new compartment for user ${userId}`);
    const compartmentName = `user-${userId}-compartment-${Date.now()}`;
    const compartmentDesc = `Compartment for user ${userId}`;

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
    vmInstanceId: string,
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
   * Wait for newly created compartment to be ready and synchronized
   * This is necessary because OCI needs time to propagate compartment creation
   * across its distributed infrastructure
   */
  private async waitForCompartmentReady(compartmentOcid: string): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 2000; // Start with 2 seconds
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to verify compartment exists by fetching it
        await this.ociService.getCompartment(compartmentOcid);
        
        // If successful, add a small additional delay to ensure full propagation
        await this.sleep(1000);
        this.logger.log(`Compartment ${compartmentOcid} is ready`);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          // Last retry failed
          this.logger.error(`Compartment ${compartmentOcid} not ready after ${maxRetries} retries`);
          throw new InternalServerErrorException(
            'Compartment creation verification failed. Please try again in a few moments.'
          );
        }
        
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = baseDelay * Math.pow(2, i);
        this.logger.warn(`Compartment not ready yet, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
        await this.sleep(delay);
      }
    }
  }
}
