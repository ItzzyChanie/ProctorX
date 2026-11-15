import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

const THROTTLER_LIMIT_KEY = 'THROTTLER:LIMITdefault';

function bearerOrCookie(req: Record<string, any>): string | null {
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer '))
    return header.slice(7);
  const cookie = (req.headers?.cookie as string | undefined)
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('proctorx_session='));
  return cookie ? cookie.slice('proctorx_session='.length) : null;
}

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 32);

/**
 * Global rate limiter tuned for a campus where hundreds of students share one
 * public IP (NAT):
 * - sign-in style routes are keyed by IP + login ID, so one lab does not
 *   exhaust a single shared bucket while one account still cannot be
 *   brute-forced from one address;
 * - authenticated traffic is keyed by the session token (per browser);
 * - anonymous traffic to routes without an explicit @Throttle is skipped
 *   (it is rejected by the auth guard anyway).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (bearerOrCookie(req)) return false;
    const explicit = this.reflector.getAllAndOverride<number | undefined>(
      THROTTLER_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    );
    return explicit === undefined;
  }

  protected override async getTracker(req: Record<string, any>) {
    const loginId = req.body?.loginId;
    if (typeof loginId === 'string' && loginId.trim())
      return `login:${req.ip}:${loginId.trim().toLowerCase()}`;
    const referenceNumber = req.body?.referenceNumber;
    if (typeof referenceNumber === 'string' && referenceNumber.trim())
      return `ref:${req.ip}:${referenceNumber.trim().toUpperCase()}`;
    const token = bearerOrCookie(req);
    if (token) return `session:${hash(token)}`;
    return `ip:${req.ip}`;
  }
}
