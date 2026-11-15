import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountStatus, Prisma, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { AuthGateway } from './auth.gateway';
import { SessionRevocationService } from './session-revocation.service';
import { AvatarsService } from '../avatars/avatars.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ROLE_DEFAULT_PERMISSIONS } from '../common/constants/role-permissions';

const STUDENT_LEASE_MS = 2 * 60 * 1000;
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVATION_CODE_LIFETIME_MS = 10 * 60 * 1000;
const ACTIVATION_RESEND_COOLDOWN_MS = 30 * 1000;

const profileInclude = {
  deanProfile: true,
  teacherProfile: { include: { department: true } },
  studentProfile: { include: { section: true } },
  permissionOverrides: { include: { permission: true } },
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
    private gateway: AuthGateway,
    private revocation: SessionRevocationService,
    private avatars: AvatarsService
  ) {}

  /**
   * Creates a revocable login session (the JWT `jti`) for every role.
   * Students may hold only one live session: concurrent sign-ins for the same
   * account are serialized with a row lock on the user.
   */
  private async issueToken(user: UserWithProfile) {
    const sessionId = randomUUID();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STUDENT_LEASE_MS);
    const isStudent = user.role === Role.STUDENT;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.loginSession.deleteMany({
        where: {
          userId: user.id,
          OR: [
            { expiresAt: { lte: now } },
            ...(isStudent ? [{ lastSeenAt: { lt: staleBefore } }] : []),
          ],
        },
      });
      if (isStudent && (await tx.loginSession.count({ where: { userId: user.id } })))
        return false;
      await tx.loginSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
        },
      });
      return true;
    });

    if (!created) {
      const notification = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'SECURITY_DOUBLE_LOGIN_BLOCKED',
          message:
            'A sign-in attempt from another browser or device was blocked because this account is already active.',
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'STUDENT_DOUBLE_LOGIN_BLOCKED',
          targetType: 'User',
          targetId: user.id,
        },
      });
      this.gateway.notifyUser(user.id, notification);
      throw new ConflictException(
        'This student account is already active on another browser or device.'
      );
    }
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      jti: sessionId,
    });
  }

  private async issueActivationCode(user: {
    id: string;
    email: string | null;
  }) {
    if (!user.email)
      throw new ConflictException('This account has no activation email');
    const now = new Date();
    const latest = await this.prisma.activationCode.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latest) {
      const resendAvailableAt = new Date(
        latest.createdAt.getTime() + ACTIVATION_RESEND_COOLDOWN_MS
      );
      if (resendAvailableAt > now)
        return { sent: false, resendAvailableAt };
    }

    const code = String(randomInt(100000, 1_000_000));
    await this.prisma.activationCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now },
    });
    const activation = await this.prisma.activationCode.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(now.getTime() + ACTIVATION_CODE_LIFETIME_MS),
      },
    });
    try {
      await this.email.sendActivationCode(user.email, code);
    } catch (error) {
      await this.prisma.activationCode.delete({ where: { id: activation.id } });
      throw error;
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'ACTIVATION_OTP_REQUESTED',
        targetType: 'User',
        targetId: user.id,
      },
    });
    return {
      sent: true,
      resendAvailableAt: new Date(
        activation.createdAt.getTime() + ACTIVATION_RESEND_COOLDOWN_MS
      ),
    };
  }

  private profile(user: UserWithProfile) {
    const {
      passwordHash,
      deanProfile,
      teacherProfile,
      studentProfile,
      permissionOverrides,
      ...userProfile
    } = user;
    const permissionKeys = new Set(
      Object.values(ROLE_DEFAULT_PERMISSIONS).flat()
    );
    for (const override of permissionOverrides) {
      permissionKeys.add(override.permission.key);
    }
    const granted = new Set(ROLE_DEFAULT_PERMISSIONS[user.role]);
    for (const override of permissionOverrides) {
      if (override.granted) granted.add(override.permission.key);
      else granted.delete(override.permission.key);
    }
    return {
      ...userProfile,
      permissions: Object.fromEntries(
        [...permissionKeys].map((key) => [key, granted.has(key)])
      ),
      employeeId: teacherProfile?.employeeId ?? deanProfile?.employeeId ?? null,
      office:
        deanProfile?.college ?? teacherProfile?.department?.name ?? null,
      officialTitle: deanProfile?.title ?? null,
      institutionName: deanProfile?.institutionName ?? null,
      studentId: studentProfile?.studentId ?? null,
      yearLevel: studentProfile?.yearLevel ?? null,
      program: studentProfile?.program ?? null,
      sectionName: studentProfile?.section?.name ?? null,
    };
  }
  async login(loginId: string, password: string) {
    try {
      const identifier = loginId.trim().toLowerCase();
      const user = await this.prisma.user.findFirst({
        where: { OR: [{ loginId: identifier }, { email: identifier }] },
        include: profileInclude,
      });
      if (
        !user ||
        !user.isActive ||
        user.status === AccountStatus.DISABLED ||
        (!(await bcrypt.compare(password, user.passwordHash)) &&
          !(
            user.status === AccountStatus.PENDING &&
            (await bcrypt.compare(
              password.toLocaleLowerCase(),
              user.passwordHash
            ))
          ))
      )
        throw new UnauthorizedException('Invalid credentials');
      if (user.status === AccountStatus.PENDING) {
        const activation = await this.issueActivationCode(user);
        return {
          activationRequired: true as const,
          resendAvailableAt: activation.resendAvailableAt,
        };
      }
      return {
        accessToken: await this.issueToken(user),
        user: this.profile(user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      ) {
        throw new ServiceUnavailableException(
          'Database is unavailable. Please start Postgres on localhost:5432.'
        );
      }
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      )
        throw error;
      throw error;
    }
  }

  async resendActivation(loginId: string) {
    const identifier = loginId.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ loginId: identifier }, { email: identifier }] },
      select: { id: true, email: true, status: true, isActive: true },
    });
    if (
      !user ||
      !user.isActive ||
      user.status !== AccountStatus.PENDING
    )
      throw new UnauthorizedException('Activation is not available');
    const activation = await this.issueActivationCode(user);
    return {
      resent: activation.sent,
      resendAvailableAt: activation.resendAvailableAt,
    };
  }

  async createSessionForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: profileInclude,
    });
    if (!user || !user.isActive || user.status !== AccountStatus.ACTIVE)
      throw new UnauthorizedException('Account is not active.');
    return {
      accessToken: await this.issueToken(user),
      user: this.profile(user),
    };
  }
  async verifyActivation(loginId: string, code: string) {
    const identifier = loginId.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ loginId: identifier }, { email: identifier }] },
      include: profileInclude,
    });
    if (!user || user.status !== AccountStatus.PENDING)
      throw new UnauthorizedException('Activation is not available');
    const activation = await this.prisma.activationCode.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !activation ||
      activation.expiresAt < new Date() ||
      activation.attempts >= 5
    )
      throw new UnauthorizedException('Activation code is invalid or expired');
    if (!(await bcrypt.compare(code, activation.codeHash))) {
      await this.prisma.activationCode.update({
        where: { id: activation.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Activation code is invalid or expired');
    }
    await this.prisma.$transaction([
      this.prisma.activationCode.update({
        where: { id: activation.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { status: AccountStatus.ACTIVE, mustChangePassword: true },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'ACCOUNT_ACTIVATED',
          targetType: 'User',
          targetId: user.id,
        },
      }),
    ]);
    return {
      accessToken: await this.issueToken({
        ...user,
        status: AccountStatus.ACTIVE,
        mustChangePassword: true,
      }),
      passwordChangeRequired: true,
      user: {
        ...this.profile(user),
        status: AccountStatus.ACTIVE,
        mustChangePassword: true,
      },
    };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: profileInclude,
      });
      if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
        throw new UnauthorizedException('Invalid credentials');
      const updated = await this.prisma.user.update({
        where: { id: userId },
        include: profileInclude,
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
        },
      });
      // Sign out every other browser/device that knew the old password.
      await this.revocation.revokeUser(userId, currentSessionId);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'PASSWORD_CHANGED',
          targetType: 'User',
          targetId: userId,
        },
      });
      return this.profile(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientRustPanicError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      ) {
        throw new ServiceUnavailableException(
          'Database is unavailable. Please start Postgres on localhost:5432.'
        );
      }
      if (error instanceof UnauthorizedException) throw error;
      throw error;
    }
  }
  me(user: UserWithProfile) {
    return this.profile(user);
  }
  async updateProfilePicture(userId: string, profilePicture: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profilePicture: true },
    });
    const next = await this.avatars.resolve(
      profilePicture,
      current?.profilePicture
    );
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: next === undefined ? {} : { profilePicture: next },
      include: profileInclude,
    });
    await this.avatars.discard(current?.profilePicture, next);
    return this.profile(user);
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!current) throw new UnauthorizedException();
    const fullName = input.fullName.trim();
    if (!fullName) throw new ConflictException('Full name is required');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName,
        ...(current.role === Role.DEAN
          ? {
              deanProfile: {
                upsert: {
                  create: {
                    college: input.office?.trim() || null,
                  },
                  update: {
                    ...(input.office !== undefined
                      ? { college: input.office.trim() || null }
                      : {}),
                  },
                },
              },
            }
          : {}),
      },
      include: profileInclude,
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'PROFILE_UPDATED',
        targetType: 'User',
        targetId: userId,
      },
    });
    return this.profile(user);
  }

  async heartbeat(userId: string, sessionId?: string) {
    if (!sessionId) throw new UnauthorizedException();
    const result = await this.prisma.loginSession.updateMany({
      where: { userId, id: sessionId, expiresAt: { gt: new Date() } },
      data: { lastSeenAt: new Date() },
    });

    if (!result.count) throw new UnauthorizedException();
    return { success: true };
  }

  async logout(_userId: string, sessionId?: string) {
    if (sessionId) await this.revocation.revokeSession(sessionId);
    return { success: true };
  }
}
