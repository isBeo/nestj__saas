// apps/api/src/modules/notifications/gateways/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../../config/env.config';

interface ConnectedClient {
  userId: string;
  deviceId: string;
  socketId: string;
}

@WebSocketGateway({
  cors: {
    origin: [env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,
  },
  namespace: '/notifications', // ws://localhost:3001/notifications
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // Map of userId → Set of socket IDs (user may have one socket per browser tab)
  private connectedClients = new Map<string, ConnectedClient>();

  constructor(private jwt: JwtService) {}

  // ─────────────────────────────────────────────────────
  // CONNECTION HANDLING
  // ─────────────────────────────────────────────────────
  handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (typeof token !== 'string' || token.length === 0) {
        this.logger.warn(`WS: Unauthenticated connection attempt ${client.id}`);
        void client.disconnect();
        return;
      }

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: env.JWT_SECRET,
      });
      const deviceId = client.handshake.auth?.deviceId || 'unknown';

      // Store client info
      this.connectedClients.set(client.id, {
        userId: payload.sub,
        deviceId,
        socketId: client.id,
      });

      // Join room named after userId (for targeted messaging)
      void client.join(`user:${payload.sub}`);

      this.logger.log(
        `WS connected: user=${payload.sub} socket=${client.id} device=${deviceId}`,
      );
    } catch {
      this.logger.warn(`WS: Invalid token, disconnecting ${client.id}`);
      void client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      this.logger.log(
        `WS disconnected: user=${clientInfo.userId} socket=${client.id}`,
      );
      this.connectedClients.delete(client.id);
    }
  }

  // ─────────────────────────────────────────────────────
  // EMIT DEVICE TERMINATED EVENT
  // ─────────────────────────────────────────────────────
  notifyUserDeviceTerminated(
    userId: string,
    payload: { reason: string; message: string },
  ): void {
    // Emit to all sockets in the user's room
    this.server.to(`user:${userId}`).emit('device:terminated', {
      ...payload,
      timestamp: new Date().toISOString(),
    });

    this.logger.warn(`WS: Device termination sent to user=${userId}`);
  }

  // ─────────────────────────────────────────────────────
  // EMIT GENERAL NOTIFICATION
  // ─────────────────────────────────────────────────────
  sendNotification(
    userId: string,
    notification: { title: string; body: string; type: string; data?: any },
  ): void {
    this.server.to(`user:${userId}`).emit('notification:new', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────
  // CLIENT EVENTS (messages FROM browser)
  // ─────────────────────────────────────────────────────
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // Get list of online users (for admins)
  getOnlineUsers(): string[] {
    return Array.from(this.connectedClients.values()).map((c) => c.userId);
  }
}
