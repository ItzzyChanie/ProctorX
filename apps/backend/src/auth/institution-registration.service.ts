import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountStatus, InstitutionRegistrationStatus, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { CreateInstitutionRegistrationDto } from './dto/institution-registration.dto';

const CODE_LIFETIME_MS = 10 * 60 * 1000;

@Injectable()
export class InstitutionRegistrationService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService
  ) {}

  async searchInstitutions(rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < 2) return [];

    const baseUrl =
      this.config.get<string>('UNIVERSITY_SEARCH_API_URL') ??
      'http://universities.hipolabs.com/search';
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('name', query);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4_000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return [];
      const results = (await response.json()) as Array<{
        name?: unknown;
        country?: unknown;
        domains?: unknown;
      }>;
      const normalizedQuery = query.toLocaleLowerCase();
      const unique = new Map<
        string,
        { name: string; country: string | null; domain: string | null }
      >();
      for (const result of Array.isArray(results) ? results : []) {
        if (typeof result.name !== 'string' || !result.name.trim()) continue;
        const name = result.name.trim();
        const key = name.toLocaleLowerCase();
        if (!unique.has(key)) {
          unique.set(key, {
            name,
            country:
              typeof result.country === 'string' ? result.country : null,
            domain:
              Array.isArray(result.domains) &&
              typeof result.domains[0] === 'string'
                ? result.domains[0]
                : null,
          });
        }
      }
      return [...unique.values()]
        .sort((a, b) => {
          const aStarts = a.name
            .toLocaleLowerCase()
            .startsWith(normalizedQuery)
            ? 0
            : 1;
          const bStarts = b.name
            .toLocaleLowerCase()
            .startsWith(normalizedQuery)
            ? 0
            : 1;
          return aStarts - bStarts || a.name.localeCompare(b.name);
        })
        .slice(0, 8);
    } catch {
      // Registration still accepts exact manual entry if the directory is unavailable.
      return [];
    }
  }
  private code() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private reference() {
    return `PX-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private publicApplication(application: {
    referenceNumber: string;
    email: string;
    status: InstitutionRegistrationStatus;
    institutionName: string;
  }) {
    return {
      referenceNumber: application.referenceNumber,
      email: application.email,
      status: application.status,
      institutionName: application.institutionName,
    };
  }

  private async activate(application: {
    id: string;
    referenceNumber: string;
    institutionName: string;
    collegeDepartmentName: string;
    firstName: string;
    lastName: string;
    employeeId: string | null;
    officialTitle: string;
    email: string;
    passwordHash: string;
    status: InstitutionRegistrationStatus;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: application.email },
    });
    if (existingUser) {
      if (existingUser.role !== Role.DEAN)
        throw new ConflictException('This email belongs to another account role.');
      if (application.status !== InstitutionRegistrationStatus.APPROVED)
        await this.prisma.institutionRegistration.update({
          where: { id: application.id },
          data: { status: InstitutionRegistrationStatus.APPROVED },
        });
      return { ...this.publicApplication({ ...application, status: InstitutionRegistrationStatus.APPROVED }), userId: existingUser.id };
    }

    const employeeId = application.employeeId?.trim();
    if (!employeeId)
      throw new ConflictException('Employee ID is required.');
    const loginId = employeeId.toLowerCase();
    const loginOwner = await this.prisma.user.findUnique({ where: { loginId } });
    if (loginOwner)
      throw new ConflictException('This Employee ID is already used by another account.');

    const userId = randomUUID();
    const [user, approved] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          id: userId,
          institutionId: userId,
          role: Role.DEAN,
          loginId,
          email: application.email,
          passwordHash: application.passwordHash,
          fullName: `${application.firstName} ${application.lastName}`.trim(),
          mustChangePassword: false,
          isActive: true,
          status: AccountStatus.ACTIVE,
          deanProfile: {
            create: {
              employeeId,
              college: application.collegeDepartmentName,
              title: application.officialTitle,
              institutionName: application.institutionName,
            },
          },
        },
      }),
      this.prisma.institutionRegistration.update({
        where: { id: application.id },
        data: { status: InstitutionRegistrationStatus.APPROVED },
      }),
    ]);
    return { ...this.publicApplication(approved), userId: user.id };
  }

  async create(input: CreateInstitutionRegistrationDto) {
    if (
      !input.authorityConfirmed ||
      !input.termsAccepted ||
      !input.privacyAccepted
    )
      throw new ConflictException(
        'All confirmations and agreements are required.'
      );

    const email = input.email.trim().toLowerCase();
    const employeeId = input.employeeId.trim();
    const duplicate = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { loginId: employeeId.toLowerCase() },
        ],
      },
    });
    if (duplicate)
      throw new ConflictException(
        'An account already uses this email address or Employee ID. Please sign in instead.'
      );

    const existing = await this.prisma.institutionRegistration.findUnique({
      where: { email },
    });
    if (existing)
      throw new ConflictException(
        existing.status === InstitutionRegistrationStatus.PENDING_REVIEW
          ? `This email already has a verified application (${existing.referenceNumber}).`
          : 'An application already uses this email. Use the verification step or resend its code.'
      );

    const code = this.code();
    const application = await this.prisma.institutionRegistration.create({
      data: {
        referenceNumber: this.reference(),
        institutionName: input.institutionName.trim(),
        collegeDepartmentName: input.collegeDepartmentName.trim(),
        schoolType: input.schoolType,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        employeeId,
        officialTitle: input.officialTitle.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        authorityConfirmed: input.authorityConfirmed,
        termsAccepted: input.termsAccepted,
        privacyAccepted: input.privacyAccepted,
        verificationCodeHash: await bcrypt.hash(code, 10),
        verificationExpiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
      },
    });

    try {
      await this.email.sendInstitutionVerificationCode(
        email,
        code,
        application.institutionName
      );
    } catch (error) {
      await this.prisma.institutionRegistration.delete({
        where: { id: application.id },
      });
      throw error;
    }
    return this.publicApplication(application);
  }

  async verify(referenceNumber: string, code: string) {
    const application = await this.prisma.institutionRegistration.findUnique({
      where: { referenceNumber },
    });
    if (!application) throw new NotFoundException('Application not found.');
    if (
      application.status === InstitutionRegistrationStatus.PENDING_REVIEW ||
      application.status === InstitutionRegistrationStatus.APPROVED
    )
      return this.activate(application);
    if (
      !application.verificationCodeHash ||
      !application.verificationExpiresAt ||
      application.verificationExpiresAt < new Date() ||
      application.verificationAttempts >= 5
    )
      throw new UnauthorizedException(
        'Verification code is invalid or expired.'
      );
    if (!(await bcrypt.compare(code, application.verificationCodeHash))) {
      await this.prisma.institutionRegistration.update({
        where: { id: application.id },
        data: { verificationAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException(
        'Verification code is invalid or expired.'
      );
    }
    const verified = await this.prisma.institutionRegistration.update({
      where: { id: application.id },
      data: {
        status: InstitutionRegistrationStatus.PENDING_REVIEW,
        emailVerifiedAt: new Date(),
        verificationCodeHash: null,
        verificationExpiresAt: null,
        verificationAttempts: 0,
      },
    });
    return this.activate(verified);
  }

  async resend(referenceNumber: string) {
    const application = await this.prisma.institutionRegistration.findUnique({
      where: { referenceNumber },
    });
    if (!application) throw new NotFoundException('Application not found.');
    if (
      application.status !==
      InstitutionRegistrationStatus.EMAIL_VERIFICATION_PENDING
    )
      throw new ConflictException('This application is already verified.');
    const code = this.code();
    await this.prisma.institutionRegistration.update({
      where: { id: application.id },
      data: {
        verificationCodeHash: await bcrypt.hash(code, 10),
        verificationExpiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
        verificationAttempts: 0,
      },
    });
    await this.email.sendInstitutionVerificationCode(
      application.email,
      code,
      application.institutionName
    );
    return { success: true };
  }
}
