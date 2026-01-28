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
import { TerminalService } from './terminal.service';
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

  constructor(
    private readonly terminalService: TerminalService,
    private readonly jwtService: JwtService,
  ) {}

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
        const payload = this.jwtService.verify(token);
        (client as any).userId = payload.id || payload.sub;
        (client as any).userEmail = payload.email;
        
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

      // Get client info
      const clientIp = (client.handshake.headers['x-forwarded-for'] as string) || 
                       (client.handshake.headers['x-real-ip'] as string) ||
                       client.handshake.address;
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
