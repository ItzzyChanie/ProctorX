import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { authenticateSocket } from '../common/socket-auth';

@WebSocketGateway()
export class AuthGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const user = await authenticateSocket(socket, this.jwt, this.prisma);
    if (!user) {
      socket.disconnect(true);
      return;
    }
    await socket.join(`user:${user.id}`);
  }

  notifyUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }
}
