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
      secretOrKey: config.get<string>("JWT_SECRET") ?? "development-secret",
    });
  }
  async validate(payload: { sub: string; role?: string; jti?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        deanProfile: true,
        teacherProfile: { include: { department: true } },
        studentProfile: { include: { section: true } },
        permissionOverrides: { include: { permission: true } },
      },
    });

    if (!user || !user.isActive || user.status === AccountStatus.DISABLED) throw new UnauthorizedException();

    if (user.role === 'STUDENT') {
      if (!payload.jti) throw new UnauthorizedException();
      const session = await this.prisma.studentLoginSession.findUnique({ where: { userId: user.id } });
      if (!session || session.id !== payload.jti || session.expiresAt <= new Date()) throw new UnauthorizedException();
    }
    return { ...user, loginSessionId: payload.jti };
  }
}
