import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

function cookie(socket: Socket, name: string) {
  const value = socket.handshake.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class AuthGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = cookie(socket, 'proctorx_session');
      if (!token) {
        socket.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role: Role;
        jti?: string;
      }>(token);
      if (payload.role === Role.STUDENT) {
        if (!payload.jti) {
          socket.disconnect(true);
          return;
        }
        const session = await this.prisma.studentLoginSession.findUnique({
          where: { userId: payload.sub },
        });
        if (
          !session ||
          session.id !== payload.jti ||
          session.expiresAt <= new Date()
        ) {
          socket.disconnect(true);
          return;
        }
      }
      await socket.join(`user:${payload.sub}`);
      return;
    } catch {
      socket.disconnect(true);
      return;
    }
  }

  notifyUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }
}
