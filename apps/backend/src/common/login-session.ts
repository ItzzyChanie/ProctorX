import { AccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A JWT is only honoured while its `jti` names a live login session that
 * belongs to an active account. Shared by the HTTP strategy and sockets.
 */
export async function isLiveLoginSession(
  prisma: PrismaService,
  userId: string,
  sessionId: string | undefined
): Promise<boolean> {
  if (!sessionId) return false;
  const session = await prisma.loginSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      expiresAt: true,
      user: { select: { isActive: true, status: true } },
    },
  });
  return Boolean(
    session &&
      session.userId === userId &&
      session.expiresAt > new Date() &&
      session.user.isActive &&
      session.user.status !== AccountStatus.DISABLED
  );
}
