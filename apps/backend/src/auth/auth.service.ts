import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AccountStatus, Prisma } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";

const profileInclude = {
  deanProfile: true,
  teacherProfile: true,
  studentProfile: true,
} satisfies Prisma.UserInclude;

type UserWithProfile = Prisma.UserGetPayload<{
  include: typeof profileInclude;
}>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private email: EmailService,
  ) {}
  private profile(user: UserWithProfile) {
    const {
      passwordHash,
      deanProfile,
      teacherProfile,
      studentProfile,
      ...userProfile
    } = user;
    return {
      ...userProfile,
      employeeId: teacherProfile?.employeeId ?? deanProfile?.employeeId ?? null,
      studentId: studentProfile?.studentId ?? null,
      yearLevel: studentProfile?.yearLevel ?? null,
      program: studentProfile?.program ?? null,
    };
  }
  async login(loginId: string, password: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { loginId: loginId.trim().toLowerCase() },
        include: profileInclude,
      });
      if (
        !user ||
        !user.isActive || user.status === AccountStatus.DISABLED ||
        !(await bcrypt.compare(password, user.passwordHash)) &&
        !(user.status === AccountStatus.PENDING && await bcrypt.compare(password.toLocaleLowerCase(), user.passwordHash))
      )
        throw new UnauthorizedException("Invalid credentials");
      if (user.status === AccountStatus.PENDING) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await this.prisma.activationCode.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
        await this.prisma.activationCode.create({ data: { userId: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
        await this.email.sendActivationCode(user.email!, code);
        await this.prisma.auditLog.create({ data: { actorId: user.id, action: "ACTIVATION_OTP_REQUESTED", targetType: "User", targetId: user.id } });
        return { activationRequired: true as const };
      }
      return {
        accessToken: await this.jwt.signAsync({
          sub: user.id,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        }),
        user: this.profile(user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      ) {
        throw new ServiceUnavailableException(
          "Database is unavailable. Please start Postgres on localhost:5432.",
        );
      }
      if (error instanceof UnauthorizedException) throw error;
      throw error;
    }
  }
  async verifyActivation(loginId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { loginId: loginId.trim().toLowerCase() }, include: profileInclude });
    if (!user || user.status !== AccountStatus.PENDING) throw new UnauthorizedException("Activation is not available");
    const activation = await this.prisma.activationCode.findFirst({ where: { userId: user.id, consumedAt: null }, orderBy: { createdAt: "desc" } });
    if (!activation || activation.expiresAt < new Date() || activation.attempts >= 5) throw new UnauthorizedException("Activation code is invalid or expired");
    if (!(await bcrypt.compare(code, activation.codeHash))) { await this.prisma.activationCode.update({ where: { id: activation.id }, data: { attempts: { increment: 1 } } }); throw new UnauthorizedException("Activation code is invalid or expired"); }
    await this.prisma.$transaction([
      this.prisma.activationCode.update({ where: { id: activation.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { status: AccountStatus.ACTIVE, mustChangePassword: true } }),
      this.prisma.auditLog.create({ data: { actorId: user.id, action: "ACCOUNT_ACTIVATED", targetType: "User", targetId: user.id } }),
    ]);
    return { accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role, mustChangePassword: true }), passwordChangeRequired: true, user: { ...this.profile(user), status: AccountStatus.ACTIVE, mustChangePassword: true } };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: profileInclude,
      });
      if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
        throw new UnauthorizedException("Invalid credentials");
      return this.profile(
        await this.prisma.user.update({
          where: { id: userId },
          include: profileInclude,
          data: {
            passwordHash: await bcrypt.hash(newPassword, 12),
            mustChangePassword: false,
          },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      ) {
        throw new ServiceUnavailableException(
          "Database is unavailable. Please start Postgres on localhost:5432.",
        );
      }
      if (error instanceof UnauthorizedException) throw error;
      throw error;
    }
  }
  me(user: UserWithProfile) {
    return this.profile(user);
  }
}
