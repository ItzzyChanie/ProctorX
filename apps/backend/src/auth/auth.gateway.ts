import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { authenticateSocket } from '../common/socket-auth';
import { isLiveLoginSession } from '../common/login-session';

/** Backstop re-check; revocation also disconnects sockets immediately. */
const SESSION_RECHECK_MS = 2 * 60 * 1000;

const rooms = {
  user: (userId: string) => `user:${userId}`,
  loginSession: (sessionId: string) => `login-session:${sessionId}`,
};

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
    await socket.join([
      rooms.user(user.id),
      rooms.loginSession(user.loginSessionId),
    ]);
    // A long-lived socket must not outlive its login session (e.g. expiry).
    const timer = setInterval(() => {
      void isLiveLoginSession(this.prisma, user.id, user.loginSessionId)
        .then((live) => {
          if (!live) socket.disconnect(true);
        })
        .catch(() => undefined);
    }, SESSION_RECHECK_MS);
    socket.once('disconnect', () => clearInterval(timer));
  }

  notifyUser(userId: string, notification: unknown) {
    this.server.to(rooms.user(userId)).emit('notification:new', notification);
  }

  async disconnectSession(sessionId: string) {
    this.server.in(rooms.loginSession(sessionId)).disconnectSockets(true);
  }

  async disconnectUser(userId: string, exceptSessionId?: string) {
    if (!exceptSessionId) {
      this.server.in(rooms.user(userId)).disconnectSockets(true);
      return;
    }
    const sockets = await this.server.in(rooms.user(userId)).fetchSockets();
    for (const socket of sockets)
      if (!socket.rooms.has(rooms.loginSession(exceptSessionId)))
        socket.disconnect(true);
  }
}
