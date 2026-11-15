import { createSecretKey } from "crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AccountStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

function sessionCookie(request: { headers?: { cookie?: string } }): string | null {
  const value = request.headers?.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("proctorx_session="))
    ?.slice("proctorx_session=".length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        sessionCookie,
      ]),
      ignoreExpiration: false,
      // No fallback: main.ts refuses to start without a strong JWT_SECRET.
      // A KeyObject avoids jsonwebtoken re-parsing the string secret (and
      // failing an RSA-key parse first) on every request - ~5% of CPU under load.
      secretOrKey: createSecretKey(
        Buffer.from(config.getOrThrow<string>("JWT_SECRET"), "utf8")
      ) as unknown as string,
    });
  }
  /**
   * Runs on every authenticated request, so it is a single query: the login
   * session (which makes logout / password change / disable take effect
   * immediately) joined to the few user columns guards and controllers use.
   * /auth/me loads the full profile separately.
   */
  async validate(payload: { sub: string; role?: string; jti?: string }) {
    if (!payload.jti) throw new UnauthorizedException();
    const session = await this.prisma.loginSession.findUnique({
      where: { id: payload.jti },
      select: {
        userId: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            role: true,
            institutionId: true,
            isActive: true,
            status: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      session.user.status === AccountStatus.DISABLED
    )
      throw new UnauthorizedException();
    return { ...session.user, loginSessionId: payload.jti };
  }
}
