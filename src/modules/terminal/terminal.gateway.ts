import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TerminalService } from './terminal.service';
import { UserSession } from '../../auth/user-session.entity';
import { User } from '../../entities/user.entity';
import { TerminalConnectDto, TerminalResizeDto } from './dto';

@WebSocketGateway({
  path: '/api/socket.io/',
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'https://oraclecloud.vn', 'https://smartdashboard.vn'],
    credentials: true,
  },
})
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private socketToSession: Map<string, string> = new Map(); // socketId -> sessionId
  private sessionRevalidators: Map<string, NodeJS.Timeout> = new Map(); // socketId -> interval

  constructor(
    private readonly terminalService: TerminalService,
    private readonly jwtService: JwtService,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** True only if the session row exists, is unexpired, AND the user is still active. */
  private async isSessionAndUserActive(sid: string | undefined, userId: any): Promise<boolean> {
    if (!sid) return false;
    const session = await this.sessionRepository.findOne({ where: { id: sid } });
    if (!session || (session.expiresAt && new Date() > session.expiresAt)) return false;
    // M9: a deactivated (banned) account must not keep a live root shell, even if a
    // session row somehow survives (e.g. re-login before M-A3/M9 gates were added).
    const uid = Number(userId);
    if (Number.isFinite(uid)) {
      const user = await this.userRepository.findOne({ where: { id: uid } });
      if (!user || user.isActive === false) return false;
    }
    return true;
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided from ${client.id}`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT token
      try {
        const payload = this.jwtService.verify(token, { algorithms: ['HS256'] });

        // A1: honor session revocation. Unlike the HTTP JwtStrategy, this gateway
        // used to trust any signed, unexpired token — so a logged-out / rotated /
        // password-changed token could still open a root shell until natural expiry.
        // Reject when the token's session no longer exists (or has expired).
        const sid = payload.sid;
        const uid = payload.id || payload.sub;
        if (!(await this.isSessionAndUserActive(sid, uid))) {
          this.logger.warn(`Connection rejected: session/user inactive/revoked from ${client.id}`);
          client.emit('error', { message: 'Session has been terminated. Please log in again.' });
          client.disconnect();
          return;
        }

        (client as any).userId = uid;
        (client as any).userEmail = payload.email;

        // M-T1: A1 checks the session only at connect. A live root shell must also
        // die when the session is revoked MID-session (logout-all / password change
        // / refresh rotation), so re-validate periodically and disconnect on failure.
        if (sid) {
          const revalidate = setInterval(async () => {
            try {
              const sessionOk = await this.isSessionAndUserActive(sid, uid);
              // VM-E: also re-check the VM's subscription is still active — a shell must
              // die when the subscription is suspended/cancelled/expired mid-session.
              const sessionId = this.socketToSession.get(client.id);
              const vmOk = !sessionId || (await this.terminalService.revalidateSessionAccess(sessionId, Number(uid)));
              if (!sessionOk || !vmOk) {
                this.logger.warn(`Session/user/subscription revoked mid-session; closing terminal for ${client.id}`);
                client.emit('error', { message: 'Session has been terminated. Please log in again.' });
                client.disconnect();
              }
            } catch {
              /* transient DB error — re-check on the next tick */
            }
          }, 30000);
          this.sessionRevalidators.set(client.id, revalidate);
        }

        this.logger.log(`Client connected: ${client.id} (User: ${payload.email})`);
      } catch (error) {
        this.logger.warn(`Connection rejected: Invalid token from ${client.id}`);
        client.emit('error', { message: 'Invalid or expired token' });
        client.disconnect();
        return;
      }
    } catch (error) {
      this.logger.error('Error in handleConnection:', error);
      client.emit('error', { message: 'Connection failed' });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const revalidator = this.sessionRevalidators.get(client.id);
    if (revalidator) {
      clearInterval(revalidator);
      this.sessionRevalidators.delete(client.id);
    }
    const sessionId = this.socketToSession.get(client.id);
    if (sessionId) {
      this.logger.log(`Client disconnected: ${client.id}, closing session: ${sessionId}`);
      this.terminalService.closeSession(sessionId);
      this.socketToSession.delete(client.id);
    } else {
      this.logger.log(`Client disconnected: ${client.id} (no active session)`);
    }
  }

  /**
   * Start terminal session
   */
  @SubscribeMessage('terminal:start')
  async handleTerminalStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TerminalConnectDto,
  ) {
    const userId = (client as any).userId;
    const userEmail = (client as any).userEmail;

    try {
      this.logger.log(`Starting terminal for VM ${data.vmId}, User ${userId} (${userEmail})`);

      // Validate VM access
      const vm = await this.terminalService.validateVmAccess(userId, data.vmId);

      // Get client info. Only trust X-Forwarded-For / X-Real-IP when the socket
      // actually terminates at the local reverse proxy (nginx on loopback);
      // otherwise a client could forge its own source IP via these headers.
      // Mirrors the `trust proxy: 'loopback'` policy used for the HTTP flow.
      // When trusted, take the right-most XFF entry (the hop nginx appended) —
      // any left-most values are attacker-supplied. Used for audit logging only.
      const handshakeAddr = client.handshake.address || '';
      const fromLocalProxy = /(?:^|:)(?:127\.0\.0\.1|::1)$/.test(handshakeAddr);
      let clientIp = handshakeAddr;
      if (fromLocalProxy) {
        const xff = client.handshake.headers['x-forwarded-for'] as string | undefined;
        const xRealIp = client.handshake.headers['x-real-ip'] as string | undefined;
        clientIp =
          (xff ? xff.split(',').pop()!.trim() : '') ||
          xRealIp ||
          handshakeAddr;
      }
      const userAgent = client.handshake.headers['user-agent'] || 'Unknown';

      // Create SSH connection
      const session = await this.terminalService.createSshConnection(
        vm,
        userId,
        client.id,
        clientIp,
        userAgent,
      );

      // Map socket to session
      this.socketToSession.set(client.id, session.sessionId);

      // Create PTY shell
      const stream = await this.terminalService.createPtyShell(session, 24, 80);

      // Pipe SSH stream to WebSocket
      stream.on('data', (data: Buffer) => {
        client.emit('terminal:data', data.toString('utf-8'));
        this.terminalService.updateActivity(session.sessionId);
      });

      stream.on('close', () => {
        this.logger.log(`SSH stream closed for session ${session.sessionId}`);
        client.emit('terminal:close', { message: 'Terminal session ended' });
        this.terminalService.closeSession(session.sessionId);
        this.socketToSession.delete(client.id);
      });

      stream.stderr.on('data', (data: Buffer) => {
        client.emit('terminal:data', data.toString('utf-8'));
      });

      // Send success message
      client.emit('terminal:ready', {
        message: 'Terminal connected',
        vmName: vm.instance_name,
        vmIp: vm.public_ip,
      });

      this.logger.log(`Terminal session ${session.sessionId} started successfully`);

    } catch (error) {
      this.logger.error(`Failed to start terminal for VM ${data.vmId}:`, error);
      client.emit('terminal:error', {
        message: error.message || 'Failed to start terminal',
      });
    }
  }

  /**
   * Handle terminal input from client
   */
  @SubscribeMessage('terminal:data')
  handleTerminalData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string,
  ) {
    const sessionId = this.socketToSession.get(client.id);
    if (!sessionId) {
      client.emit('terminal:error', { message: 'No active session' });
      return;
    }

    const session = this.terminalService.getSession(sessionId);
    if (!session || !session.sshStream) {
      client.emit('terminal:error', { message: 'Session not found or stream not available' });
      return;
    }

    try {
      session.sshStream.write(data);
      this.terminalService.updateActivity(sessionId);
    } catch (error) {
      this.logger.error(`Error writing to SSH stream:`, error);
      client.emit('terminal:error', { message: 'Failed to send data to terminal' });
    }
  }

  /**
   * Handle terminal resize
   */
  @SubscribeMessage('terminal:resize')
  handleTerminalResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TerminalResizeDto,
  ) {
    const sessionId = this.socketToSession.get(client.id);
    if (!sessionId) {
      return;
    }

    const session = this.terminalService.getSession(sessionId);
    if (!session || !session.sshStream) {
      return;
    }

    try {
      session.sshStream.setWindow(data.rows, data.cols);
      this.terminalService.updateActivity(sessionId);
      this.logger.log(`Terminal resized: ${data.cols}x${data.rows} for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error resizing terminal:`, error);
    }
  }

  /**
   * Handle terminal close request
   */
  @SubscribeMessage('terminal:close')
  handleTerminalClose(@ConnectedSocket() client: Socket) {
    const sessionId = this.socketToSession.get(client.id);
    if (sessionId) {
      this.logger.log(`Client requested to close session: ${sessionId}`);
      this.terminalService.closeSession(sessionId);
      this.socketToSession.delete(client.id);
      client.emit('terminal:closed', { message: 'Session closed' });
    }
  }
}
