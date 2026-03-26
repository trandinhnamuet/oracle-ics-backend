import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as oci from 'oci-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

@Injectable()
export class OciService {
  private readonly logger = new Logger(OciService.name);
  private computeClient: oci.core.ComputeClient;
  private identityClient: oci.identity.IdentityClient;
  private virtualNetworkClient: oci.core.VirtualNetworkClient;
  private monitoringClient: any;
  private computeInstanceAgentClient: oci.computeinstanceagent.ComputeInstanceAgentClient;
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

      // Initialize Monitoring Client
      try {
        // monitoring client may be under oci.monitoring.MonitoringClient
        // cast to any to avoid strict typing issues with older SDK typings
        this.monitoringClient = new (oci as any).monitoring.MonitoringClient({
          authenticationDetailsProvider: this.provider,
        });
      } catch (err) {
        // If monitoring client is not available, log and keep undefined
        this.logger.warn('OCI Monitoring client not available: ' + err?.message);
        this.monitoringClient = undefined;
      }

      // Initialize Compute Instance Agent Client (for Run Command)
      this.computeInstanceAgentClient = new oci.computeinstanceagent.ComputeInstanceAgentClient({
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
    } catch (error: any) {
      // If compartment already exists (409), find and reuse the existing one
      if (error?.statusCode === 409 || error?.serviceCode === 'CompartmentAlreadyExists') {
        this.logger.warn(`Compartment '${name}' already exists in OCI. Fetching existing compartment...`);
        try {
          const tenancyId = await this.getTenancyId();
          const listRequest: oci.identity.requests.ListCompartmentsRequest = {
            compartmentId: tenancyId,
            name: name,
          };
          const listResponse = await this.identityClient.listCompartments(listRequest);
          const existing = listResponse.items.find(c => c.name === name);
          if (existing) {
            this.logger.log(`Reusing existing compartment: ${existing.id}`);
            return {
              id: existing.id,
              name: existing.name,
              description: existing.description,
              lifecycleState: existing.lifecycleState,
              timeCreated: existing.timeCreated,
            };
          }
        } catch (listError) {
          this.logger.error('Error listing compartments to find existing one:', listError);
        }
      }
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
   * Add SSH (port 22) rule to Security List if not exists
   */
  async ensureSshAccessEnabled(securityListId: string): Promise<void> {
    try {
      this.logger.log(`🔍 Checking if SSH port 22 is open in security list: ${securityListId}`);

      const securityList = await this.getSecurityList(securityListId);

      const hasSshRule = securityList.ingressSecurityRules.some((rule: any) =>
        rule.protocol === '6' &&
        rule.tcpOptions?.destinationPortRange?.min === 22 &&
        rule.tcpOptions?.destinationPortRange?.max === 22,
      );

      if (hasSshRule) {
        this.logger.log('✅ SSH port 22 is already open');
        return;
      }

      this.logger.log('⚠️  SSH port 22 is not open, adding rule...');

      const newIngressRules = [
        ...securityList.ingressSecurityRules,
        {
          source: '0.0.0.0/0',
          protocol: '6',
          isStateless: false,
          tcpOptions: {
            destinationPortRange: { min: 22, max: 22 },
          },
          description: 'SSH access for admin operations',
        },
      ];

      await this.virtualNetworkClient.updateSecurityList({
        securityListId,
        updateSecurityListDetails: {
          ingressSecurityRules: newIngressRules,
          egressSecurityRules: securityList.egressSecurityRules,
        },
      });

      this.logger.log('✅ SSH port 22 opened successfully in security list');
    } catch (error) {
      this.logger.error('❌ Error ensuring SSH access:', error);
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

      // Check if this is a Windows image BEFORE preparing metadata
      // This is critical to avoid sending cloud-init config to Windows VMs
      let isWindowsImage = false;
      try {
        const imageDetails = await this.getImage(imageId);
        isWindowsImage = imageDetails?.operatingSystem?.toLowerCase().includes('windows') || false;
        this.logger.log(`🔍 Image OS detected: ${imageDetails?.operatingSystem || 'Unknown'} (isWindows: ${isWindowsImage})`);
      } catch (error) {
        this.logger.warn(`⚠️  Could not detect image OS type: ${error.message}`);
        // Fallback: check imageId string
        isWindowsImage = imageId.toLowerCase().includes('windows') || imageId.toLowerCase().includes('win-server');
        this.logger.log(`🔍 Fallback detection from imageId (isWindows: ${isWindowsImage})`);
      }

      // Prepare cloud-init user-data ONLY for Linux VMs
      // Windows VMs should NOT receive cloud-init config as it may interfere with 
      // Cloudbase-Init and break password authentication
      const cloudInitConfig = isWindowsImage ? null : `#cloud-config
users:
  - default
  - name: opc
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

  - name: ubuntu
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

  - name: root
    ssh_authorized_keys:
${sshPublicKeys.map(key => `      - ${key}`).join('\n')}

# Security settings
ssh_pwauth: false
disable_root: false

# Essential packages
packages:
  - vim
  - curl
  - wget
  - git
  - net-tools

# First boot commands to ensure sudo works and open firewall ports
runcmd:
  - echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
  - echo "ubuntu ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/90-cloud-init-users
  - echo "root ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/90-cloud-init-users
  - chmod 0440 /etc/sudoers.d/90-cloud-init-users
  - systemctl restart sshd
  # Open firewall ports for web traffic (HTTP/HTTPS)
  - |
    if command -v firewall-cmd &> /dev/null; then
      # Oracle Linux / CentOS / RHEL with firewalld
      firewall-cmd --permanent --add-service=http
      firewall-cmd --permanent --add-service=https
      firewall-cmd --permanent --add-port=80/tcp
      firewall-cmd --permanent --add-port=443/tcp
      firewall-cmd --reload
      echo "✅ Firewalld: Opened ports 80, 443"
    elif command -v ufw &> /dev/null; then
      # Ubuntu with ufw - disable first to clear rules
      ufw --force disable
      ufw --force reset
      ufw default deny incoming
      ufw default allow outgoing
      ufw allow 22/tcp
      ufw allow 80/tcp
      ufw allow 443/tcp
      ufw --force enable
      echo "✅ UFW: Reset and opened ports 22, 80, 443"
    elif command -v iptables &> /dev/null; then
      # Fallback to iptables - clear existing rules first
      iptables -F
      iptables -X
      iptables -t nat -F
      iptables -t nat -X
      iptables -t mangle -F
      iptables -t mangle -X
      iptables -P INPUT ACCEPT
      iptables -P FORWARD ACCEPT
      iptables -P OUTPUT ACCEPT
      # Add new rules
      iptables -A INPUT -i lo -j ACCEPT
      iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
      iptables -A INPUT -p tcp --dport 22 -j ACCEPT
      iptables -A INPUT -p tcp --dport 80 -j ACCEPT
      iptables -A INPUT -p tcp --dport 443 -j ACCEPT
      iptables -A INPUT -j DROP
      # Save iptables rules
      if command -v iptables-save &> /dev/null; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        service iptables save 2>/dev/null || true
      fi
      echo "✅ IPTables: Cleared and opened ports 22, 80, 443"
    fi
  - echo "✅ Cloud-init completed - Firewall configured for web traffic"
`;

      // Prepare metadata
      // For Windows VMs: Send ssh_authorized_keys + a cloudbase-init PowerShell user_data
      //                  that installs/enables OpenSSH Server. This allows credential-less
      //                  password reset via SSH admin key (see runWindowsPasswordReset).
      // For Linux VMs: Set both ssh_authorized_keys and full cloud-init user_data.
      const metadata: any = {
        ssh_authorized_keys: sshPublicKeys.join('\n'),
      };

      if (!isWindowsImage && cloudInitConfig) {
        // Linux: full cloud-init config
        metadata.user_data = Buffer.from(cloudInitConfig).toString('base64');
        this.logger.log(`🐧 Linux VM: Sending SSH keys + cloud-init config`);
        this.logger.log(`📝 Cloud-init user_data configured (${cloudInitConfig!.length} chars, base64: ${metadata.user_data.length} chars)`);
      } else if (isWindowsImage) {
        // Windows: install + start OpenSSH Server so the SSH key reset strategy works.
        // Cloudbase-init will run this on first boot (with #ps1_sysnative prefix for 64-bit PS).
        // The 'ssh_authorized_keys' metadata entry is written to authorized_keys by cloudbase-init.
        const windowsSetupScript = [
          '#ps1_sysnative',
          'try {',
          '  $cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like "OpenSSH.Server*" }',
          '  if ($cap -and $cap.State -ne "Installed") {',
          '    Add-WindowsCapability -Online -Name $cap.Name',
          '  }',
          '  $svc = Get-Service -Name sshd -ErrorAction SilentlyContinue',
          '  if ($svc) {',
          '    Set-Service -Name sshd -StartupType AutomaticDelayedStart',
          '    if ($svc.Status -ne "Running") { Start-Service sshd }',
          '  }',
          '  if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {',
          '    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)"',
          '      -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22',
          '  }',
          '} catch { Write-Output "OpenSSH setup warning: $_" }',
        ].join('\n');
        metadata.user_data = Buffer.from(windowsSetupScript).toString('base64');
        this.logger.log(`🪟 Windows VM: Sending SSH keys + OpenSSH Server setup script`);
      }

      this.logger.log(`🔑 Preparing to launch instance with ${sshPublicKeys.length} SSH keys`);
      this.logger.log(`📝 Metadata ssh_authorized_keys length: ${metadata.ssh_authorized_keys.length} chars`);
      this.logger.log(`📝 Full SSH keys being sent to OCI:`);
      this.logger.log(metadata.ssh_authorized_keys);
      this.logger.log(`📝 SSH keys array preview:`);
      sshPublicKeys.forEach((key, idx) => {
        this.logger.log(`   Key ${idx + 1}: ${key.substring(0, 60)}... (${key.length} chars)`);
      });

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
        // Enable the Run Command plugin for all new instances.
        // This ensures 'Reset Windows Password' works immediately after provisioning.
        agentConfig: {
          isMonitoringDisabled: false,
          isManagementDisabled: false,
          areAllPluginsDisabled: false,
          pluginsConfig: [
            {
              name: 'Compute Instance Run Command',
              desiredState: oci.core.models.InstanceAgentPluginConfigDetails.DesiredState.Enabled,
            },
          ],
        },
      };

      const request: oci.core.requests.LaunchInstanceRequest = {
        launchInstanceDetails: launchInstanceDetails,
      };

      const response = await this.computeClient.launchInstance(request);
      
      this.logger.log(`✅ Launched instance: ${response.instance.id}`);
      this.logger.log(`🌐 Instance will be available at: ${response.instance.displayName}`);
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
   * Update SSH keys for an existing instance by directly modifying authorized_keys file via SSH
   * OCI doesn't allow updating ssh_authorized_keys metadata after instance creation,
   * so we SSH into the instance and modify the file directly.
   * Keeps admin key + max 2 user keys (3 total)
   * 
   * @param instanceId - The OCID of the instance
   * @param newSshKey - The new SSH public key to add
   * @param publicIp - Public IP of the instance
   * @param username - SSH username (e.g., 'opc', 'ubuntu')
   * @param adminPrivateKey - Admin private key string (decrypted)
   * @returns Updated key info
   */
  async updateInstanceSshKeys(
    instanceId: string, 
    newSshKey: string, 
    publicIp: string,
    username: string,
    adminPrivateKey: string,
    adminPublicKey?: string,
  ): Promise<{ id: string; keysCount: number; userKeysCount: number; removedOldest: boolean }> {
    try {
      const { Client } = await import('ssh2');
      
      return new Promise((resolve, reject) => {
        const conn = new Client();
        
        this.logger.log(`🔐 Connecting to ${username}@${publicIp} via SSH...`);
        
        conn.on('ready', () => {
          this.logger.log(`✅ SSH connection established`);
          
          // Read current authorized_keys
          this.logger.log(`📖 Reading current authorized_keys...`);
          conn.exec('cat ~/.ssh/authorized_keys', (err, stream) => {
            if (err) {
              conn.end();
              return reject(new Error(`Failed to read authorized_keys: ${err.message}`));
            }
            
            let currentKeys = '';
            
            stream.on('data', (data: Buffer) => {
              currentKeys += data.toString();
            });
            
            stream.stderr.on('data', (data: Buffer) => {
              this.logger.error(`stderr: ${data}`);
            });
            
            stream.on('close', (code: number) => {
              if (code !== 0) {
                conn.end();
                return reject(new Error(`Failed to read authorized_keys, exit code: ${code}`));
              }
              
              // Parse existing keys
              const existingKeys = currentKeys
                .split('\n')
                .map(key => key.trim())
                .filter(key => key.length > 0);
              
              this.logger.log(`📋 Found ${existingKeys.length} existing keys`);

              // Identify admin key: prefer explicit match by public key value (prevents
              // misidentification after multiple rotations). Fall back to position[0] only
              // if no adminPublicKey was provided.
              const adminKeyNormalized = adminPublicKey?.trim();
              let adminKey: string | null = null;
              if (adminKeyNormalized) {
                // Match by the key material (first two space-separated tokens: type + base64)
                // so that differing comments don't break the match.
                const adminKeyParts = adminKeyNormalized.split(' ').slice(0, 2).join(' ');
                adminKey = existingKeys.find(k => k.split(' ').slice(0, 2).join(' ') === adminKeyParts) ?? null;
                if (!adminKey) {
                  this.logger.warn(`⚠️  Admin public key not found in authorized_keys — it will be added`);
                  adminKey = adminKeyNormalized;
                } else {
                  this.logger.log(`✅ Admin key identified by explicit match (not position)`);
                }
              } else {
                adminKey = existingKeys.length > 0 ? existingKeys[0] : null;
                this.logger.warn(`⚠️  No adminPublicKey provided — using position[0] as fallback`);
              }
              
              // Get user keys only (exclude admin key)
              const adminKeyParts = adminKey ? adminKey.split(' ').slice(0, 2).join(' ') : null;
              const existingUserKeys = adminKeyParts
                ? existingKeys.filter(k => k.split(' ').slice(0, 2).join(' ') !== adminKeyParts)
                : existingKeys;
              
              // Add new user key to the beginning
              const updatedUserKeys = [newSshKey, ...existingUserKeys];
              
              // Keep only the 2 most recent user keys
              const finalUserKeys = updatedUserKeys.slice(0, 2);
              
              // Combine: Admin key first, then user keys
              const finalKeys = adminKey 
                ? [adminKey, ...finalUserKeys]
                : finalUserKeys;
              
              // Create new authorized_keys content
              const newAuthorizedKeysContent = finalKeys.join('\n') + '\n';
              
              // Write new authorized_keys file
              this.logger.log(`✍️  Writing updated authorized_keys (${finalKeys.length} keys)...`);
              
              // Use cat > file approach with heredoc to avoid shell escaping issues
              // This is more reliable than echo for large content
              const command = `cat > ~/.ssh/authorized_keys << 'EOF_SSH_KEYS'
${newAuthorizedKeysContent}EOF_SSH_KEYS
chmod 600 ~/.ssh/authorized_keys`;
              
              conn.exec(command, (err, stream) => {
                if (err) {
                  conn.end();
                  return reject(new Error(`Failed to write authorized_keys: ${err.message}`));
                }
                
                let stdout = '';
                let stderr = '';
                
                // Pipe stdout to drain stream (important!)
                stream.on('data', (data: Buffer) => {
                  stdout += data.toString();
                });
                
                stream.stderr.on('data', (data: Buffer) => {
                  stderr += data.toString();
                });
                
                stream.on('close', (code: number) => {
                  conn.end();
                  
                  if (code !== 0) {
                    this.logger.error(`Write failed. stderr: ${stderr}`);
                    return reject(new Error(`Failed to write authorized_keys, exit code: ${code}`));
                  }
                  
                  this.logger.log(
                    `✅ SSH keys updated successfully for instance ${instanceId}. ` +
                    `Total keys: ${finalKeys.length} (1 admin + ${finalUserKeys.length} user keys)`
                  );
                  
                  resolve({
                    id: instanceId,
                    keysCount: finalKeys.length,
                    userKeysCount: finalUserKeys.length,
                    removedOldest: existingUserKeys.length >= 2,
                  });
                });
                
                // Add timeout to prevent hanging forever
                const timeout = setTimeout(() => {
                  conn.end();
                  reject(new Error('SSH command timeout after 30 seconds'));
                }, 30000);
                
                stream.on('close', () => {
                  clearTimeout(timeout);
                });
              });
            });
          });
        });
        
        conn.on('error', (err) => {
          this.logger.error(`❌ SSH connection error: ${err.message}`);
          this.logger.error(`   Error code: ${err['code']}`);
          this.logger.error(`   Error level: ${err['level']}`);
          reject(new Error(`SSH connection failed: ${err.message}`));
        });
        
        // Debug: Log SSH connection configuration
        const sshConfig = {
          host: publicIp,
          port: 22,
          username: username,
          privateKeyFormat: adminPrivateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1' : 
                           adminPrivateKey.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 'UNKNOWN',
          privateKeyLength: adminPrivateKey.length,
          privateKeyStart: adminPrivateKey.substring(0, 50),
          readyTimeout: 30000,
        };
        this.logger.log(`🔧 SSH Config: ${JSON.stringify(sshConfig, null, 2)}`);
        
        // Connect to the instance
        conn.connect({
          host: publicIp,
          port: 22,
          username: username,
          privateKey: Buffer.from(adminPrivateKey, 'utf8'),
          readyTimeout: 30000,
          debug: (msg) => this.logger.debug(`SSH2 Debug: ${msg}`),
        });
      });
    } catch (error) {
      this.logger.error('Error updating instance SSH keys via SSH:', error);
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
   * Deletes ALL related data in cascade order to avoid foreign key violations
   */ 
  private async cleanupDatabaseRecords(compartmentId: string, instanceIds: string[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`🗑️  Starting database cleanup for compartment: ${compartmentId}`);

      // Get user_compartment ID for foreign key cleanup
      const userCompartments = await queryRunner.query(
        `SELECT id FROM oracle.user_compartments WHERE compartment_id = $1`,
        [compartmentId]
      );
      const userCompartmentIds = userCompartments.map((uc: any) => uc.id);

      // Get vm_instance records for logging
      const vmInstances = await queryRunner.query(
        `SELECT id, user_id, instance_name FROM oracle.vm_instances WHERE compartment_id = $1`,
        [compartmentId]
      );
      this.logger.log(`Found ${vmInstances.length} VM instances to delete in compartment ${compartmentId}`);

      // === STEP 1: Delete child records (logs and related data) ===
      
      // Delete bandwidth_monthly_snapshots for VMs in this compartment
      const deletedBandwidthLogs = await queryRunner.query(
        `DELETE FROM oracle.bandwidth_monthly_snapshots
         WHERE vm_instance_id IN (
           SELECT id FROM oracle.vm_instances WHERE compartment_id = $1
         ) RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${deletedBandwidthLogs.length} bandwidth snapshot records`);

      // Delete vm_actions_log for VMs in this compartment
      const deletedActionLogs = await queryRunner.query(
        `DELETE FROM oracle.vm_actions_log 
         WHERE vm_instance_id IN (
           SELECT id FROM oracle.vm_instances WHERE compartment_id = $1
         ) RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${deletedActionLogs.length} VM action log records`);

      // Delete subscription_logs for subscriptions with VMs in this compartment
      const deletedSubscriptionLogs = await queryRunner.query(
        `DELETE FROM oracle.subscription_logs 
         WHERE subscription_id IN (
           SELECT subscription_id FROM oracle.vm_instances 
           WHERE compartment_id = $1 AND subscription_id IS NOT NULL
         ) RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${deletedSubscriptionLogs.length} subscription log records`);

      // === STEP 2: Update subscriptions to remove vm_instance_id reference ===
      const updatedSubscriptions = await queryRunner.query(
        `UPDATE oracle.subscriptions 
         SET vm_instance_id = NULL, configuration_status = 'deleted'
         WHERE vm_instance_id IN (
           SELECT id FROM oracle.vm_instances WHERE compartment_id = $1
         ) RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Updated ${updatedSubscriptions.length} subscription records to remove VM reference`);

      // === STEP 3: Delete compartment_accounts (IAM users in compartment) ===
      if (userCompartmentIds.length > 0) {
        const deletedCompartmentAccounts = await queryRunner.query(
          `DELETE FROM oracle.compartment_accounts 
           WHERE user_compartment_id = ANY($1::int[]) RETURNING id`,
          [userCompartmentIds]
        );
        this.logger.log(`✅ Deleted ${deletedCompartmentAccounts.length} compartment account records`);
      }

      // === STEP 4: Delete VM instances ===
      await queryRunner.query(
        `DELETE FROM oracle.vm_instances WHERE compartment_id = $1`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${vmInstances.length} VM instance records`);

      // === STEP 5: Delete VCN resources ===
      const deletedVcns = await queryRunner.query(
        `DELETE FROM oracle.vcn_resources WHERE compartment_id = $1 RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${deletedVcns.length} VCN resource records`);

      // === STEP 6: Delete user_compartments (main compartment record) ===
      const deletedCompartments = await queryRunner.query(
        `DELETE FROM oracle.user_compartments WHERE compartment_id = $1 RETURNING id`,
        [compartmentId]
      );
      this.logger.log(`✅ Deleted ${deletedCompartments.length} user compartment records`);

      await queryRunner.commitTransaction();
      this.logger.log('✅ Database cleanup completed successfully');
      
      // Summary log
      this.logger.log(`📊 Cleanup Summary:
        - Bandwidth Logs: ${deletedBandwidthLogs.length}
        - VM Action Logs: ${deletedActionLogs.length}
        - Subscription Logs: ${deletedSubscriptionLogs.length}
        - Subscriptions Updated: ${updatedSubscriptions.length}
        - Compartment Accounts: ${userCompartmentIds.length > 0 ? await queryRunner.query(`SELECT COUNT(*) FROM oracle.compartment_accounts WHERE compartment_id = ANY($1::int[])`, [userCompartmentIds]).then(r => r[0].count) : 0}
        - VM Instances: ${vmInstances.length}
        - VCN Resources: ${deletedVcns.length}
        - User Compartments: ${deletedCompartments.length}
      `);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Error cleaning up database records:', error);
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

  // ─────────────────────────────────────────────────────────────────
  // VNIC Bandwidth methods (oci_vcn namespace, accurate .sum() totals)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the primary VNIC OCID for a compute instance.
   * Uses the compartment_id already stored in the DB to avoid extra OCI calls.
   */
  async getVnicIdForInstance(
    instanceId: string,
    compartmentId: string,
  ): Promise<string | null> {
    try {
      const attachments = await this.getVnicAttachments(compartmentId, instanceId);
      if (!attachments || attachments.length === 0) return null;
      return attachments[0].vnicId || null;
    } catch (error) {
      this.logger.warn(
        `Could not get VNIC for instance ${instanceId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get total EGRESS bytes (VnicBytesOut) for a VNIC over a time range.
   *
   * Uses namespace  : oci_vcn
   * Uses metric     : VnicBytesOut
   * Uses aggregation: .sum()   ← each 1h datapoint = total bytes in that hour
   *
   * Summing all hourly datapoints gives correct total bytes for the period.
   * This is the outbound-traffic metric closest to what OCI uses for billing.
   *
   * Note: includes all outbound traffic (not only Internet egress), which is
   * still the best approximation available via OCI Monitoring SDK.
   */
  async getVnicEgressBytes(
    vnicId: string,
    compartmentId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    // Trích region từ VNIC OCID để set đúng endpoint (vd: ap-tokyo-1)
    const regionId = this.extractRegionFromOcid(vnicId);
    this.logger.log(`[BW-DEBUG] getVnicEgressBytes vnic=${vnicId} region=${regionId}`);
    const monitoring = this.getMonitoringClient(regionId);

    // One-time metric discovery
    const tenancyId = await this.getTenancyId();
    await this.discoverOciMetrics(monitoring, tenancyId);

    // OCI VNIC egress metric — try multiple known name variants
    // (official name may differ between tenancy configs)
    const candidateMetrics = [
      'VnicBytesOut',
      'VnicBytesTransmitted',
      'VnicToNetworkBytes',
      'VnicEgressBytes',
    ];

    const runQuery = async (cid: string, metricName: string, label: string, inSubtree = false): Promise<number | null> => {
      const query = `${metricName}[1h]{resourceId = "${vnicId}"}.sum()`;
      try {
        this.logger.log(`[BW-DEBUG] EGRESS TRY [${label}] metric=${metricName} cid=${cid} subtree=${inSubtree}`);
        const resp = await monitoring.summarizeMetricsData({
          compartmentId: cid,
          summarizeMetricsDataDetails: { namespace: 'oci_vcn', query, startTime, endTime, resolution: '1h' },
          compartmentIdInSubtree: inSubtree,
        });
        const items: any[] = resp.items || [];
        this.logger.log(`[BW-DEBUG] EGRESS RESP [${label}] items=${items.length}` +
          (items.length > 0 ? ` dps=${items[0].aggregatedDatapoints?.length ?? 0}` : ''));
        if (items.length === 0) return null;
        let total = 0;
        for (const m of items) for (const dp of (m.aggregatedDatapoints || [])) total += dp.value || 0;
        this.logger.log(`[BW-DEBUG] EGRESS TOTAL [${label}]: ${total} bytes`);
        return total;
      } catch (err: any) {
        this.logger.warn(`[BW-DEBUG] EGRESS ERROR [${label}] metric=${metricName}: ${err.message}`);
        return null;
      }
    };

    try {
      for (const metric of candidateMetrics) {
        // Try vm compartment first (exact match, no subtree needed)
        let result = await runQuery(compartmentId, metric, 'vm-compartment', false);
        if (result !== null) return result;

        // Try tenancy root with subtree=true (picks up all sub-compartments)
        result = await runQuery(tenancyId, metric, 'tenancy+subtree', true);
        if (result !== null) return result;
      }

      this.logger.warn(`[BW-DEBUG] No oci_vcn egress data for vnic=${vnicId} region=${regionId} — check OCI Console Metrics Explorer`);
      return 0;
    } catch (error: any) {
      this.logger.warn(`getVnicEgressBytes failed for VNIC ${vnicId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get total INGRESS bytes (VnicBytesIn) for a VNIC over a time range.
   * OCI does not charge for ingress — shown for informational purposes only.
   */
  async getVnicIngressBytes(
    vnicId: string,
    compartmentId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<number> {
    const regionId = this.extractRegionFromOcid(vnicId);
    const monitoring = this.getMonitoringClient(regionId);

    const candidateMetrics = [
      'VnicBytesIn',
      'VnicBytesReceived',
      'VnicFromNetworkBytes',
      'VnicIngressBytes',
    ];

    const runQuery = async (cid: string, metricName: string, inSubtree = false): Promise<number | null> => {
      const query = `${metricName}[1h]{resourceId = "${vnicId}"}.sum()`;
      try {
        const resp = await monitoring.summarizeMetricsData({
          compartmentId: cid,
          summarizeMetricsDataDetails: { namespace: 'oci_vcn', query, startTime, endTime, resolution: '1h' },
          compartmentIdInSubtree: inSubtree,
        });
        const items: any[] = resp.items || [];
        if (items.length === 0) return null;
        let total = 0;
        for (const m of items) for (const dp of (m.aggregatedDatapoints || [])) total += dp.value || 0;
        return total;
      } catch (err: any) {
        this.logger.warn(`[BW-DEBUG] INGRESS ERROR metric=${metricName}: ${err.message}`);
        return null;
      }
    };

    try {
      const tenancyId = await this.getTenancyId();
      for (const metric of candidateMetrics) {
        let result = await runQuery(compartmentId, metric, false);
        if (result !== null) return result;
        result = await runQuery(tenancyId, metric, true);
        if (result !== null) return result;
      }
      return 0;
    } catch (error: any) {
      this.logger.warn(`getVnicIngressBytes failed for VNIC ${vnicId}: ${error.message}`);
      return 0;
    }
  }

  // One-time flag: discover available metrics on first call
  private _ociMetricsDiscoveredRegion: string | null = null;

  /**
   * Chạy một lần duy nhất — gọi listMetrics để tìm metric name thật sự
   * đang được OCI publish, tránh hardcode sai tên.
   */
  private async discoverOciMetrics(monitoring: any, tenancyId: string): Promise<void> {
    if (this._ociMetricsDiscoveredRegion) return;
    this._ociMetricsDiscoveredRegion = 'in-progress';
    try {
      // List all metrics in oci_vcn namespace across whole tenancy
      const vcnResp = await (monitoring as any).listMetrics({
        compartmentId: tenancyId,
        listMetricsDetails: { namespace: 'oci_vcn' },
        compartmentIdInSubtree: true,
      });
      const vcnMetricNames = [...new Set<string>((vcnResp.items || []).map((m: any) => m.name as string))];
      this.logger.log(`[BW-DISCOVER] oci_vcn metric names (${vcnMetricNames.length}): ${vcnMetricNames.join(', ') || '(none)'}`);

      // Also discover all available namespaces
      const allResp = await (monitoring as any).listMetrics({
        compartmentId: tenancyId,
        listMetricsDetails: {},
        compartmentIdInSubtree: true,
      });
      const allNs = [...new Set<string>((allResp.items || []).map((m: any) => m.namespace as string))];
      this.logger.log(`[BW-DISCOVER] All namespaces (${allNs.length}): ${allNs.join(', ') || '(none)'}`);
      this._ociMetricsDiscoveredRegion = 'done';
    } catch (err: any) {
      this.logger.warn(`[BW-DISCOVER] listMetrics failed: ${err?.message}`);
      this._ociMetricsDiscoveredRegion = 'error';
    }
  }

  /**
   * Tạo MonitoringClient với đúng region.
   * OCI Monitoring metrics là regional — nếu không set đúng region,
   * client sẽ query sai endpoint và trả về items: [] dù data tồn tại.
   * regionId ví dụ: 'ap-tokyo-1', 'ap-singapore-1', ...
   */
  private getMonitoringClient(regionId?: string) {
    const client = new oci.monitoring.MonitoringClient({
      authenticationDetailsProvider: this.provider,
    });
    if (regionId) {
      // set đúng regional endpoint (vd: telemetry.ap-tokyo-1.oraclecloud.com)
      (client as any).regionId = regionId;
    }
    return client;
  }

  /**
   * Trích xuất region từ OCID.
   * OCID format: ocid1.<resourceType>.oc1.<regionId>.<uniqueId>
   * Ví dụ: ocid1.vnic.oc1.ap-tokyo-1.abxhiljr...
   */
  private extractRegionFromOcid(ocid: string): string | undefined {
    // Match: ocid1.xxx.oc1.<region>.
    const match = ocid.match(/ocid1\.[^.]+\.oc1\.([^.]+)\./i);
    return match ? match[1] : undefined;
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
   * Automatically adjusts resolution based on time range
   */
  async getInstanceMetrics(
    instanceId: string,
    metricName: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    try {
      const regionId = this.extractRegionFromOcid(instanceId);
      const monitoring = this.getMonitoringClient(regionId);
      const compartmentId = await this.getCompartmentIdFromInstanceId(instanceId);

      // Calculate time range in hours
      const timeRangeHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      // Determine resolution based on time range
      // OCI Monitoring has constraints on resolution vs time range
      let resolution: string;
      let queryResolution: string;
      
      if (timeRangeHours <= 1) {
        // 1 hour or less: use 1m resolution
        resolution = '1m';
        queryResolution = '1m';
      } else if (timeRangeHours <= 6) {
        // Up to 6 hours: use 5m resolution
        resolution = '5m';
        queryResolution = '5m';
      } else if (timeRangeHours <= 24) {
        // Up to 24 hours: use 1h resolution
        resolution = '1h';
        queryResolution = '1h';
      } else if (timeRangeHours <= 7 * 24) {
        // Up to 7 days: use 1h resolution
        resolution = '1h';
        queryResolution = '1h';
      } else {
        // More than 7 days: use 1h resolution (max supported for long ranges)
        resolution = '1h';
        queryResolution = '1h';
      }

      const summarizeMetricsDataRequest: oci.monitoring.requests.SummarizeMetricsDataRequest = {
        compartmentId: compartmentId,
        summarizeMetricsDataDetails: {
          namespace: 'oci_computeagent',
          query: `${metricName}[${queryResolution}]{resourceId = "${instanceId}"}.mean()`,
          startTime: startTime,
          endTime: endTime,
          resolution: resolution,
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

  /**
   * Enable the "run-command" plugin on an OCI instance via UpdateInstance.
   * Must also set isManagementDisabled=false so management plugins can run.
   */
  private async enableRunCommandPlugin(instanceId: string): Promise<void> {
    this.logger.log(`🔌 Enabling 'Compute Instance Run Command' plugin on instance: ${instanceId}`);
    await this.computeClient.updateInstance({
      instanceId,
      updateInstanceDetails: {
        agentConfig: {
          isManagementDisabled: false,
          areAllPluginsDisabled: false,
          pluginsConfig: [
            {
              name: 'Compute Instance Run Command',
              desiredState: oci.core.models.InstanceAgentPluginConfigDetails.DesiredState.Enabled,
            },
          ],
        },
      },
    });
    this.logger.log(`✅ 'Compute Instance Run Command' plugin enable request sent`);
  }



  /**
   * Reset Windows VM password using OCI Run Command (Compute Instance Agent).
   * Automatically enables the run-command plugin if not yet active.
   * Falls back to WinRM if OCI Run Command agent doesn't respond.
   */
  async runWindowsPasswordReset(
    instanceId: string,
    compartmentId: string,
    newPassword: string,
    subnetId?: string,
    publicIp?: string,
    currentPassword?: string,
    adminPrivateKey?: string,
  ): Promise<void> {
    this.logger.log(`🚀 Starting Windows password reset on instance: ${instanceId}`);

    // ── Strategy 1: OCI Run Command (primary — no credentials needed, runs as SYSTEM) ──
    try {
      await this.tryRunCommandPasswordReset(instanceId, compartmentId, newPassword);
      this.logger.log(`✅ Password changed via OCI Run Command`);
      return;
    } catch (runCmdErr: any) {
      this.logger.warn(`⚠️ OCI Run Command failed: ${runCmdErr.message}`);
    }

    // ── Strategy 2: SSH with system admin key (no password needed, uses authorized key) ──
    // OCI cloudbase-init adds the system admin public key to the VM at provisioning time.
    // This lets us SSH as 'opc' with key auth and run net user to change the password.
    if (subnetId && publicIp && adminPrivateKey) {
      this.logger.log(`🔑 Attempting SSH key-based password reset...`);
      const securityListId = await this.getSecurityListIdForSubnet(subnetId);
      try {
        await this.changeWindowsPasswordViaSshKey(publicIp, adminPrivateKey, newPassword, securityListId);
        this.logger.log(`✅ Password changed via SSH + admin key`);
        return;
      } catch (sshErr: any) {
        this.logger.warn(`⚠️ SSH key-based reset failed: ${sshErr.message}`);
      }
    }

    // ── Strategy 3: WinRM via pywinrm (requires port 5986 + current password from DB) ──
    // Works as long as the DB password matches the actual VM password.
    // Try this BEFORE restarting the VM to avoid disrupting the user.
    if (subnetId && publicIp && currentPassword) {
      this.logger.log(`🔐 Attempting WinRM password reset...`);
      const secListId = await this.getSecurityListIdForSubnet(subnetId);
      await this.ensureWinrmPortOpen(secListId);
      try {
        this.logger.log(`⏳ Waiting 15s for WinRM security list propagation...`);
        await new Promise(resolve => setTimeout(resolve, 15_000));

        await this.changePasswordViaWinrm(publicIp, currentPassword, newPassword);
        this.logger.log(`✅ Password changed via WinRM`);
        return;
      } catch (winrmErr: any) {
        this.logger.warn(`⚠️ WinRM strategy failed: ${winrmErr.message}`);
      } finally {
        try {
          await this.removeWinrmPort(secListId);
        } catch (cleanErr: any) {
          this.logger.warn(`⚠️ Failed to remove WinRM port rule: ${cleanErr.message}`);
        }
      }
    }

    // ── Strategy 4: Soft-restart VM → reinitialise Oracle Cloud Agent → retry Run Command ──
    // Last resort: SOFTRESET the VM to restart the Oracle Cloud Agent.
    // This is disruptive (VM reboots) and slow (~5+ min for Windows to fully boot).
    this.logger.log(`🔄 Last resort: restarting VM to reinitialise Oracle Cloud Agent...`);
    try {
      await this.restartInstance(instanceId);
      this.logger.log(`✅ SOFTRESET issued — waiting for VM to restart...`);

      // Wait for OCI to report RUNNING + allow Windows to fully boot
      await this.waitForInstanceRunning(instanceId, 5 * 60_000);

      // Retry Run Command with same 2-minute timeout
      this.logger.log(`🔁 Retrying OCI Run Command after VM restart...`);
      await this.tryRunCommandPasswordReset(instanceId, compartmentId, newPassword);
      this.logger.log(`✅ Password changed via OCI Run Command (post-restart)`);
      return;
    } catch (retryErr: any) {
      this.logger.warn(`⚠️ Restart + Run Command retry failed: ${retryErr.message}`);
    }

    throw new Error('All remote password change methods exhausted — manual intervention required.');
  }

  /**
   * Wait for an instance to reach RUNNING state after a restart.
   * Handles both cases: OCI lifecycle transitions (RUNNING→STOPPING→RUNNING)
   * and transparent OS-level restarts (state stays RUNNING throughout).
   */
  private async waitForInstanceRunning(instanceId: string, maxWaitMs: number): Promise<void> {
    const pollMs = 15_000;
    const start = Date.now();
    this.logger.log(`⏳ Waiting up to ${maxWaitMs / 1000}s for VM to reach RUNNING state...`);

    // Give OCI 30 s to register the state change from SOFTRESET
    await new Promise(r => setTimeout(r, 30_000));

    const check = await this.computeClient.getInstance({ instanceId });
    const stateAfter30s = check.instance.lifecycleState as string;
    this.logger.log(`📊 Instance state after 30s: ${stateAfter30s}`);

    if (stateAfter30s === 'RUNNING') {
      // OCI still shows RUNNING — the OS is restarting internally (common for SOFTRESET)
      // Wait a fixed 4 min for the internal reboot + Windows boot to complete
      this.logger.log(`ℹ️ OCI state still RUNNING — waiting 4 min for internal OS restart...`);
      await new Promise(r => setTimeout(r, 240_000));
      return;
    }

    // OCI reflects a non-RUNNING state — poll until RUNNING, then wait for Windows to finish booting
    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollMs));
      const resp = await this.computeClient.getInstance({ instanceId });
      const state = resp.instance.lifecycleState as string;
      this.logger.log(`📊 Instance state: ${state}`);
      if (state === 'RUNNING') {
        // OCI reports RUNNING, but Windows is likely still booting.
        // Wait an extra 3 minutes for the OS + Oracle Cloud Agent to fully initialise.
        this.logger.log(`✅ OCI reports RUNNING — waiting 3 min for Windows boot to complete...`);
        await new Promise(r => setTimeout(r, 180_000));
        return;
      }
    }
    throw new Error(`VM did not return to RUNNING within ${maxWaitMs / 1000}s after restart`);
  }

  /**
   * Try to reset password via OCI Run Command.
   * @param maxWaitMs  Maximum poll time in ms (default 2 min)
   */
  private async tryRunCommandPasswordReset(
    instanceId: string,
    compartmentId: string,
    newPassword: string,
    maxWaitMs: number = 120_000,
  ): Promise<void> {
    // Step 1: Enable Run Command plugin
    try {
      await this.enableRunCommandPlugin(instanceId);
    } catch (enableErr: any) {
      this.logger.warn(`⚠️ Could not request plugin enablement: ${enableErr.message}`);
    }

    // Step 2: Check plugin status (quick check, 30s max)
    let pluginRunning = false;
    try {
      const pluginClient = new oci.computeinstanceagent.PluginClient({
        authenticationDetailsProvider: this.provider,
      });
      const pluginsResp = await pluginClient.listInstanceAgentPlugins({
        compartmentId,
        instanceagentId: instanceId,
      });
      const rcPlugin = pluginsResp.items?.find(
        p => p.name === 'Compute Instance Run Command',
      );
      this.logger.log(`🔌 Run Command plugin status: ${rcPlugin?.status ?? 'NOT FOUND'}`);
      pluginRunning = rcPlugin?.status === 'RUNNING';
    } catch (err: any) {
      this.logger.warn(`⚠️ Could not check plugin status: ${err.message}`);
    }

    if (!pluginRunning) {
      throw new Error('Run Command plugin is not RUNNING');
    }

    // Step 3: Create the Run Command
    const escapedPassword = newPassword.replace(/"/g, '""');
    const script = `net user opc "${escapedPassword}"\r\necho PASSWORD_CHANGED_OK`;

    const createResponse = await this.computeInstanceAgentClient.createInstanceAgentCommand({
      createInstanceAgentCommandDetails: {
        compartmentId,
        executionTimeOutInSeconds: 60,
        displayName: 'Reset Windows Password',
        target: { instanceId },
        content: {
          source: {
            sourceType: 'TEXT',
            text: script,
          } as oci.computeinstanceagent.models.InstanceAgentCommandSourceViaTextDetails,
          output: {
            outputType: 'TEXT',
          } as oci.computeinstanceagent.models.InstanceAgentCommandOutputViaTextDetails,
        },
      },
    });
    const commandId = createResponse.instanceAgentCommand.id;
    this.logger.log(`✅ OCI Run Command created: ${commandId}`);

    // Step 4: Poll for completion, every 10 seconds
    const pollIntervalMs = 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      try {
        const execResponse = await this.computeInstanceAgentClient.getInstanceAgentCommandExecution({
          instanceAgentCommandId: commandId,
          instanceId,
        });

        const execution = execResponse.instanceAgentCommandExecution;
        const lifecycleState = execution.lifecycleState;
        const deliveryState = execution.deliveryState;
        this.logger.log(`📊 Run Command status — delivery: ${deliveryState}, lifecycle: ${lifecycleState}`);

        if (lifecycleState === oci.computeinstanceagent.models.InstanceAgentCommandExecution.LifecycleState.Succeeded) {
          return;
        }

        if (
          lifecycleState === oci.computeinstanceagent.models.InstanceAgentCommandExecution.LifecycleState.Failed ||
          lifecycleState === oci.computeinstanceagent.models.InstanceAgentCommandExecution.LifecycleState.TimedOut ||
          lifecycleState === oci.computeinstanceagent.models.InstanceAgentCommandExecution.LifecycleState.Canceled
        ) {
          throw new Error(`Run Command failed with state: ${lifecycleState}`);
        }
      } catch (pollError: any) {
        if (pollError?.statusCode === 404 || String(pollError?.message).includes('404')) {
          this.logger.log(`⏳ Command not yet picked up by agent...`);
          continue;
        }
        throw pollError;
      }
    }

    throw new Error('OCI Run Command timed out (2 min). Agent not processing commands.');
  }

  /**
   * Get the first security list OCID associated with a subnet.
   */
  private async getSecurityListIdForSubnet(subnetId: string): Promise<string> {
    const subnetResp = await this.virtualNetworkClient.getSubnet({ subnetId });
    const secListIds = subnetResp.subnet.securityListIds;
    if (!secListIds || secListIds.length === 0) {
      throw new Error(`No security lists found for subnet ${subnetId}`);
    }
    return secListIds[0];
  }

  /**
   * Change the Windows 'opc' user password via SSH + system admin private key.
   * Does NOT require the current password — works as long as the admin key is in
   * the VM's authorized_keys (added by cloudbase-init at provisioning time).
   *
   * Uses PowerShell -EncodedCommand (base64 UTF-16LE) so that special characters
   * in the password (e.g. `$`, `!`, `@`) don't get interpreted by the shell.
   */
  private async changeWindowsPasswordViaSshKey(
    publicIp: string,
    adminPrivateKey: string,
    newPassword: string,
    securityListId: string,
  ): Promise<void> {
    this.logger.log(`🔑 Opening SSH port 22 in security list: ${securityListId}`);
    await this.ensureSshPortOpen(securityListId);

    try {
      // Wait for security list to propagate
      this.logger.log(`⏳ Waiting 15s for port 22 security list rule to propagate...`);
      await new Promise(r => setTimeout(r, 15_000));

      this.logger.log(`🔌 Connecting via SSH to ${publicIp}:22 as opc...`);

      await new Promise<void>((resolve, reject) => {
        // Build PowerShell script that decodes the base64 password, then calls net user
        // Using base64 avoids shell string escaping issues with $, !, @, #, etc.
        const b64pw = Buffer.from(newPassword, 'utf8').toString('base64');
        // Single quotes around the Base64 literal prevent PowerShell from treating
        // the Base64 padding `=` character as an assignment operator in some contexts.
        const psScript = [
          `$b=[System.Convert]::FromBase64String('${b64pw}')`,
          `$p=[System.Text.Encoding]::UTF8.GetString($b)`,
          `net user opc $p`,
        ].join(';');

        // Encode the whole script as UTF-16LE Base64 for -EncodedCommand
        // This works whether the SSH default shell is cmd.exe or PowerShell
        const encodedCmd = Buffer.from(psScript, 'utf16le').toString('base64');
        const sshCommand = `powershell.exe -NonInteractive -NoProfile -EncodedCommand ${encodedCmd}`;

        import('ssh2').then(({ Client }) => {
          const conn = new Client();
          let stdout = '';
          let stderr = '';

          conn.on('ready', () => {
            this.logger.log(`✅ SSH connected — running password change command`);
            conn.exec(sshCommand, (err, stream) => {
              if (err) { conn.end(); return reject(new Error(`SSH exec error: ${err.message}`)); }
              stream.on('data', (d: Buffer) => { stdout += d.toString(); });
              stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
              stream.on('close', (code: number) => {
                conn.end();
                this.logger.log(`📊 SSH command exit code: ${code}`);
                if (stdout.trim()) this.logger.log(`📋 stdout: ${stdout.trim()}`);
                if (stderr.trim()) this.logger.warn(`⚠️ stderr: ${stderr.trim()}`);
                if (code !== 0) {
                  reject(new Error(`PowerShell net user failed (exit ${code}): ${stderr.trim() || stdout.trim()}`));
                } else {
                  resolve();
                }
              });
            });
          });

          conn.on('error', (err) => reject(new Error(`SSH connection error: ${err.message}`)));

          conn.connect({
            host: publicIp,
            port: 22,
            username: 'opc',
            privateKey: Buffer.from(adminPrivateKey, 'utf8'),
            readyTimeout: 60_000,
          });
        }).catch(reject);
      });
    } finally {
      try {
        await this.removeSshPort(securityListId);
        this.logger.log(`🔒 SSH port 22 rule removed from security list`);
      } catch (cleanErr: any) {
        this.logger.warn(`⚠️ Failed to remove SSH port 22 rule: ${cleanErr.message}`);
      }
    }
  }

  /**
   * Temporarily open SSH port 22 in a security list.
   */
  private async ensureSshPortOpen(securityListId: string): Promise<void> {
    const securityList = await this.getSecurityList(securityListId);

    const alreadyOpen = securityList.ingressSecurityRules.some((rule: any) =>
      rule.protocol === '6' &&
      rule.tcpOptions?.destinationPortRange?.min === 22 &&
      rule.tcpOptions?.destinationPortRange?.max === 22,
    );

    if (alreadyOpen) {
      this.logger.log('✅ SSH port 22 is already open');
      return;
    }

    const newIngressRules = [
      ...securityList.ingressSecurityRules,
      {
        source: '0.0.0.0/0',
        protocol: '6',
        isStateless: false,
        tcpOptions: {
          destinationPortRange: { min: 22, max: 22 },
        },
        description: 'SSH (temporary for password reset)',
      },
    ];

    await this.virtualNetworkClient.updateSecurityList({
      securityListId,
      updateSecurityListDetails: {
        ingressSecurityRules: newIngressRules,
        egressSecurityRules: securityList.egressSecurityRules,
      },
    });

    this.logger.log('✅ SSH port 22 opened');
  }

  /**
   * Remove the temporary SSH port 22 rule from a security list.
   */
  private async removeSshPort(securityListId: string): Promise<void> {
    const securityList = await this.getSecurityList(securityListId);

    const filteredRules = securityList.ingressSecurityRules.filter((rule: any) =>
      !(
        rule.protocol === '6' &&
        rule.tcpOptions?.destinationPortRange?.min === 22 &&
        rule.tcpOptions?.destinationPortRange?.max === 22
      ),
    );

    await this.virtualNetworkClient.updateSecurityList({
      securityListId,
      updateSecurityListDetails: {
        ingressSecurityRules: filteredRules,
        egressSecurityRules: securityList.egressSecurityRules,
      },
    });

    this.logger.log('✅ SSH port 22 closed');
  }

  /**
   * Temporarily open WinRM HTTPS port (5986) in a security list.
   */
  private async ensureWinrmPortOpen(securityListId: string): Promise<void> {
    this.logger.log(`🔓 Opening WinRM port 5986 in security list: ${securityListId}`);

    const securityList = await this.getSecurityList(securityListId);

    const hasWinrmRule = securityList.ingressSecurityRules.some((rule: any) =>
      rule.protocol === '6' &&
      rule.tcpOptions?.destinationPortRange?.min === 5986 &&
      rule.tcpOptions?.destinationPortRange?.max === 5986,
    );

    if (hasWinrmRule) {
      this.logger.log('✅ WinRM port 5986 is already open');
      return;
    }

    const newIngressRules = [
      ...securityList.ingressSecurityRules,
      {
        source: '0.0.0.0/0',
        protocol: '6',
        isStateless: false,
        tcpOptions: {
          destinationPortRange: { min: 5986, max: 5986 },
        },
        description: 'WinRM HTTPS (temporary for password reset)',
      },
    ];

    await this.virtualNetworkClient.updateSecurityList({
      securityListId,
      updateSecurityListDetails: {
        ingressSecurityRules: newIngressRules,
        egressSecurityRules: securityList.egressSecurityRules,
      },
    });

    this.logger.log('✅ WinRM port 5986 opened');
  }

  /**
   * Remove the temporary WinRM port (5986) rule from a security list.
   */
  private async removeWinrmPort(securityListId: string): Promise<void> {
    this.logger.log(`🔒 Removing WinRM port 5986 from security list: ${securityListId}`);

    const securityList = await this.getSecurityList(securityListId);

    const filteredRules = securityList.ingressSecurityRules.filter((rule: any) =>
      !(
        rule.protocol === '6' &&
        rule.tcpOptions?.destinationPortRange?.min === 5986 &&
        rule.tcpOptions?.destinationPortRange?.max === 5986
      ),
    );

    await this.virtualNetworkClient.updateSecurityList({
      securityListId,
      updateSecurityListDetails: {
        ingressSecurityRules: filteredRules,
        egressSecurityRules: securityList.egressSecurityRules,
      },
    });

    this.logger.log('✅ WinRM port 5986 removed');
  }

  /**
   * Change Windows password via WinRM using the pywinrm helper script.
   * Passes credentials via stdin for security.
   */
  private async changePasswordViaWinrm(
    publicIp: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.logger.log(`🔌 Connecting via WinRM to ${publicIp}:5986...`);

    const scriptPath = path.join(process.cwd(), 'scripts', 'winrm-password-reset.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`WinRM helper script not found at ${scriptPath}`);
    }

    const input = JSON.stringify({
      ip: publicIp,
      username: 'opc',
      currentPassword,
      newPassword,
    });

    const result = spawnSync('python3', [scriptPath], {
      input,
      timeout: 60000,
      encoding: 'utf-8',
    });

    if (result.error) {
      throw new Error(`WinRM process error: ${result.error.message}`);
    }

    this.logger.log(`📊 WinRM exit code: ${result.status}`);
    if (result.stdout) this.logger.log(`📋 WinRM output: ${result.stdout.trim()}`);
    if (result.stderr) this.logger.warn(`⚠️ WinRM stderr: ${result.stderr.trim()}`);

    if (result.status !== 0) {
      let errorMsg = 'WinRM password change failed';
      try {
        const parsed = JSON.parse(result.stdout);
        errorMsg = parsed.error || parsed.stderr || errorMsg;
      } catch { /* ignore parse error */ }
      throw new Error(errorMsg);
    }
  }
}
