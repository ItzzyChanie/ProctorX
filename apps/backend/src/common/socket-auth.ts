import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_DEFAULT_PERMISSIONS } from './constants/role-permissions';

export type SocketUser = { id: string; role: Role };

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

// Promises are not serializable, so they stay out of socket.data (which is
// shipped between nodes by the Redis adapter's fetchSockets()).
const pending = new WeakMap<Socket, Promise<SocketUser | null>>();

/**
 * Verifies the session cookie once per socket and caches the result. Every
 * gateway handler awaits this, so a message that arrives before the
 * connection handler finishes is still authenticated.
 */
export function authenticateSocket(
  socket: Socket,
  jwt: JwtService,
  prisma: PrismaService
): Promise<SocketUser | null> {
  const cached = pending.get(socket);
  if (cached) return cached;
  const result = (async (): Promise<SocketUser | null> => {
    try {
      const token = cookie(socket, 'proctorx_session');
      if (!token) return null;
      const payload = await jwt.verifyAsync<{
        sub: string;
        role: Role;
        jti?: string;
      }>(token);
      if (payload.role === Role.STUDENT) {
        if (!payload.jti) return null;
        const session = await prisma.studentLoginSession.findUnique({
          where: { userId: payload.sub },
        });
        if (
          !session ||
          session.id !== payload.jti ||
          session.expiresAt <= new Date()
        )
          return null;
      }
      const user = { id: payload.sub, role: payload.role };
      socket.data.user = user;
      return user;
    } catch {
      return null;
    }
  })();
  pending.set(socket, result);
  return result;
}

export async function hasPermission(
  prisma: PrismaService,
  user: SocketUser,
  permission: string
) {
  const override = await prisma.userPermission.findFirst({
    where: { userId: user.id, permission: { key: permission } },
  });
  if (override) return override.granted;
  const defaults = ROLE_DEFAULT_PERMISSIONS[user.role];
  return defaults.includes('*') || defaults.includes(permission);
}
