import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import {
  PromoteSectionDto,
  TransferStudentDto,
} from './dto/student-placement.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  private async institutionFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institutionId: true },
    });
    if (!user?.institutionId) throw new NotFoundException('Institution not found');
    return user.institutionId;
  }
  async listStudents(query: StudentQueryDto, actorId: string, actorRole: Role) {
    const institutionId = await this.institutionFor(actorId);
    const students = await this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        institutionId,
        studentProfile: {
          is: {
            program: query.program,
            yearLevel: query.yearLevel,
            ...(query.sectionId ? { sectionId: query.sectionId } : {}),
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        profilePicture: true,
        studentProfile: {
          select: {
            studentId: true,
            program: true,
            yearLevel: true,
            section: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (actorRole !== Role.TEACHER || !students.length) return students;
    const studentIds = students.map(({ id }) => id);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, subject: { teacherId: actorId } },
      select: { studentId: true, subjectId: true },
    });

    const subjectIds = [
      ...new Set(enrollments.map(({ subjectId }) => subjectId)),
    ];

    const exams = subjectIds.length
      ? await this.prisma.exam.findMany({
          where: { subjectId: { in: subjectIds } },
          select: { id: true, subjectId: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const latestBySubject = new Map<string, string>();
    exams.forEach((exam) => {
      if (!latestBySubject.has(exam.subjectId))
        latestBySubject.set(exam.subjectId, exam.id);
    });

    const latestExamIds = [...latestBySubject.values()];
    const sessions = latestExamIds.length
      ? await this.prisma.examSession.findMany({
          where: {
            examId: { in: latestExamIds },
            studentId: { in: studentIds },
            status: 'COMPLETED',
          },
          select: { examId: true, studentId: true },
        })
      : [];

    const completed = new Set(
      sessions.map(({ studentId, examId }) => `${studentId}:${examId}`)
    );

    return students.map((student) => {
      const relevantExamIds = enrollments
        .filter(({ studentId }) => studentId === student.id)
        .map(({ subjectId }) => latestBySubject.get(subjectId))
        .filter((id): id is string => !!id);
      return {
        ...student,
        assessmentStatus:
          relevantExamIds.length > 0 &&
          relevantExamIds.every((examId) =>
            completed.has(`${student.id}:${examId}`)
          )
            ? 'TAKEN'
            : 'NOT_TAKEN',
      };
    });
  }

  async sections(program: string, yearLevel: string, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    return this.prisma.studentSection.findMany({
      where: { institutionId, program, yearLevel },
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createSection(input: CreateSectionDto, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    const name = input.name.trim();
    try {
      const section = await this.prisma.studentSection.create({
        data: { institutionId, name, program: input.program, yearLevel: input.yearLevel },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'STUDENT_SECTION_CREATED',
          targetType: 'StudentSection',
          targetId: section.id,
        },
      });
      return section;
    } catch {
      throw new ConflictException(
        'A section with this name already exists for this program and year level'
      );
    }
  }

  async updateSection(id: string, input: UpdateSectionDto, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    const existing = await this.prisma.studentSection.findFirst({
      where: { id, institutionId },
    });
    if (!existing) throw new NotFoundException('Section not found');
    try {
      const section = await this.prisma.studentSection.update({
        where: { id },
        data: { name: input.name.trim() },
        include: { _count: { select: { students: true } } },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'STUDENT_SECTION_UPDATED',
          targetType: 'StudentSection',
          targetId: id,
        },
      });
      return section;
    } catch {
      throw new ConflictException(
        'A section with this name already exists for this program and year level'
      );
    }
  }

  async deleteSection(id: string, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    const existing = await this.prisma.studentSection.findFirst({
      where: { id, institutionId },
    });
    if (!existing) throw new NotFoundException('Section not found');
    await this.prisma.$transaction([
      this.prisma.studentSection.delete({ where: { id } }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'STUDENT_SECTION_DELETED',
          targetType: 'StudentSection',
          targetId: id,
        },
      }),
    ]);
    return { deleted: true };
  }

  async transferStudent(
    id: string,
    input: TransferStudentDto,
    actorId: string
  ) {
    const institutionId = await this.institutionFor(actorId);
    const [student, section] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id, institutionId, role: Role.STUDENT },
        select: { id: true },
      }),
      this.prisma.studentSection.findFirst({
        where: {
          id: input.sectionId,
          institutionId,
          program: input.program,
          yearLevel: input.yearLevel,
        },
        select: { id: true },
      }),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!section)
      throw new NotFoundException(
        'Target section does not match the selected program and year level'
      );
    await this.prisma.$transaction([
      this.prisma.studentProfile.update({
        where: { userId: student.id },
        data: {
          program: input.program,
          yearLevel: input.yearLevel,
          sectionId: section.id,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'STUDENT_TRANSFERRED',
          targetType: 'User',
          targetId: student.id,
        },
      }),
    ]);
    return { studentId: student.id, ...input };
  }

  async promoteSection(
    sourceSectionId: string,
    input: PromoteSectionDto,
    actorId: string
  ) {
    const institutionId = await this.institutionFor(actorId);
    const [source, target] = await Promise.all([
      this.prisma.studentSection.findFirst({
        where: { id: sourceSectionId, institutionId },
      }),
      this.prisma.studentSection.findFirst({
        where: { id: input.targetSectionId, institutionId },
      }),
    ]);
    if (!source) throw new NotFoundException('Source section not found');
    if (!target) throw new NotFoundException('Target section not found');
    if (source.id === target.id)
      throw new ConflictException('Choose a different target section');
    const result = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.studentProfile.updateMany({
        where: {
          sectionId: source.id,
          user: { institutionId, role: Role.STUDENT },
          ...(input.studentIds?.length
            ? { userId: { in: input.studentIds } }
            : {}),
        },
        data: {
          program: target.program,
          yearLevel: target.yearLevel,
          sectionId: target.id,
        },
      });
      if (!moved.count)
        throw new ConflictException('No students were eligible for promotion');
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'STUDENT_SECTION_PROMOTED',
          targetType: 'StudentSection',
          targetId: source.id,
        },
      });
      return moved;
    });
    return {
      promoted: result.count,
      sourceSectionId: source.id,
      targetSectionId: target.id,
      program: target.program,
      yearLevel: target.yearLevel,
    };
  }

  async updateStudent(id: string, input: UpdateStudentDto, actorId: string) {
    const institutionId = await this.institutionFor(actorId);
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: Role.STUDENT },
    });

    if (!exists) throw new NotFoundException('Student not found');
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        email: input.email?.toLowerCase(),
        ...(input.profilePicture !== undefined
          ? { profilePicture: input.profilePicture || null }
          : {}),
        ...(input.newPassword
          ? {
              passwordHash: await bcrypt.hash(input.newPassword, 12),
              mustChangePassword: true,
            }
          : {}),
        studentProfile: {
          update: { program: input.program, yearLevel: input.yearLevel },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'STUDENT_ACCOUNT_UPDATED',
        targetType: 'User',
        targetId: id,
      },
    });
    return user;
  }

  async setStudentStatus(
    id: string,
    status: 'ACTIVE' | 'DISABLED',
    actorId: string
  ) {
    const institutionId = await this.institutionFor(actorId);
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: Role.STUDENT },
      select: { id: true, status: true },
    });

    if (!exists) throw new NotFoundException('Student not found');
    if (exists.status === 'PENDING')
      throw new ConflictException(
        'Pending student accounts must be activated before their status can be changed'
      );
    const saved = await this.prisma.user.update({
      where: { id },
      data: { status, isActive: status === 'ACTIVE' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:
          status === 'DISABLED'
            ? 'STUDENT_ACCOUNT_DISABLED'
            : 'STUDENT_ACCOUNT_REACTIVATED',
        targetType: 'User',
        targetId: id,
      },
    });
    return { userId: saved.id, status: saved.status };
  }
}
