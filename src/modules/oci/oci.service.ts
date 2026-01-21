import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as oci from 'oci-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class OciService {
  private readonly logger = new Logger(OciService.name);
  private computeClient: oci.core.ComputeClient;
  private identityClient: oci.identity.IdentityClient;
  private virtualNetworkClient: oci.core.VirtualNetworkClient;
  private provider: oci.common.ConfigFileAuthenticationDetailsProvider;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
  ) {
    this.initializeOciClients();
  }

  private initializeOciClients() {
    try {
      // Path to OCI config file
      const configPath = path.join(os.homedir(), '.oci', 'config');
      
      if (!fs.existsSync(configPath)) {
        this.logger.error('OCI config file not found at: ' + configPath);
        throw new Error('OCI config file not found');
      }

      // Initialize provider with DEFAULT profile
      this.provider = new oci.common.ConfigFileAuthenticationDetailsProvider(
        configPath,
        'DEFAULT'
      );

      // Initialize Compute Client
      this.computeClient = new oci.core.ComputeClient({
        authenticationDetailsProvider: this.provider,
      });

      // Initialize Identity Client
      this.identityClient = new oci.identity.IdentityClient({
        authenticationDetailsProvider: this.provider,
      });

      // Initialize Virtual Network Client
      this.virtualNetworkClient = new oci.core.VirtualNetworkClient({
        authenticationDetailsProvider: this.provider,
      });

      this.logger.log('OCI SDK clients initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize OCI clients:', error);
      throw error;
    }
  }

  /**
   * Get list of available compute images for a given compartment
   * @param compartmentId - The OCID of the compartment
   * @param operatingSystem - Optional filter by OS (e.g., "Oracle Linux", "Ubuntu", "Windows")
   * @param shape - Optional filter by compatible shape
   */
  async listComputeImages(
    compartmentId: string,
    operatingSystem?: string,
    shape?: string,
  ) {
    try {
      const allImages: any[] = [];
      let page: string | undefined = undefined;

      // Paginate through all results
      while (true) {
        const request: oci.core.requests.ListImagesRequest = {
          compartmentId: compartmentId,
          operatingSystem: operatingSystem,
          shape: shape,
          sortBy: oci.core.requests.ListImagesRequest.SortBy.Timecreated,
          sortOrder: oci.core.requests.ListImagesRequest.SortOrder.Desc,
          limit: 500,
          page: page,
        };

        const response = await this.computeClient.listImages(request);
        
        const images = response.items.map(image => {
          // Determine architecture based on image displayName and operatingSystem
          // Check for aarch64/ARM indicators in the name - this is most reliable
          let architecture = 'X86_64'; // Default to x86
          
          const displayNameLower = (image.displayName || '').toLowerCase();
          const osLower = (image.operatingSystem || '').toLowerCase();
          
          // AARCH64/ARM detection (most reliable)
          if (displayNameLower.includes('aarch64') || 
              displayNameLower.includes('arm64') ||
              displayNameLower.includes('arm') || 
              displayNameLower.includes('graviton') ||
              osLower.includes('aarch64') ||
              osLower.includes('arm')) {
            architecture = 'AARCH64';
          }
          
          return {
            id: image.id,
            displayName: image.displayName,
            operatingSystem: image.operatingSystem,
            operatingSystemVersion: image.operatingSystemVersion,
            createImageAllowed: image.createImageAllowed,
            lifecycleState: image.lifecycleState,
            sizeInMBs: image.sizeInMBs,
            timeCreated: image.timeCreated,
            compartmentId: image.compartmentId,
            architecture: architecture,
          };
        });

        allImages.push(...images);

        // Check if there are more pages
        if (!response.opcNextPage) {
          break;
        }

        page = response.opcNextPage as string;
      }

      this.logger.log(`Retrieved ${allImages.length} compute images`);
      return allImages;
    } catch (error) {
      this.logger.error('Error fetching compute images:', error);
      throw error;
    }
  }

  /**
   * Get details of a specific image
   * @param imageId - The OCID of the image
   */
  async getImage(imageId: string) {
    try {
      const request: oci.core.requests.GetImageRequest = {
        imageId: imageId,
      };

      const response = await this.computeClient.getImage(request);
      
      this.logger.log(`Retrieved image details: ${response.image.id}`);
      return {
        id: response.image.id,
        displayName: response.image.displayName,
        operatingSystem: response.image.operatingSystem,
        operatingSystemVersion: response.image.operatingSystemVersion,
        lifecycleState: response.image.lifecycleState,
        sizeInMBs: response.image.sizeInMBs,
        timeCreated: response.image.timeCreated,
        compartmentId: response.image.compartmentId,
      };
    } catch (error) {
      this.logger.error('Error getting image details:', error);
      throw error;
    }
  }

  /**
   * Get list of marketplace images (applications)
   * @param compartmentId - The OCID of the compartment
   */
  async listMarketplaceImages(compartmentId: string) {
    try {
      // List marketplace listings using Core Services
      const request: oci.core.requests.ListAppCatalogListingsRequest = {
        limit: 500,
      };

      const response = await this.computeClient.listAppCatalogListings(request);
      
      const marketplaceImages = response.items.map(listing => ({
        listingId: listing.listingId,
        displayName: listing.displayName,
        summary: listing.summary,
        publisherName: listing.publisherName,
      }));

      this.logger.log(`Retrieved ${marketplaceImages.length} marketplace images`);
      return marketplaceImages;
    } catch (error) {
      this.logger.error('Error fetching marketplace images:', error);
      throw error;
    }
  }

  /**
   * Get details of a specific marketplace listing version
   * @param listingId - The listing ID
   * @param resourceVersion - The resource version
   */
  async getMarketplaceListingVersion(listingId: string, resourceVersion: string) {
    try {
      const request: oci.core.requests.GetAppCatalogListingResourceVersionRequest = {
        listingId: listingId,
        resourceVersion: resourceVersion,
      };

      const response = await this.computeClient.getAppCatalogListingResourceVersion(request);
      return {
        listingId: response.appCatalogListingResourceVersion.listingId,
        listingResourceVersion: response.appCatalogListingResourceVersion.listingResourceVersion,
        availableRegions: response.appCatalogListingResourceVersion.availableRegions,
        compatibleShapes: response.appCatalogListingResourceVersion.compatibleShapes,
        timePublished: response.appCatalogListingResourceVersion.timePublished,
      };
    } catch (error) {
      this.logger.error('Error fetching marketplace listing version:', error);
      throw error;
    }
  }

  /**
   * Get list of available shapes in a compartment
   * @param compartmentId - The OCID of the compartment
   */
  async listShapes(compartmentId: string) {
    try {
      const request: oci.core.requests.ListShapesRequest = {
        compartmentId: compartmentId,
      };

      const response = await this.computeClient.listShapes(request);
      
      const shapes = response.items.map(shape => ({
        shape: shape.shape,
        processorDescription: shape.processorDescription,
        ocpus: shape.ocpus,
        memoryInGBs: shape.memoryInGBs,
        networkingBandwidthInGbps: shape.networkingBandwidthInGbps,
        maxVnicAttachments: shape.maxVnicAttachments,
        gpus: shape.gpus,
        localDisks: shape.localDisks,
        localDisksTotalSizeInGBs: shape.localDisksTotalSizeInGBs,
      }));

      this.logger.log(`Retrieved ${shapes.length} shapes`);
      return shapes;
    } catch (error) {
      this.logger.error('Error fetching shapes:', error);
      throw error;
    }
  }

  /**
   * Get root compartment ID from tenancy
   */
  async getTenancyId(): Promise<string> {
    try {
      const tenancyId = await this.provider.getTenantId();
      return tenancyId;
    } catch (error) {
      this.logger.error('Error getting tenancy ID:', error);
      throw error;
    }
  }

  /**
   * Create a compartment for a user
   * @param name - Name of the compartment
   * @param description - Description of the compartment
   */
  async createCompartment(name: string, description: string) {
    try {
      const tenancyId = await this.getTenancyId();
      
      const createCompartmentDetails: oci.identity.models.CreateCompartmentDetails = {
        compartmentId: tenancyId,
        name: name,
        description: description,
      };

      const request: oci.identity.requests.CreateCompartmentRequest = {
        createCompartmentDetails: createCompartmentDetails,
      };

      const response = await this.identityClient.createCompartment(request);
      
      this.logger.log(`Created compartment: ${response.compartment.id}`);
      return {
        id: response.compartment.id,
        name: response.compartment.name,
        description: response.compartment.description,
        lifecycleState: response.compartment.lifecycleState,
        timeCreated: response.compartment.timeCreated,
      };
    } catch (error) {
      this.logger.error('Error creating compartment:', error);
      throw error;
    }
  }

  /**
   * Get compartment details by OCID
   * @param compartmentId - The OCID of the compartment
   */
  async getCompartment(compartmentId: string) {
    try {
      const request: oci.identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentId,
      };

      const response = await this.identityClient.getCompartment(request);
      
      return {
        id: response.compartment.id,
        name: response.compartment.name,
        description: response.compartment.description,
        lifecycleState: response.compartment.lifecycleState,
        timeCreated: response.compartment.timeCreated,
      };
    } catch (error) {
      this.logger.error(`Error getting compartment ${compartmentId}:`, error);
      throw error;
    }
  }

  /**
   * List compartments for the tenancy
   */
  async listCompartments() {
    try {
      const tenancyId = await this.getTenancyId();
      
      const request: oci.identity.requests.ListCompartmentsRequest = {
        compartmentId: tenancyId,
        compartmentIdInSubtree: true,
      };

      const response = await this.identityClient.listCompartments(request);
      
      const compartments = response.items.map(compartment => ({
        id: compartment.id,
        name: compartment.name,
        description: compartment.description,
        lifecycleState: compartment.lifecycleState,
        timeCreated: compartment.timeCreated,
      }));

      this.logger.log(`Retrieved ${compartments.length} compartments`);
      return compartments;
    } catch (error) {
      this.logger.error('Error listing compartments:', error);
      throw error;
    }
  }

  /**
   * Create a VCN (Virtual Cloud Network) in a compartment
   * @param compartmentId - The OCID of the compartment
   * @param displayName - Display name for the VCN
   * @param cidrBlock - CIDR block for the VCN (e.g., "10.0.0.0/16")
   * @param dnsLabel - Optional DNS label for the VCN
   */
  async createVcn(
    compartmentId: string,
    displayName: string,
    cidrBlock: string,
    dnsLabel?: string,
  ) {
    try {
      const createVcnDetails: oci.core.models.CreateVcnDetails = {
        compartmentId: compartmentId,
        displayName: displayName,
        cidrBlock: cidrBlock,
        dnsLabel: dnsLabel,
      };

      const request: oci.core.requests.CreateVcnRequest = {
        createVcnDetails: createVcnDetails,
      };

      const response = await this.virtualNetworkClient.createVcn(request);
      
      this.logger.log(`Created VCN: ${response.vcn.id}`);
      return {
        id: response.vcn.id,
        displayName: response.vcn.displayName,
        cidrBlock: response.vcn.cidrBlock,
        lifecycleState: response.vcn.lifecycleState,
        timeCreated: response.vcn.timeCreated,
        dnsLabel: response.vcn.dnsLabel,
        compartmentId: response.vcn.compartmentId,
      };
    } catch (error) {
      this.logger.error('Error creating VCN:', error);
      throw error;
    }
  }

  /**
   * Create an Internet Gateway for a VCN
   * @param compartmentId - The OCID of the compartment
   * @param vcnId - The OCID of the VCN
   * @param displayName - Display name for the Internet Gateway
   */
  async createInternetGateway(
    compartmentId: string,
    vcnId: string,
    displayName: string,
  ) {
    try {
      const createInternetGatewayDetails: oci.core.models.CreateInternetGatewayDetails = {
        compartmentId: compartmentId,
        vcnId: vcnId,
        displayName: displayName,
        isEnabled: true,
      };

      const request: oci.core.requests.CreateInternetGatewayRequest = {
        createInternetGatewayDetails: createInternetGatewayDetails,
      };

      const response = await this.virtualNetworkClient.createInternetGateway(request);
      
      this.logger.log(`Created Internet Gateway: ${response.internetGateway.id}`);
      return {
        id: response.internetGateway.id,
        displayName: response.internetGateway.displayName,
        vcnId: response.internetGateway.vcnId,
        isEnabled: response.internetGateway.isEnabled,
        lifecycleState: response.internetGateway.lifecycleState,
        timeCreated: response.internetGateway.timeCreated,
      };
    } catch (error) {
      this.logger.error('Error creating Internet Gateway:', error);
      throw error;
    }
  }

  /**
   * Update route table to add route to Internet Gateway
   * @param routeTableId - The OCID of the route table
   * @param internetGatewayId - The OCID of the Internet Gateway
   */
  async updateRouteTable(routeTableId: string, internetGatewayId: string) {
    try {
      const updateRouteTableDetails: oci.core.models.UpdateRouteTableDetails = {
        routeRules: [
          {
            destination: '0.0.0.0/0',
            destinationType: oci.core.models.RouteRule.DestinationType.CidrBlock,
            networkEntityId: internetGatewayId,
          },
        ],
      };

      const request: oci.core.requests.UpdateRouteTableRequest = {
        rtId: routeTableId,
        updateRouteTableDetails: updateRouteTableDetails,
      };

      const response = await this.virtualNetworkClient.updateRouteTable(request);
      
      this.logger.log(`Updated route table: ${response.routeTable.id}`);
      return {
        id: response.routeTable.id,
        displayName: response.routeTable.displayName,
        routeRules: response.routeTable.routeRules,
        lifecycleState: response.routeTable.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error updating route table:', error);
      throw error;
    }
  }

  /**
   * Update Security List to allow SSH, HTTP, and HTTPS access
   * @param securityListId - The OCID of the security list
   */
  async updateSecurityList(securityListId: string) {
    try {
      const updateSecurityListDetails: oci.core.models.UpdateSecurityListDetails = {
        ingressSecurityRules: [
          // SSH access (port 22)
          {
            source: '0.0.0.0/0',
            protocol: '6', // TCP
            isStateless: false,
            tcpOptions: {
              destinationPortRange: {
                min: 22,
                max: 22,
              },
            },
            description: 'SSH access',
          },
          // HTTP access (port 80)
          {
            source: '0.0.0.0/0',
            protocol: '6', // TCP
            isStateless: false,
            tcpOptions: {
              destinationPortRange: {
                min: 80,
                max: 80,
              },
            },
            description: 'HTTP access',
          },
          // HTTPS access (port 443)
          {
            source: '0.0.0.0/0',
            protocol: '6', // TCP
            isStateless: false,
            tcpOptions: {
              destinationPortRange: {
                min: 443,
                max: 443,
              },
            },
            description: 'HTTPS access',
          },
          // ICMP for ping
          {
            source: '0.0.0.0/0',
            protocol: '1', // ICMP
            isStateless: false,
            icmpOptions: {
              type: 3,
              code: 4,
            },
            description: 'ICMP Path MTU Discovery',
          },
          {
            source: '0.0.0.0/0',
            protocol: '1', // ICMP
            isStateless: false,
            icmpOptions: {
              type: 8, // Echo request (ping)
            },
            description: 'ICMP Echo Request',
          },
        ],
        egressSecurityRules: [
          // Allow all outbound traffic
          {
            destination: '0.0.0.0/0',
            protocol: 'all',
            isStateless: false,
            description: 'Allow all outbound traffic',
          },
        ],
      };

      const request: oci.core.requests.UpdateSecurityListRequest = {
        securityListId: securityListId,
        updateSecurityListDetails: updateSecurityListDetails,
      };

      const response = await this.virtualNetworkClient.updateSecurityList(request);
      
      this.logger.log(`Updated security list: ${response.securityList.id}`);
      return {
        id: response.securityList.id,
        displayName: response.securityList.displayName,
        ingressSecurityRules: response.securityList.ingressSecurityRules,
        egressSecurityRules: response.securityList.egressSecurityRules,
        lifecycleState: response.securityList.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error updating security list:', error);
      throw error;
    }
  }

  /**
   * Get Security List details
   * @param securityListId - The OCID of the security list
   */
  async getSecurityList(securityListId: string) {
    try {
      const request: oci.core.requests.GetSecurityListRequest = {
        securityListId: securityListId,
      };

      const response = await this.virtualNetworkClient.getSecurityList(request);
      
      return {
        id: response.securityList.id,
        displayName: response.securityList.displayName,
        ingressSecurityRules: response.securityList.ingressSecurityRules || [],
        egressSecurityRules: response.securityList.egressSecurityRules || [],
        lifecycleState: response.securityList.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error getting security list:', error);
      throw error;
    }
  }

  /**
   * Add RDP (port 3389) rule to Security List if not exists
   * @param securityListId - The OCID of the security list
   */
  async ensureRdpAccessEnabled(securityListId: string): Promise<boolean> {
    try {
      this.logger.log(`🔍 Checking if RDP port 3389 is open in security list: ${securityListId}`);
      
      // Get current security list
      const securityList = await this.getSecurityList(securityListId);
      
      // Check if RDP rule already exists
      const hasRdpRule = securityList.ingressSecurityRules.some((rule: any) => {
        return (
          rule.protocol === '6' && // TCP
          rule.tcpOptions?.destinationPortRange?.min === 3389 &&
          rule.tcpOptions?.destinationPortRange?.max === 3389
        );
      });

      if (hasRdpRule) {
        this.logger.log('✅ RDP port 3389 is already open');
        return true;
      }

      this.logger.log('⚠️  RDP port 3389 is not open, adding rule...');

      // Add RDP rule to existing rules
      const newIngressRules = [
        ...securityList.ingressSecurityRules,
        {
          source: '0.0.0.0/0',
          protocol: '6', // TCP
          isStateless: false,
          tcpOptions: {
            destinationPortRange: {
              min: 3389,
              max: 3389,
            },
          },
          description: 'RDP access for Windows VMs',
        },
      ];

      const updateSecurityListDetails: oci.core.models.UpdateSecurityListDetails = {
        ingressSecurityRules: newIngressRules,
        egressSecurityRules: securityList.egressSecurityRules,
      };

      const request: oci.core.requests.UpdateSecurityListRequest = {
        securityListId: securityListId,
        updateSecurityListDetails: updateSecurityListDetails,
      };

      await this.virtualNetworkClient.updateSecurityList(request);
      
      this.logger.log('✅ RDP port 3389 opened successfully');
      return true;
    } catch (error) {
      this.logger.error('❌ Error ensuring RDP access:', error);
      throw error;
    }
  }

  /**
   * Create a subnet in a VCN
   * @param compartmentId - The OCID of the compartment
   * @param vcnId - The OCID of the VCN
   * @param displayName - Display name for the subnet
   * @param cidrBlock - CIDR block for the subnet (e.g., "10.0.1.0/24")
   * @param availabilityDomain - Availability domain for the subnet
   * @param dnsLabel - Optional DNS label for the subnet
   */
  async createSubnet(
    compartmentId: string,
    vcnId: string,
    displayName: string,
    cidrBlock: string,
    availabilityDomain: string,
    dnsLabel?: string,
  ) {
    try {
      const createSubnetDetails: oci.core.models.CreateSubnetDetails = {
        compartmentId: compartmentId,
        vcnId: vcnId,
        displayName: displayName,
        cidrBlock: cidrBlock,
        availabilityDomain: availabilityDomain,
        dnsLabel: dnsLabel,
        prohibitPublicIpOnVnic: false, // Allow public IPs
      };

      const request: oci.core.requests.CreateSubnetRequest = {
        createSubnetDetails: createSubnetDetails,
      };

      const response = await this.virtualNetworkClient.createSubnet(request);
      
      this.logger.log(`Created subnet: ${response.subnet.id}`);
      return {
        id: response.subnet.id,
        displayName: response.subnet.displayName,
        cidrBlock: response.subnet.cidrBlock,
        availabilityDomain: response.subnet.availabilityDomain,
        vcnId: response.subnet.vcnId,
        lifecycleState: response.subnet.lifecycleState,
        timeCreated: response.subnet.timeCreated,
        dnsLabel: response.subnet.dnsLabel,
      };
    } catch (error) {
      this.logger.error('Error creating subnet:', error);
      throw error;
    }
  }

  /**
   * Get VCN details including default route table
   * @param vcnId - The OCID of the VCN
   */
  async getVcn(vcnId: string) {
    try {
      const request: oci.core.requests.GetVcnRequest = {
        vcnId: vcnId,
      };

      const response = await this.virtualNetworkClient.getVcn(request);
      
      return {
        id: response.vcn.id,
        displayName: response.vcn.displayName,
        cidrBlock: response.vcn.cidrBlock,
        defaultRouteTableId: response.vcn.defaultRouteTableId,
        defaultSecurityListId: response.vcn.defaultSecurityListId,
        lifecycleState: response.vcn.lifecycleState,
        timeCreated: response.vcn.timeCreated,
      };
    } catch (error) {
      this.logger.error('Error getting VCN:', error);
      throw error;
    }
  }

  /**
   * List availability domains in a compartment
   * @param compartmentId - The OCID of the compartment
   */
  async listAvailabilityDomains(compartmentId: string) {
    try {
      const request: oci.identity.requests.ListAvailabilityDomainsRequest = {
        compartmentId: compartmentId,
      };

      const response = await this.identityClient.listAvailabilityDomains(request);
      
      const availabilityDomains = response.items.map(ad => ({
        name: ad.name,
        id: ad.id,
        compartmentId: ad.compartmentId,
      }));

      this.logger.log(`Retrieved ${availabilityDomains.length} availability domains`);
      return availabilityDomains;
    } catch (error) {
      this.logger.error('Error listing availability domains:', error);
      throw error;
    }
  }

  /**
   * Launch a compute instance (VM)
   * @param compartmentId - The OCID of the compartment
   * @param displayName - Display name for the instance
   * @param availabilityDomain - Availability domain for the instance
   * @param subnetId - The OCID of the subnet
   * @param imageId - The OCID of the image
   * @param shape - The shape of the instance (e.g., "VM.Standard.E4.Flex")
   * @param sshPublicKeys - Array of SSH public keys to inject
   * @param ocpus - Number of OCPUs (for flexible shapes)
   * @param memoryInGBs - Amount of memory in GBs (for flexible shapes)
   * @param bootVolumeSizeInGBs - Size of boot volume in GBs
   */
  async launchInstance(
    compartmentId: string,
    displayName: string,
    availabilityDomain: string,
    subnetId: string,
    imageId: string,
    shape: string,
    sshPublicKeys: string[],
    ocpus?: number,
    memoryInGBs?: number,
    bootVolumeSizeInGBs?: number,
  ) {
    try {
      // Prepare shape config for flexible shapes
      const shapeConfig = shape.includes('Flex') ? {
        ocpus: ocpus || 1,
        memoryInGBs: memoryInGBs || 16,
      } : undefined;

      // Prepare source details
      const sourceDetails: oci.core.models.InstanceSourceViaImageDetails = {
        sourceType: 'image',
        imageId: imageId,
        bootVolumeSizeInGBs: bootVolumeSizeInGBs || 50,
      };

      // Prepare metadata with SSH keys
      const metadata = {
        ssh_authorized_keys: sshPublicKeys.join('\n'),
      };

      const launchInstanceDetails: oci.core.models.LaunchInstanceDetails = {
        compartmentId: compartmentId,
        displayName: displayName,
        availabilityDomain: availabilityDomain,
        shape: shape,
        shapeConfig: shapeConfig,
        sourceDetails: sourceDetails,
        createVnicDetails: {
          subnetId: subnetId,
          assignPublicIp: true,
        },
        metadata: metadata,
      };

      const request: oci.core.requests.LaunchInstanceRequest = {
        launchInstanceDetails: launchInstanceDetails,
      };

      const response = await this.computeClient.launchInstance(request);
      
      this.logger.log(`Launched instance: ${response.instance.id}`);
      return {
        id: response.instance.id,
        displayName: response.instance.displayName,
        availabilityDomain: response.instance.availabilityDomain,
        compartmentId: response.instance.compartmentId,
        shape: response.instance.shape,
        lifecycleState: response.instance.lifecycleState,
        timeCreated: response.instance.timeCreated,
        imageId: response.instance.imageId,
      };
    } catch (error) {
      this.logger.error('Error launching instance:', error);
      throw error;
    }
  }

  /**
   * Get instance details including public IP
   * @param instanceId - The OCID of the instance
   */
  async getInstance(instanceId: string) {
    try {
      const request: oci.core.requests.GetInstanceRequest = {
        instanceId: instanceId,
      };

      const response = await this.computeClient.getInstance(request);
      
      return {
        id: response.instance.id,
        displayName: response.instance.displayName,
        availabilityDomain: response.instance.availabilityDomain,
        compartmentId: response.instance.compartmentId,
        shape: response.instance.shape,
        lifecycleState: response.instance.lifecycleState,
        timeCreated: response.instance.timeCreated,
        imageId: response.instance.imageId,
        region: response.instance.region,
      };
    } catch (error) {
      this.logger.error('Error getting instance:', error);
      throw error;
    }
  }

  /**
   * Get VNIC attachments for an instance
   * @param compartmentId - The OCID of the compartment
   * @param instanceId - The OCID of the instance
   */
  async getVnicAttachments(compartmentId: string, instanceId: string) {
    try {
      const request: oci.core.requests.ListVnicAttachmentsRequest = {
        compartmentId: compartmentId,
        instanceId: instanceId,
      };

      const response = await this.computeClient.listVnicAttachments(request);
      
      return response.items.map(attachment => ({
        id: attachment.id,
        vnicId: attachment.vnicId,
        lifecycleState: attachment.lifecycleState,
      }));
    } catch (error) {
      this.logger.error('Error getting VNIC attachments:', error);
      throw error;
    }
  }

  /**
   * Get VNIC details including public IP
   * @param vnicId - The OCID of the VNIC
   */
  async getVnic(vnicId: string) {
    try {
      const request: oci.core.requests.GetVnicRequest = {
        vnicId: vnicId,
      };

      const response = await this.virtualNetworkClient.getVnic(request);
      
      return {
        id: response.vnic.id,
        displayName: response.vnic.displayName,
        privateIp: response.vnic.privateIp,
        publicIp: response.vnic.publicIp,
        subnetId: response.vnic.subnetId,
        lifecycleState: response.vnic.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error getting VNIC:', error);
      throw error;
    }
  }

  /**
   * Get instance public IP address
   * @param compartmentId - The OCID of the compartment
   * @param instanceId - The OCID of the instance
   */
  async getInstancePublicIp(compartmentId: string, instanceId: string): Promise<string | null> {
    try {
      // Get VNIC attachments
      const vnicAttachments = await this.getVnicAttachments(compartmentId, instanceId);
      
      if (vnicAttachments.length === 0) {
        return null;
      }

      // Get primary VNIC
      const primaryVnicId = vnicAttachments[0].vnicId;
      if (!primaryVnicId) {
        return null;
      }
      
      const vnic = await this.getVnic(primaryVnicId);
      
      return vnic.publicIp || null;
    } catch (error) {
      this.logger.error('Error getting instance public IP:', error);
      throw error;
    }
  }

  /**
   * Stop an instance (graceful shutdown)
   * @param instanceId - The OCID of the instance
   */
  async stopInstance(instanceId: string) {
    try {
      const request: oci.core.requests.InstanceActionRequest = {
        instanceId: instanceId,
        action: 'STOP',
      };

      const response = await this.computeClient.instanceAction(request);
      
      this.logger.log(`Stopping instance: ${instanceId}`);
      return {
        id: response.instance.id,
        lifecycleState: response.instance.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error stopping instance:', error);
      throw error;
    }
  }

  /**
   * Start an instance
   * @param instanceId - The OCID of the instance
   */
  async startInstance(instanceId: string) {
    try {
      const request: oci.core.requests.InstanceActionRequest = {
        instanceId: instanceId,
        action: 'START',
      };

      const response = await this.computeClient.instanceAction(request);
      
      this.logger.log(`Starting instance: ${instanceId}`);
      return {
        id: response.instance.id,
        lifecycleState: response.instance.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error starting instance:', error);
      throw error;
    }
  }

  /**
   * Restart an instance (soft reboot)
   * @param instanceId - The OCID of the instance
   */
  async restartInstance(instanceId: string) {
    try {
      const request: oci.core.requests.InstanceActionRequest = {
        instanceId: instanceId,
        action: 'SOFTRESET',
      };

      const response = await this.computeClient.instanceAction(request);
      
      this.logger.log(`Restarting instance: ${instanceId}`);
      return {
        id: response.instance.id,
        lifecycleState: response.instance.lifecycleState,
      };
    } catch (error) {
      this.logger.error('Error restarting instance:', error);
      throw error;
    }
  }

  /**
   * Terminate an instance (permanently delete)
   * @param instanceId - The OCID of the instance
   * @param preserveBootVolume - Whether to preserve the boot volume
   */
  async terminateInstance(instanceId: string, preserveBootVolume: boolean = false) {
    try {
      const request: oci.core.requests.TerminateInstanceRequest = {
        instanceId: instanceId,
        preserveBootVolume: preserveBootVolume,
      };

      await this.computeClient.terminateInstance(request);
      
      this.logger.log(`Terminating instance: ${instanceId}`);
      return {
        id: instanceId,
        status: 'TERMINATING',
      };
    } catch (error) {
      this.logger.error('Error terminating instance:', error);
      throw error;
    }
  }

  /**
   * Get Windows instance initial credentials (username and password)
   * This method retrieves the auto-generated Windows Administrator password from OCI
   * @param instanceId - The OCID of the Windows instance
   * @returns Object containing username and password, or null if not available
   */
  async getWindowsInitialCredentials(instanceId: string): Promise<{ username: string; password: string } | null> {
    try {
      const request: oci.core.requests.GetWindowsInstanceInitialCredentialsRequest = {
        instanceId: instanceId,
      };

      const response = await this.computeClient.getWindowsInstanceInitialCredentials(request);
      
      this.logger.log(`Retrieved Windows credentials for instance: ${instanceId}`);
      return {
        username: response.instanceCredentials.username,
        password: response.instanceCredentials.password,
      };
    } catch (error) {
      // If error code is 404 or credentials not available, return null
      if (error.statusCode === 404 || error.message?.includes('not available')) {
        this.logger.warn(`Windows credentials not available for instance ${instanceId}: ${error.message}`);
        return null;
      }
      this.logger.error('Error getting Windows credentials:', error);
      throw error;
    }
  }

  /**
   * List instances in a compartment
   * @param compartmentId - The OCID of the compartment
   */
  async listInstances(compartmentId: string) {
    try {
      const request: oci.core.requests.ListInstancesRequest = {
        compartmentId: compartmentId,
      };

      const response = await this.computeClient.listInstances(request);
      
      const instances = response.items.map(instance => ({
        id: instance.id,
        displayName: instance.displayName,
        availabilityDomain: instance.availabilityDomain,
        compartmentId: instance.compartmentId,
        shape: instance.shape,
        lifecycleState: instance.lifecycleState,
        timeCreated: instance.timeCreated,
        imageId: instance.imageId,
      }));

      this.logger.log(`Retrieved ${instances.length} instances`);
      return instances;
    } catch (error) {
      this.logger.error('Error listing instances:', error);
      throw error;
    }
  }

  /**
   * List VCNs in a compartment
   * @param compartmentId - The OCID of the compartment
   */
  async listVcns(compartmentId: string) {
    try {
      const request: oci.core.requests.ListVcnsRequest = {
        compartmentId: compartmentId,
      };

      const response = await this.virtualNetworkClient.listVcns(request);
      
      const vcns = response.items.map(vcn => ({
        id: vcn.id,
        displayName: vcn.displayName,
        cidrBlock: vcn.cidrBlock,
        lifecycleState: vcn.lifecycleState,
        timeCreated: vcn.timeCreated,
      }));

      this.logger.log(`Retrieved ${vcns.length} VCNs`);
      return vcns;
    } catch (error) {
      this.logger.error('Error listing VCNs:', error);
      throw error;
    }
  }

  /**
   * List subnets in a VCN
   * @param compartmentId - The OCID of the compartment
   * @param vcnId - The OCID of the VCN
   */
  async listSubnets(compartmentId: string, vcnId: string) {
    try {
      const request: oci.core.requests.ListSubnetsRequest = {
        compartmentId: compartmentId,
        vcnId: vcnId,
      };

      const response = await this.virtualNetworkClient.listSubnets(request);
      return response.items;
    } catch (error) {
      this.logger.error('Error listing subnets:', error);
      throw error;
    }
  }

  /**
   * Delete a subnet
   * @param subnetId - The OCID of the subnet
   */
  async deleteSubnet(subnetId: string) {
    try {
      const request: oci.core.requests.DeleteSubnetRequest = {
        subnetId: subnetId,
      };

      await this.virtualNetworkClient.deleteSubnet(request);
      this.logger.log(`Deleted subnet: ${subnetId}`);
    } catch (error) {
      this.logger.error('Error deleting subnet:', error);
      throw error;
    }
  }

  /**
   * List Internet Gateways in a compartment
   * @param compartmentId - The OCID of the compartment
   * @param vcnId - The OCID of the VCN
   */
  async listInternetGateways(compartmentId: string, vcnId: string) {
    try {
      const request: oci.core.requests.ListInternetGatewaysRequest = {
        compartmentId: compartmentId,
        vcnId: vcnId,
      };

      const response = await this.virtualNetworkClient.listInternetGateways(request);
      return response.items;
    } catch (error) {
      this.logger.error('Error listing internet gateways:', error);
      throw error;
    }
  }

  /**
   * List Route Tables in a compartment
   * @param compartmentId - The OCID of the compartment
   * @param vcnId - The OCID of the VCN
   */
  async listRouteTables(compartmentId: string, vcnId: string) {
    try {
      const request: oci.core.requests.ListRouteTablesRequest = {
        compartmentId: compartmentId,
        vcnId: vcnId,
      };

      const response = await this.virtualNetworkClient.listRouteTables(request);
      return response.items;
    } catch (error) {
      this.logger.error('Error listing route tables:', error);
      throw error;
    }
  }

  /**
   * Clear all route rules from a route table
   * @param routeTableId - The OCID of the route table
   */
  async clearRouteTable(routeTableId: string) {
    try {
      const updateRouteTableDetails: oci.core.models.UpdateRouteTableDetails = {
        routeRules: [], // Empty array to clear all rules
      };

      const request: oci.core.requests.UpdateRouteTableRequest = {
        rtId: routeTableId,
        updateRouteTableDetails: updateRouteTableDetails,
      };

      await this.virtualNetworkClient.updateRouteTable(request);
      this.logger.log(`Cleared route table: ${routeTableId}`);
    } catch (error) {
      this.logger.error('Error clearing route table:', error);
      throw error;
    }
  }

  /**
   * Delete an Internet Gateway
   * @param igId - The OCID of the Internet Gateway
   */
  async deleteInternetGateway(igId: string) {
    try {
      const request: oci.core.requests.DeleteInternetGatewayRequest = {
        igId: igId,
      };

      await this.virtualNetworkClient.deleteInternetGateway(request);
      this.logger.log(`Deleted Internet Gateway: ${igId}`);
    } catch (error) {
      this.logger.error('Error deleting internet gateway:', error);
      throw error;
    }
  }

  /**
   * Delete a VCN
   * @param vcnId - The OCID of the VCN
   */
  async deleteVcn(vcnId: string) {
    try {
      const request: oci.core.requests.DeleteVcnRequest = {
        vcnId: vcnId,
      };

      await this.virtualNetworkClient.deleteVcn(request);
      this.logger.log(`Deleted VCN: ${vcnId}`);
    } catch (error) {
      this.logger.error('Error deleting VCN:', error);
      throw error;
    }
  }

  /**
   * Delete a compartment
   * @param compartmentId - The OCID of the compartment
   */
  async deleteCompartment(compartmentId: string) {
    try {
      const request: oci.identity.requests.DeleteCompartmentRequest = {
        compartmentId: compartmentId,
      };

      await this.identityClient.deleteCompartment(request);
      this.logger.log(`Deleted compartment: ${compartmentId}`);
    } catch (error) {
      this.logger.error('Error deleting compartment:', error);
      throw error;
    }
  }

  /**
   * Find compartment by name
   * @param compartmentName - The name of the compartment
   */
  async findCompartmentByName(compartmentName: string) {
    try {
      const tenancyId = await this.getTenancyId();
      const request: oci.identity.requests.ListCompartmentsRequest = {
        compartmentId: tenancyId,
        limit: 1000,
      };

      const response = await this.identityClient.listCompartments(request);
      
      const compartment = response.items.find(
        c => c.name === compartmentName && c.lifecycleState === 'ACTIVE'
      );

      if (!compartment) {
        throw new Error(`Compartment with name "${compartmentName}" not found`);
      }

      return {
        id: compartment.id,
        name: compartment.name,
        description: compartment.description,
        lifecycleState: compartment.lifecycleState,
        timeCreated: compartment.timeCreated,
      };
    } catch (error) {
      this.logger.error('Error finding compartment by name:', error);
      throw error;
    }
  }

  /**
   * Delete compartment and all its resources
   * @param compartmentName - The name of the compartment to delete
   */
  async deleteCompartmentWithResources(compartmentName: string) {
    try {
      this.logger.log(`Starting deletion of compartment: ${compartmentName}`);
      
      // Step 1: Find compartment by name
      const compartment = await this.findCompartmentByName(compartmentName);
      const compartmentId = compartment.id;
      
      this.logger.log(`Found compartment ID: ${compartmentId}`);
      
      // Step 2: Terminate all instances
      this.logger.log('Terminating all instances...');
      const instances = await this.listInstances(compartmentId);
      
      for (const instance of instances) {
        if (instance.lifecycleState !== 'TERMINATED' && instance.lifecycleState !== 'TERMINATING') {
          this.logger.log(`Terminating instance: ${instance.displayName} (${instance.id})`);
          await this.terminateInstance(instance.id, false);
        }
      }
      
      // Step 3: Wait for instances to terminate
      if (instances.length > 0) {
        this.logger.log('Waiting for instances to terminate...');
        await this.sleep(30000); // Wait 30 seconds
        
        // Check if instances are terminated
        let maxRetries = 10;
        while (maxRetries > 0) {
          const currentInstances = await this.listInstances(compartmentId);
          const runningInstances = currentInstances.filter(
            i => i.lifecycleState !== 'TERMINATED'
          );
          
          if (runningInstances.length === 0) {
            this.logger.log('All instances terminated');
            break;
          }
          
          this.logger.log(`Waiting for ${runningInstances.length} instances to terminate...`);
          await this.sleep(10000); // Wait 10 seconds
          maxRetries--;
        }
      }
      
      // Step 4: Delete VCN resources
      this.logger.log('Deleting VCN resources...');
      const vcns = await this.listVcns(compartmentId);
      
      for (const vcn of vcns) {
        this.logger.log(`Processing VCN: ${vcn.displayName} (${vcn.id})`);
        
        // Step 4.1: Delete subnets first
        const subnets = await this.listSubnets(compartmentId, vcn.id);
        for (const subnet of subnets) {
          this.logger.log(`Deleting subnet: ${subnet.displayName}`);
          await this.deleteSubnet(subnet.id);
        }
        
        // Wait for subnets to be deleted
        await this.sleep(5000);
        
        // Step 4.2: Clear route tables (remove references to Internet Gateways)
        this.logger.log('Clearing route tables...');
        const routeTables = await this.listRouteTables(compartmentId, vcn.id);
        for (const rt of routeTables) {
          this.logger.log(`Clearing route table: ${rt.displayName}`);
          await this.clearRouteTable(rt.id);
        }
        
        // Wait for route tables to be updated
        await this.sleep(3000);
        
        // Step 4.3: Now delete internet gateways (no longer referenced)
        const igws = await this.listInternetGateways(compartmentId, vcn.id);
        for (const igw of igws) {
          this.logger.log(`Deleting Internet Gateway: ${igw.displayName}`);
          await this.deleteInternetGateway(igw.id);
        }
        
        // Wait for IGWs to be deleted
        await this.sleep(5000);
        
        // Step 4.4: Delete VCN
        this.logger.log(`Deleting VCN: ${vcn.displayName}`);
        await this.deleteVcn(vcn.id);
      }
      
      // Step 5: Wait before deleting compartment
      this.logger.log('Waiting before deleting compartment...');
      await this.sleep(10000);
      
      // Step 6: Delete compartment
      this.logger.log(`Deleting compartment: ${compartmentName}`);
      await this.deleteCompartment(compartmentId);
      
      // Step 7: Clean up database records
      this.logger.log('Cleaning up database records...');
      await this.cleanupDatabaseRecords(compartmentId, instances.map(i => i.id));
      
      this.logger.log(`Successfully deleted compartment: ${compartmentName}`);
      
      return {
        success: true,
        compartmentName: compartmentName,
        compartmentId: compartmentId,
        deletedInstances: instances.length,
        deletedVcns: vcns.length,
      };
    } catch (error) {
      this.logger.error(`Error deleting compartment ${compartmentName}:`, error);
      throw error;
    }
  }

  /**
   * Clean up database records after OCI compartment deletion
   */
  private async cleanupDatabaseRecords(compartmentId: string, instanceIds: string[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get vm_instance records to log actions
      const vmInstances = await queryRunner.query(
        `SELECT id, user_id, instance_name FROM oracle.vm_instances WHERE compartment_id = $1`,
        [compartmentId]
      );

      // Insert action logs for deleted VMs
      for (const vm of vmInstances) {
        await queryRunner.query(
          `INSERT INTO oracle.vm_actions_log (vm_instance_id, user_id, action, description, created_at) 
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            vm.id,
            vm.user_id,
            'COMPARTMENT_DELETED',
            `VM ${vm.instance_name} deleted due to compartment deletion`
          ]
        );
      }

      // Delete vm_instances
      await queryRunner.query(
        `DELETE FROM oracle.vm_instances WHERE compartment_id = $1`,
        [compartmentId]
      );
      this.logger.log(`Deleted ${vmInstances.length} VM instance records`);

      // Delete vcn_resources
      const deletedVcns = await queryRunner.query(
        `DELETE FROM oracle.vcn_resources WHERE compartment_id = $1 RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`Deleted ${deletedVcns.length} VCN resource records`);

      // Delete user_compartments
      const deletedCompartments = await queryRunner.query(
        `DELETE FROM oracle.user_compartments WHERE compartment_ocid = $1 RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`Deleted ${deletedCompartments.length} user compartment records`);

      await queryRunner.commitTransaction();
      this.logger.log('Database cleanup completed successfully');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error cleaning up database records:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Helper: sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring client
   */
  private getMonitoringClient() {
    return new oci.monitoring.MonitoringClient({
      authenticationDetailsProvider: this.provider,
    });
  }

  /**
   * Get compartment ID from instance ID
   */
  async getCompartmentIdFromInstanceId(instanceId: string): Promise<string> {
    try {
      const instance = await this.computeClient.getInstance({ instanceId });
      return instance.instance.compartmentId;
    } catch (error) {
      this.logger.error(
        `Error getting compartment ID from instance ${instanceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get instance metrics from OCI Monitoring
   */
  async getInstanceMetrics(
    instanceId: string,
    metricName: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    try {
      const monitoring = this.getMonitoringClient();
      const compartmentId = await this.getCompartmentIdFromInstanceId(instanceId);

      const summarizeMetricsDataRequest: oci.monitoring.requests.SummarizeMetricsDataRequest = {
        compartmentId: compartmentId,
        summarizeMetricsDataDetails: {
          namespace: 'oci_computeagent',
          query: `${metricName}[1m]{resourceId = "${instanceId}"}.mean()`,
          startTime: startTime,
          endTime: endTime,
          resolution: '1m',
        },
      };

      const response = await monitoring.summarizeMetricsData(
        summarizeMetricsDataRequest,
      );

      return response.items || [];
    } catch (error) {
      this.logger.error(
        `Error getting metrics for instance ${instanceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get CPU utilization metrics
   */
  async getCpuUtilization(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'CpuUtilization',
      startTime,
      endTime,
    );
  }

  /**
   * Get memory utilization metrics
   */
  async getMemoryUtilization(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'MemoryUtilization',
      startTime,
      endTime,
    );
  }

  /**
   * Get network bytes in metrics
   */
  async getNetworkBytesIn(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'NetworksBytesIn',
      startTime,
      endTime,
    );
  }

  /**
   * Get network bytes out metrics
   */
  async getNetworkBytesOut(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'NetworksBytesOut',
      startTime,
      endTime,
    );
  }

  /**
   * Get disk read bytes metrics
   */
  async getDiskReadBytes(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'DiskBytesRead',
      startTime,
      endTime,
    );
  }

  /**
   * Get disk write bytes metrics
   */
  async getDiskWriteBytes(
    instanceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    return this.getInstanceMetrics(
      instanceId,
      'DiskBytesWritten',
      startTime,
      endTime,
    );
  }
}
