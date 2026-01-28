import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  path: '/api/socket.io/',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class PaymentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PaymentGateway.name);
  private userSockets = new Map<number, string>(); // userId -> socketId

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove from userSockets map
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        break;
      }
    }
  }

  // Client đăng ký để nhận thông báo cho userId cụ thể
  registerUser(userId: number, socketId: string) {
    this.userSockets.set(userId, socketId);
    this.logger.log(`Registered user ${userId} with socket ${socketId}`);
  }

  // Thông báo thanh toán thành công
  notifyPaymentSuccess(userId: number, packageId: number) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('payment-success', {
        userId,
        packageId,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Notified payment success to user ${userId}`);
    } else {
      this.logger.warn(`No socket found for user ${userId}`);
    }
  }
}