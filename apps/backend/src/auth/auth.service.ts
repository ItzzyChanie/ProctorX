import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";

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
        !user.isActive ||
        !(await bcrypt.compare(password, user.passwordHash))
      )
        throw new UnauthorizedException("Invalid credentials");
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
