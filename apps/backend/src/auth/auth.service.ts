import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountStatus, Prisma, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { AuthGateway } from './auth.gateway';
import { UpdateProfileDto } from './dto/update-profile.dto';

const STUDENT_LEASE_MS = 2 * 60 * 1000;
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

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
    private gateway: AuthGateway
  ) {}

  private async issueToken(user: UserWithProfile) {
    let sessionId: string | undefined;

    if (user.role === Role.STUDENT) {
      sessionId = randomUUID();
      const now = new Date();
      const staleBefore = new Date(now.getTime() - STUDENT_LEASE_MS);

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.studentLoginSession.deleteMany({
            where: {
              userId: user.id,
              OR: [
                { lastSeenAt: { lt: staleBefore } },
                { expiresAt: { lte: now } },
              ],
            },
          });

          await tx.studentLoginSession.create({
            data: {
              id: sessionId!,
              userId: user.id,
              expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
            },
          });
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
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
    }
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      ...(sessionId ? { jti: sessionId } : {}),
    });
  }

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
      office: deanProfile?.college ?? teacherProfile?.department ?? null,
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
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await this.prisma.activationCode.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await this.prisma.activationCode.create({
          data: {
            userId: user.id,
            codeHash: await bcrypt.hash(code, 10),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        await this.email.sendActivationCode(user.email!, code);
        await this.prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: 'ACTIVATION_OTP_REQUESTED',
            targetType: 'User',
            targetId: user.id,
          },
        });
        return { activationRequired: true as const };
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
  async verifyActivation(loginId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { loginId: loginId.trim().toLowerCase() },
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
    newPassword: string
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: profileInclude,
      });
      if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
        throw new UnauthorizedException('Invalid credentials');
      return this.profile(
        await this.prisma.user.update({
          where: { id: userId },
          include: profileInclude,
          data: {
            passwordHash: await bcrypt.hash(newPassword, 12),
            mustChangePassword: false,
          },
        })
      );
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
    if (
      profilePicture &&
      !/^data:image\/(png|jpe?g|webp);base64,/.test(profilePicture)
    )
      throw new ConflictException('Choose a PNG, JPEG, or WebP image');
    return this.profile(
      await this.prisma.user.update({
        where: { id: userId },
        data: { profilePicture: profilePicture || null },
        include: profileInclude,
      })
    );
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
        ...(input.email !== undefined
          ? { email: input.email.trim().toLowerCase() || null }
          : {}),
        ...(current.role === Role.DEAN
          ? {
              deanProfile: {
                upsert: {
                  create: {
                    employeeId: input.employeeId?.trim() || null,
                    college: input.office?.trim() || null,
                  },
                  update: {
                    ...(input.employeeId !== undefined
                      ? { employeeId: input.employeeId.trim() || null }
                      : {}),
                    ...(input.office !== undefined
                      ? { college: input.office.trim() || null }
                      : {}),
                  },
                },
              },
            }
          : current.role === Role.TEACHER
            ? {
                teacherProfile: {
                  upsert: {
                    create: {
                      employeeId: input.employeeId?.trim() || null,
                      department: input.office?.trim() || null,
                    },
                    update: {
                      ...(input.employeeId !== undefined
                        ? { employeeId: input.employeeId.trim() || null }
                        : {}),
                      ...(input.office !== undefined
                        ? { department: input.office.trim() || null }
                        : {}),
                    },
                  },
                },
              }
            : {
                studentProfile: {
                  update: {
                    ...(input.studentId !== undefined
                      ? { studentId: input.studentId.trim() || null }
                      : {}),
                    ...(input.program !== undefined
                      ? { program: input.program.trim() || null }
                      : {}),
                  },
                },
              }),
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
    const result = await this.prisma.studentLoginSession.updateMany({
      where: { userId, id: sessionId, expiresAt: { gt: new Date() } },
      data: { lastSeenAt: new Date() },
    });

    if (!result.count) throw new UnauthorizedException();
    return { success: true };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.studentLoginSession.deleteMany({
        where: { userId, id: sessionId },
      });
    }
    return { success: true };
  }
}
