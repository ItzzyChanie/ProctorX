import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGateway } from './auth.gateway';

/**
 * Ends login sessions immediately: deletes the session rows (so HTTP requests
 * with those JWTs are rejected) and disconnects the matching live sockets.
 */
@Injectable()
export class SessionRevocationService {
  constructor(
    private prisma: PrismaService,
    private gateway: AuthGateway
  ) {}

  async revokeSession(sessionId: string) {
    await this.prisma.loginSession.deleteMany({ where: { id: sessionId } });
    await this.gateway.disconnectSession(sessionId);
  }

  /** Revokes every session of a user, optionally keeping the caller's own. */
  async revokeUser(userId: string, exceptSessionId?: string) {
    await this.prisma.loginSession.deleteMany({
      where: {
        userId,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
    });
    await this.gateway.disconnectUser(userId, exceptSessionId);
  }
}
