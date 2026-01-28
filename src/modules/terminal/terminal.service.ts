import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'ssh2';
import { VmInstance } from '../../entities/vm-instance.entity';
import { SystemSshKey } from '../../entities/system-ssh-key.entity';
import { decryptPrivateKey } from '../../utils/system-ssh-key.util';

export interface TerminalSession {
  sessionId: string;
  userId: number;
  vmId: number;
  vmIp: string;
  socketId: string;
  sshConnection: Client;
  sshStream: any;
  startedAt: Date;
  lastActivity: Date;
  isActive: boolean;
  clientIp: string;
  userAgent: string;
}

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);
  private activeSessions: Map<string, TerminalSession> = new Map();

  constructor(
    @InjectRepository(VmInstance)
    private readonly vmInstanceRepo: Repository<VmInstance>,
    @InjectRepository(SystemSshKey)
    private readonly systemSshKeyRepo: Repository<SystemSshKey>,
  ) {
    // Cleanup idle sessions every 5 minutes
    setInterval(() => this.cleanupIdleSessions(), 5 * 60 * 1000);
  }

  /**
   * Validate user has access to VM
   */
  async validateVmAccess(userId: number, vmId: number): Promise<VmInstance> {
    this.logger.log(`🔍 Validating VM access: userId=${userId}, vmId=${vmId}`);
    
    const vm = await this.vmInstanceRepo.findOne({
      where: { id: vmId, user_id: userId },
    });

    this.logger.log(`🔍 Query result: ${vm ? 'VM found' : 'VM not found'}`);
    if (vm) {
      this.logger.log(`   VM details: id=${vm.id}, name=${vm.instance_name}, user_id=${vm.user_id}, subscription_id=${vm.subscription_id}`);
    }

    // Try querying without user_id check for debugging
    const vmWithoutUserCheck = await this.vmInstanceRepo.findOne({
      where: { id: vmId },
    });
    
    if (vmWithoutUserCheck) {
      this.logger.log(`🔍 VM exists in DB: id=${vmWithoutUserCheck.id}, user_id=${vmWithoutUserCheck.user_id}`);
      this.logger.log(`   User ID mismatch? Expected: ${userId}, Got: ${vmWithoutUserCheck.user_id}`);
    }

    if (!vm) {
      throw new NotFoundException('VM not found or you do not have access');
    }

    if (vm.lifecycle_state !== 'RUNNING') {
      throw new BadRequestException(`VM is not running. Current state: ${vm.lifecycle_state}`);
    }

    if (!vm.public_ip) {
      throw new BadRequestException('VM does not have a public IP address yet');
    }

    // Check if this is a Windows VM
    const isWindows = vm.operating_system?.toLowerCase().includes('windows');
    if (isWindows) {
      throw new BadRequestException(
        'Web terminal is not available for Windows VMs. Please use Remote Desktop Connection (RDP) instead.'
      );
    }

    return vm;
  }

  /**
   * Create SSH connection to VM using system admin key
   */
  async createSshConnection(
    vm: VmInstance,
    userId: number,
    socketId: string,
    clientIp: string,
    userAgent: string,
  ): Promise<TerminalSession> {
    // Get system SSH key
    if (!vm.system_ssh_key_id) {
      throw new BadRequestException('VM does not have system SSH key configured');
    }

    const systemKey = await this.systemSshKeyRepo.findOne({
      where: { id: vm.system_ssh_key_id },
    });

    if (!systemKey || !systemKey.is_active) {
      throw new BadRequestException('System SSH key not found or inactive');
    }

    // Decrypt private key
    let privateKey: string;
    try {
      privateKey = decryptPrivateKey(systemKey.private_key_encrypted);
    } catch (error) {
      this.logger.error('Failed to decrypt system SSH key:', error);
      throw new BadRequestException('Failed to decrypt SSH key');
    }

    // Determine SSH username based on OS
    const username = this.getDefaultUsername(vm.operating_system);

    // Create SSH connection
    const sshConnection = new Client();
    const sessionId = `${userId}-${vm.id}-${Date.now()}`;

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sshConnection.end();
          reject(new Error('SSH connection timeout'));
        }
      }, 30000); // 30 second timeout

      sshConnection
        .on('ready', () => {
          if (resolved) return;
          clearTimeout(timeout);
          resolved = true;

          this.logger.log(`SSH connection established to ${vm.public_ip} for user ${userId}`);

          const session: TerminalSession = {
            sessionId,
            userId,
            vmId: vm.id,
            vmIp: vm.public_ip,
            socketId,
            sshConnection,
            sshStream: null,
            startedAt: new Date(),
            lastActivity: new Date(),
            isActive: true,
            clientIp,
            userAgent,
          };

          this.activeSessions.set(sessionId, session);
          resolve(session);
        })
        .on('error', (err) => {
          if (resolved) return;
          clearTimeout(timeout);
          resolved = true;

          this.logger.error(`SSH connection error to ${vm.public_ip}:`, err);
          reject(new Error(`SSH connection failed: ${err.message}`));
        })
        .connect({
          host: vm.public_ip,
          port: 22,
          username,
          privateKey,
          readyTimeout: 30000,
          keepaliveInterval: 30000,
        });
    });
  }

  /**
   * Create PTY shell for terminal
   */
  async createPtyShell(session: TerminalSession, rows: number = 24, cols: number = 80): Promise<any> {
    return new Promise((resolve, reject) => {
      session.sshConnection.shell(
        {
          term: 'xterm-256color',
          rows,
          cols,
        },
        (err, stream) => {
          if (err) {
            this.logger.error('Failed to create shell:', err);
            reject(new Error('Failed to create terminal shell'));
            return;
          }

          session.sshStream = stream;
          session.lastActivity = new Date();
          this.activeSessions.set(session.sessionId, session);

          resolve(stream);
        }
      );
    });
  }

  /**
   * Get session by session ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.activeSessions.set(sessionId, session);
    }
  }

  /**
   * Close session
   */
  closeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      try {
        if (session.sshStream) {
          session.sshStream.end();
        }
        if (session.sshConnection) {
          session.sshConnection.end();
        }
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        this.logger.log(`Session ${sessionId} closed`);
      } catch (error) {
        this.logger.error(`Error closing session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Cleanup idle sessions (30 minutes timeout)
   */
  private cleanupIdleSessions(): void {
    const now = new Date();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const idle = now.getTime() - session.lastActivity.getTime();
      if (idle > timeout) {
        this.logger.log(`Closing idle session: ${sessionId} (idle for ${Math.round(idle / 60000)} minutes)`);
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Get default SSH username based on OS
   */
  private getDefaultUsername(operatingSystem?: string): string {
    if (!operatingSystem) return 'opc'; // Oracle Linux default

    const os = operatingSystem.toLowerCase();
    
    if (os.includes('ubuntu')) return 'ubuntu';
    if (os.includes('centos')) return 'centos';
    if (os.includes('rocky')) return 'rocky';
    if (os.includes('oracle')) return 'opc';
    if (os.includes('rhel') || os.includes('red hat')) return 'ec2-user';
    
    return 'opc'; // Default fallback
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: number): TerminalSession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.userId === userId);
  }
}
