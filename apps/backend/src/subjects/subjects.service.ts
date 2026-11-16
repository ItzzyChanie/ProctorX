import { embeddableGoogleFormUrl } from './google-form';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AppPolicyMode,
  AssessmentType,
  ExamSourceType,
  ExamStatus,
  JoinRequestStatus,
  Prisma,
  QuestionType,
  Role,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { runExclusive } from '../common/job-lock';
import {
  CreateExamDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  UpdateExamScheduleDto,
} from './dto/subjects.dto';
import { AiService, QuestionCounts, TargetDifficulty } from '../ai/ai.service';
import {
  buildReviewReport,
  reviewPayload,
  type AiReviewResponse,
  type ReviewedQuestion,
} from './difficulty-review';
import { normalizeQuestion } from './question-rules';
import type { QuestionDto } from './dto/subjects.dto';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { GradingService } from '../sessions/grading.service';
import { QuestionBankItemDto } from './dto/subjects.dto';
import { normalizeQuestions } from './question-rules';

@Injectable()
export class SubjectsService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway,
    private grading: GradingService
  ) {}
  onModuleInit() {
    void this.closeExpiredExamsOnce().catch(() => undefined);
    this.expiryTimer = setInterval(
      () => void this.closeExpiredExamsOnce().catch(() => undefined),
      5_000
    );
  }
  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }
  private async institutionFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institutionId: true },
    });
    if (!user?.institutionId)
      throw new ForbiddenException('Institution is not configured');
    return user.institutionId;
  }
  private closeExpiredExamsOnce() {
    return runExclusive(this.prisma, 'close-expired-exams', () =>
      this.closeExpiredExams()
    );
  }
  private async closeExpiredExams() {
    const now = new Date();
    const candidates = await this.prisma.exam.findMany({
      where: { status: ExamStatus.PUBLISHED, endsAt: { lte: now } },
      select: {
        id: true,
        title: true,
        assessmentType: true,
        endsAt: true,
        studentOverrides: { select: { extraTimeMinutes: true } },
        subject: {
          select: {
            subjectCode: true,
            enrollments: { select: { studentId: true } },
          },
        },
      },
    });
    const expired = candidates.filter((exam) => {
      const maximumExtraMinutes = Math.max(
        0,
        ...exam.studentOverrides.map((item) => item.extraTimeMinutes)
      );
      return (
        !exam.endsAt || +exam.endsAt + maximumExtraMinutes * 60_000 <= +now
      );
    });
    if (!expired.length) return;
    const ids = expired.map(({ id }) => id);
    const notifications = expired.flatMap((exam) =>
      exam.subject.enrollments.map(({ studentId }) => ({
        userId: studentId,
        type: 'ASSESSMENT_ENDED',
        message: `The scheduled ${exam.assessmentType === AssessmentType.QUIZ ? 'quiz' : 'exam'} "${exam.title}" for ${exam.subject.subjectCode} has ended.`,
      }))
    );
    // Grade every unsubmitted attempt from its last saved draft before the
    // exam is archived. Failures stay open and are retried by the grading
    // expiry job, so no attempt is silently closed without a score.
    for (const id of ids) await this.grading.finalizeExam(id);
    await this.prisma.$transaction([
      this.prisma.exam.updateMany({
        where: { id: { in: ids }, status: ExamStatus.PUBLISHED },
        data: { status: ExamStatus.ARCHIVED },
      }),
      this.prisma.recording.updateMany({
        where: { session: { examId: { in: ids } }, status: 'UPLOADING' },
        data: { status: 'COMPLETE' },
      }),
      this.prisma.notification.createMany({ data: notifications }),
    ]);
    ids.forEach((id) => void this.gateway.clearExam(id));
  }
  async create(teacherId: string, dto: CreateSubjectDto) {
    const institutionId = await this.institutionFor(teacherId);
    let subject;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        subject = await this.prisma.subject.create({
          data: {
            code: crypto
              .randomUUID()
              .replaceAll('-', '')
              .slice(0, 8)
              .toUpperCase(),
            subjectCode: dto.subjectCode.trim().toUpperCase(),
            name: dto.name.trim(),
            schedule: dto.schedule.trim(),
            teacherId,
          },
        });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    if (!subject)
      throw new ConflictException('Could not generate a unique subject code');
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'SUBJECT_CREATED',
        targetType: 'Subject',
        targetId: subject.id,
      },
    });
    const deans = await this.prisma.user.findMany({
      where: { institutionId, role: Role.DEAN },
      select: { id: true },
    });
    if (deans.length)
      await this.prisma.notification.createMany({
        data: deans.map(({ id }) => ({
          userId: id,
          type: 'SUBJECT_CREATED',
          message: `A new subject, ${subject.subjectCode} - ${subject.name}, was created.`,
        })),
      });
    return subject;
  }
  async update(subjectId: string, teacherId: string, dto: UpdateSubjectDto) {
    await this.owned(subjectId, teacherId);
    try {
      const subject = await this.prisma.subject.update({
        where: { id: subjectId },
        data: {
          subjectCode: dto.subjectCode.trim().toUpperCase(),
          name: dto.name.trim(),
          schedule: dto.schedule.trim(),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'SUBJECT_UPDATED',
          targetType: 'Subject',
          targetId: subjectId,
        },
      });
      return subject;
    } catch {
      throw new ConflictException('That subject code is already in use');
    }
  }
  async remove(subjectId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const exams = await this.prisma.exam.findMany({
      where: { subjectId },
      select: { id: true },
    });
    exams.forEach((exam) => void this.gateway.clearExam(exam.id));
    await this.prisma.subject.delete({ where: { id: subjectId } });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'SUBJECT_DELETED',
        targetType: 'Subject',
        targetId: subjectId,
      },
    });
    return { deleted: true };
  }
  async requestJoin(code: string, studentId: string) {
    const institutionId = await this.institutionFor(studentId);
    const subject = await this.prisma.subject.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        teacher: { institutionId },
      },
    });
    if (!subject) throw new NotFoundException('No subject matches this code');
    const enrolled = await this.prisma.enrollment.findUnique({
      where: { subjectId_studentId: { subjectId: subject.id, studentId } },
    });
    if (enrolled)
      throw new ConflictException('You are already enrolled in this subject');
    const request = await this.prisma.subjectJoinRequest.upsert({
      where: { subjectId_studentId: { subjectId: subject.id, studentId } },
      create: { subjectId: subject.id, studentId },
      update: {
        status: JoinRequestStatus.PENDING,
        requestedAt: new Date(),
        reviewedAt: null,
        studentHiddenAt: null,
      },
      include: {
        student: { select: { fullName: true } },
        subject: {
          select: {
            code: true,
            name: true,
            teacherId: true,
            teacher: { select: { fullName: true } },
          },
        },
      },
    });
    await this.prisma.notification.create({
      data: {
        userId: request.subject.teacherId,
        type: 'SUBJECT_JOIN_REQUESTED',
        message: `${request.student.fullName} requested to join ${request.subject.name}.`,
      },
    });
    return request;
  }
  studentJoinRequests(studentId: string) {
    return this.prisma.subjectJoinRequest.findMany({
      where: { studentId, studentHiddenAt: null },
      include: {
        subject: {
          select: {
            code: true,
            name: true,
            teacher: { select: { fullName: true } },
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }
  async hideStudentJoinRequest(studentId: string, requestId: string) {
    const request = await this.prisma.subjectJoinRequest.findFirst({
      where: { id: requestId, studentId },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Join request not found');

    return this.prisma.subjectJoinRequest.update({
      where: { id: requestId },
      data: { studentHiddenAt: new Date() },
      select: { id: true },
    });
  }

  pendingJoinRequests(teacherId: string) {
    return this.prisma.subjectJoinRequest.findMany({
      where: { status: JoinRequestStatus.PENDING, subject: { teacherId } },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        student: {
          select: { fullName: true, email: true, studentProfile: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }
  async reviewJoinRequest(
    requestId: string,
    teacherId: string,
    status: 'APPROVED' | 'DECLINED'
  ) {
    const request = await this.prisma.subjectJoinRequest.findUnique({
      where: { id: requestId },
      include: { subject: true },
    });
    if (!request) throw new NotFoundException('Join request not found');
    if (request.subject.teacherId !== teacherId)
      throw new ForbiddenException('You do not own this subject');
    if (request.status !== JoinRequestStatus.PENDING)
      throw new ConflictException('This request has already been reviewed');
    return this.prisma.$transaction(async (tx) => {
      if (status === 'APPROVED')
        await tx.enrollment.upsert({
          where: {
            subjectId_studentId: {
              subjectId: request.subjectId,
              studentId: request.studentId,
            },
          },
          create: {
            subjectId: request.subjectId,
            studentId: request.studentId,
          },
          update: {},
        });
      const updated = await tx.subjectJoinRequest.update({
        where: { id: requestId },
        data: { status: status as JoinRequestStatus, reviewedAt: new Date() },
      });
      await tx.notification.create({
        data: {
          userId: request.studentId,
          type: 'SUBJECT_JOIN_REVIEWED',
          message: `Your request to join ${request.subject.name} was ${status.toLowerCase()}.`,
        },
      });
      return updated;
    });
  }
  async mine(userId: string, role: Role) {
    if (role === Role.TEACHER) {
      const now = new Date();
      const published = await this.prisma.exam.findMany({
        where: { subject: { teacherId: userId }, status: ExamStatus.PUBLISHED },
        select: {
          id: true,
          subject: { select: { enrollments: { select: { studentId: true } } } },
          sessions: { select: { studentId: true, status: true } },
        },
      });
      const completedIds = published
        .filter(
          (exam) =>
            exam.subject.enrollments.length > 0 &&
            exam.subject.enrollments.every((enrollment) =>
              exam.sessions.some(
                (session) =>
                  session.studentId === enrollment.studentId &&
                  session.status === SessionStatus.COMPLETED
              )
            )
        )
        .map((exam) => exam.id);
      await this.prisma.exam.updateMany({
        where: {
          subject: { teacherId: userId },
          status: ExamStatus.PUBLISHED,
          ...(completedIds.length
            ? { id: { in: completedIds } }
            : { id: { in: [] } }),
        },
        data: { status: ExamStatus.ARCHIVED },
      });
      return this.prisma.subject.findMany({
        where: { teacherId: userId },
        include: {
          _count: { select: { enrollments: true, exams: true } },
          exams: {
            where: {
              status: ExamStatus.PUBLISHED,
              OR: [
                { endsAt: null },
                { endsAt: { gt: now } },
                { sessions: { some: { status: SessionStatus.IN_PROGRESS } } },
              ],
            },
            select: {
              id: true,
              title: true,
              version: true,
              assessmentType: true,
              term: true,
              academicPeriod: {
                select: { academicYear: true, semester: true },
              },
              scheduledAt: true,
              endsAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.subject.findMany({
      where: { enrollments: { some: { studentId: userId } } },
      select: {
        id: true,
        code: true,
        subjectCode: true,
        schedule: true,
        name: true,
        teacher: { select: { fullName: true } },
        exams: {
          // Drafts are never shown to students.
          where: { status: { not: ExamStatus.DRAFT } },
          select: {
            assessmentType: true,
            status: true,
            endsAt: true,
            sessions: {
              where: { studentId: userId, status: 'COMPLETED' },
              select: { endedAt: true },
              take: 1,
              orderBy: { endedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  }
  private async owned(subjectId: string, teacherId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    if (subject.teacherId !== teacherId)
      throw new ForbiddenException('You do not own this subject');
    return subject;
  }
  async students(subjectId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const [enrollments, latestExam] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { subjectId },
        select: {
          enrolledAt: true,
          student: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profilePicture: true,
              status: true,
              studentProfile: {
                select: {
                  studentId: true,
                  program: true,
                  yearLevel: true,
                  section: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { student: { fullName: 'asc' } },
      }),
      this.prisma.exam.findFirst({
        where: { subjectId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!latestExam)
      return enrollments.map((row) => ({
        ...row,
        assessmentStatus: 'NOT_TAKEN',
      }));
    const completed = await this.prisma.examSession.findMany({
      where: {
        examId: latestExam.id,
        status: 'COMPLETED',
        studentId: { in: enrollments.map((row) => row.student.id) },
      },
      select: { studentId: true },
    });
    const completedIds = new Set(completed.map((session) => session.studentId));
    return enrollments.map((row) => ({
      ...row,
      assessmentStatus: completedIds.has(row.student.id)
        ? 'TAKEN'
        : 'NOT_TAKEN',
    }));
  }
  async removeStudent(subjectId: string, studentId: string, teacherId: string) {
    const subject = await this.owned(subjectId, teacherId);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { subjectId_studentId: { subjectId, studentId } },
      select: { student: { select: { fullName: true } } },
    });
    if (!enrollment)
      throw new NotFoundException('Student is not enrolled in this subject');
    await this.prisma.$transaction([
      this.prisma.enrollment.delete({
        where: { subjectId_studentId: { subjectId, studentId } },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'STUDENT_REMOVED_FROM_SUBJECT',
          targetType: 'User',
          targetId: studentId,
        },
      }),
      this.prisma.notification.create({
        data: {
          userId: studentId,
          type: 'SUBJECT_ENROLLMENT_REMOVED',
          message: `You were removed from ${subject.subjectCode} - ${subject.name}.`,
        },
      }),
    ]);
    return { deleted: true, studentName: enrollment.student.fullName };
  }
  async sectionAssignments(teacherId: string) {
    const institutionId = await this.institutionFor(teacherId);
    const [subjects, sections] = await Promise.all([
      this.prisma.subject.findMany({
        where: { teacherId },
        select: {
          id: true,
          subjectCode: true,
          name: true,
          schedule: true,
          sectionAssignments: {
            include: {
              section: { include: { _count: { select: { students: true } } } },
            },
          },
          _count: { select: { enrollments: true } },
        },
        orderBy: { subjectCode: 'asc' },
      }),
      this.prisma.studentSection.findMany({
        where: { institutionId },
        include: { _count: { select: { students: true } } },
        orderBy: [{ program: 'asc' }, { yearLevel: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return { subjects, sections };
  }
  async assignSection(
    subjectId: string,
    sectionId: string,
    enrollStudents: boolean,
    teacherId: string
  ) {
    await this.owned(subjectId, teacherId);
    const institutionId = await this.institutionFor(teacherId);
    const section = await this.prisma.studentSection.findFirst({
      where: { id: sectionId, institutionId },
      include: { students: { select: { userId: true } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.subjectSection.upsert({
        where: { subjectId_sectionId: { subjectId, sectionId } },
        create: { subjectId, sectionId },
        update: {},
      });
      if (enrollStudents && section.students.length)
        await tx.enrollment.createMany({
          data: section.students.map(({ userId }) => ({
            subjectId,
            studentId: userId,
          })),
          skipDuplicates: true,
        });
      return assignment;
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'SECTION_ASSIGNED_TO_SUBJECT',
        targetType: 'StudentSection',
        targetId: sectionId,
      },
    });
    return {
      assignment: result,
      enrolledCount: enrollStudents ? section.students.length : 0,
    };
  }
  async unassignSection(
    subjectId: string,
    sectionId: string,
    teacherId: string
  ) {
    await this.owned(subjectId, teacherId);
    const result = await this.prisma.subjectSection.deleteMany({
      where: { subjectId, sectionId },
    });
    if (!result.count)
      throw new NotFoundException('Section assignment not found');
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'SECTION_REMOVED_FROM_SUBJECT',
        targetType: 'StudentSection',
        targetId: sectionId,
      },
    });
    return { deleted: true };
  }
  async generateQuestions(
    subjectId: string,
    teacherId: string,
    files: Express.Multer.File[],
    counts: QuestionCounts,
    difficulty: TargetDifficulty = 'MIXED'
  ) {
    await this.owned(subjectId, teacherId);
    const generated = await this.ai.generateQuestions(files, counts, difficulty);
    return {
      ...generated,
      questions: (generated.questions ?? []).map((question: any) => {
        if (question.type !== 'MULTIPLE_CHOICE' || !question.options?.length)
          return question;
        const options = [...question.options];
        for (let index = options.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [options[index], options[swapIndex]] = [
            options[swapIndex],
            options[index],
          ];
        }
        // AI providers commonly put the correct suggestion first. If a random
        // shuffle leaves it there, move it so a generated draft never teaches
        // students that A is predictably correct.
        if (
          options.length > 1 &&
          options[0]?.isCorrect &&
          options.some((option: any) => !option.isCorrect)
        ) {
          const nonCorrectIndexes = options
            .map((option: any, index: number) => ({ option, index }))
            .filter(({ option }: any) => !option.isCorrect)
            .map(({ index }: any) => index);
          const swapIndex =
            nonCorrectIndexes[
              Math.floor(Math.random() * nonCorrectIndexes.length)
            ];
          [options[0], options[swapIndex]] = [options[swapIndex], options[0]];
        }
        return { ...question, options };
      }),
    };
  }
  async availableStudents(subjectId: string, teacherId: string, search = '') {
    await this.owned(subjectId, teacherId);
    const institutionId = await this.institutionFor(teacherId);
    return this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        institutionId,
        enrollments: { none: { subjectId } },
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          {
            studentProfile: {
              is: { studentId: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        studentProfile: {
          select: { studentId: true, program: true, yearLevel: true },
        },
      },
      take: 50,
      orderBy: { fullName: 'asc' },
    });
  }
  async enroll(subjectId: string, studentId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const institutionId = await this.institutionFor(teacherId);
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, institutionId, role: Role.STUDENT },
    });
    if (!student) throw new NotFoundException('Student not found');
    try {
      return await this.prisma.enrollment.create({
        data: { subjectId, studentId },
      });
    } catch {
      throw new ConflictException('Student is already enrolled');
    }
  }

  async questionBank(
    teacherId: string,
    filters: {
      search?: string;
      subjectId?: string;
      topic?: string;
      difficulty?: string;
      archive?: string;
      includeGrouped?: string;
    }
  ) {
    return this.prisma.questionBankItem.findMany({
      where: {
        teacherId,
        archivedAt: filters.archive === 'archived' ? { not: null } : null,
        ...(filters.includeGrouped === 'true' ? {} : { sourceExamId: null }),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.topic ? { topics: { has: filters.topic } } : {}),
        ...(filters.difficulty
          ? { difficulty: filters.difficulty as any }
          : {}),
        ...(filters.search
          ? {
              OR: [
                {
                  prompt: {
                    contains: filters.search,
                    mode: 'insensitive' as const,
                  },
                },
                { topics: { has: filters.search } },
              ],
            }
          : {}),
      },
      include: {
        subject: { select: { id: true, subjectCode: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async questionBankExamGroups(teacherId: string, archived: boolean) {
    const rows = await this.prisma.questionBankItem.findMany({
      where: {
        teacherId,
        sourceExamId: { not: null },
        archivedAt: archived ? { not: null } : null,
      },
      select: {
        sourceExamId: true,
        createdAt: true,
        sourceExam: {
          select: {
            id: true,
            title: true,
            version: true,
            status: true,
            subject: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const groups = new Map<
      string,
      {
        examId: string;
        title: string;
        version: number;
        status: string;
        subject: { code: string; name: string };
        questionCount: number;
        importedAt: Date;
      }
    >();
    rows.forEach((row) => {
      if (!row.sourceExamId || !row.sourceExam) return;
      const existing = groups.get(row.sourceExamId);
      if (existing) existing.questionCount += 1;
      else
        groups.set(row.sourceExamId, {
          examId: row.sourceExamId,
          title: row.sourceExam.title,
          version: row.sourceExam.version,
          status: row.sourceExam.status,
          subject: row.sourceExam.subject,
          questionCount: 1,
          importedAt: row.createdAt,
        });
    });
    return [...groups.values()];
  }

  async questionBankExamItems(
    examId: string,
    teacherId: string,
    archived: boolean
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      select: { id: true },
    });
    if (!exam)
      throw new NotFoundException('Imported exam questionnaire not found');
    return this.prisma.questionBankItem.findMany({
      where: {
        teacherId,
        sourceExamId: examId,
        archivedAt: archived ? { not: null } : null,
      },
      include: {
        subject: { select: { id: true, subjectCode: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async archiveQuestionBankExam(examId: string, teacherId: string) {
    const result = await this.prisma.questionBankItem.updateMany({
      where: { teacherId, sourceExamId: examId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Imported exam questionnaire not found');
    return { archived: true, count: result.count };
  }

  async restoreQuestionBankExam(examId: string, teacherId: string) {
    const result = await this.prisma.questionBankItem.updateMany({
      where: { teacherId, sourceExamId: examId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (!result.count)
      throw new NotFoundException('Archived exam questionnaire not found');
    return { restored: true, count: result.count };
  }

  private async validateBankSubject(
    subjectId: string | undefined,
    teacherId: string
  ) {
    if (subjectId) await this.owned(subjectId, teacherId);
  }

  private validateBankItem(dto: QuestionBankItemDto) {
    if (
      dto.type === 'MULTIPLE_CHOICE' &&
      (!dto.options ||
        dto.options.length < 2 ||
        dto.options.filter((option) => option.isCorrect).length !== 1)
    )
      throw new BadRequestException(
        'Multiple-choice bank questions need at least two options and exactly one correct answer'
      );
    if (
      dto.type === 'IDENTIFICATION' &&
      (typeof dto.correctAnswer !== 'string' || !dto.correctAnswer.trim())
    )
      throw new BadRequestException(
        'Identification questions need a correct answer'
      );
    if (
      dto.type === 'ENUMERATION' &&
      (!Array.isArray(dto.correctAnswer) ||
        !dto.correctAnswer.some((answer) => String(answer).trim()))
    )
      throw new BadRequestException(
        'Enumeration questions need accepted answers'
      );
    if (dto.type === 'ESSAY' && !dto.rubric?.trim())
      throw new BadRequestException('Essay questions need a rubric');
  }

  async createBankItem(teacherId: string, dto: QuestionBankItemDto) {
    await this.validateBankSubject(dto.subjectId, teacherId);
    this.validateBankItem(dto);
    return this.prisma.questionBankItem.create({
      data: {
        teacherId,
        subjectId: dto.subjectId,
        type: dto.type as QuestionType,
        prompt: dto.prompt.trim(),
        points: dto.points,
        isRequired: dto.isRequired,
        correctAnswer: dto.correctAnswer as any,
        rubric: dto.rubric?.trim(),
        options: dto.options as any,
        topics: [
          ...new Set(dto.topics.map((topic) => topic.trim()).filter(Boolean)),
        ],
        difficulty: dto.difficulty,
      },
    });
  }

  async updateBankItem(
    itemId: string,
    teacherId: string,
    dto: QuestionBankItemDto
  ) {
    const item = await this.prisma.questionBankItem.findFirst({
      where: { id: itemId, teacherId, archivedAt: null },
    });
    if (!item) throw new NotFoundException('Question bank item not found');
    await this.validateBankSubject(dto.subjectId, teacherId);
    this.validateBankItem(dto);
    return this.prisma.questionBankItem.update({
      where: { id: itemId },
      data: {
        subjectId: dto.subjectId ?? null,
        type: dto.type as QuestionType,
        prompt: dto.prompt.trim(),
        points: dto.points,
        isRequired: dto.isRequired,
        correctAnswer: dto.correctAnswer as any,
        rubric: dto.rubric?.trim() || null,
        options: dto.options as any,
        topics: [
          ...new Set(dto.topics.map((topic) => topic.trim()).filter(Boolean)),
        ],
        difficulty: dto.difficulty,
      },
    });
  }

  async archiveBankItem(itemId: string, teacherId: string) {
    const result = await this.prisma.questionBankItem.updateMany({
      where: { id: itemId, teacherId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Question bank item not found');
    return { archived: true };
  }

  async importQuestionBankDocument(
    teacherId: string,
    subjectId: string,
    file: Express.Multer.File,
    counts: QuestionCounts
  ) {
    const generated = await this.generateQuestions(
      subjectId,
      teacherId,
      [file],
      counts
    );
    const questions = generated.questions ?? [];
    if (!questions.length)
      throw new BadRequestException(
        'No questions could be generated from the document'
      );
    await this.prisma.questionBankItem.createMany({
      data: questions.map((question: any) => ({
        teacherId,
        subjectId,
        type: question.type as QuestionType,
        prompt: String(question.prompt).trim(),
        points: Number(question.points) || 1,
        isRequired: question.isRequired !== false,
        correctAnswer:
          question.type === 'ENUMERATION'
            ? question.answers
            : question.type === 'IDENTIFICATION'
              ? question.answers?.[0]
              : undefined,
        rubric: question.type === 'ESSAY' ? question.rubric : undefined,
        options:
          question.type === 'MULTIPLE_CHOICE' ? question.options : undefined,
        topics: [],
        difficulty: 'MEDIUM',
        source: ExamSourceType.AI_GENERATED,
      })),
    });
    return { imported: questions.length };
  }

  async importExamToQuestionBank(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      include: { questions: { include: { options: true } } },
    });
    if (!exam) throw new NotFoundException('Previous exam not found');
    if (!exam.questions.length) return { imported: 0 };
    const existing = await this.prisma.questionBankItem.count({
      where: { teacherId, sourceExamId: examId },
    });
    if (existing)
      throw new ConflictException(
        'This exam questionnaire is already in the question bank'
      );
    await this.prisma.questionBankItem.createMany({
      data: exam.questions.map((question) => ({
        teacherId,
        subjectId: exam.subjectId,
        sourceExamId: exam.id,
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        isRequired: question.isRequired,
        correctAnswer: question.correctAnswer ?? undefined,
        rubric: question.rubric,
        options: question.options as any,
        topics: [],
        difficulty: 'MEDIUM',
        source: question.source,
      })),
    });
    return { imported: exam.questions.length };
  }

  async examCopy(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!exam) throw new NotFoundException('Previous exam not found');
    return exam;
  }

  async examVersions(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      select: { versionGroupId: true },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return this.prisma.exam.findMany({
      where: { versionGroupId: exam.versionGroupId },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        _count: { select: { questions: true, sessions: true } },
      },
      orderBy: { version: 'desc' },
    });
  }
  /** Validates everything shared by creating, editing and publishing an exam. */
  private async examContent(
    subjectId: string,
    teacherId: string,
    dto: CreateExamDto
  ) {
    const institutionId = await this.institutionFor(teacherId);
    const academicPeriod = await this.prisma.academicPeriod.findFirst({
      where: { id: dto.academicPeriodId, institutionId },
    });
    if (!academicPeriod)
      throw new NotFoundException('Academic period not found');
    if (academicPeriod.status !== 'ACTIVE')
      throw new ConflictException(
        'Assessments cannot be created in a closed semester'
      );
    const sourceType = dto.sourceType ?? 'MANUAL';
    const questions = dto.questions ?? [];
    if (sourceType !== 'GOOGLE_FORMS_IMPORT' && questions.length === 0)
      throw new ConflictException('At least one question is required');
    if (sourceType === 'GOOGLE_FORMS_IMPORT' && !dto.externalFormUrl)
      throw new ConflictException('Google Form link is required');
    if (
      dto.scheduledAt &&
      dto.endsAt &&
      new Date(dto.endsAt) <= new Date(dto.scheduledAt)
    )
      throw new ConflictException('End time must be after start time');
    const normalized = normalizeQuestions(
      sourceType === 'GOOGLE_FORMS_IMPORT' ? [] : questions
    );
    return {
      fields: {
        academicPeriodId: dto.academicPeriodId,
        term: dto.term,
        assessmentType: dto.assessmentType as AssessmentType,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim(),
        totalPoints: normalized.totalPoints,
        durationMinutes: dto.durationMinutes,
        requireCamera: dto.requireCamera,
        requireMicrophone: dto.requireMicrophone,
        appPolicyMode: dto.appPolicyMode as AppPolicyMode,
        appPolicyList: dto.appPolicyList,
        randomizeQuestions: dto.randomizeQuestions ?? false,
        randomizeOptions: dto.randomizeOptions ?? false,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        sourceType: sourceType as ExamSourceType,
        externalFormUrl:
          sourceType === 'GOOGLE_FORMS_IMPORT'
            ? await embeddableGoogleFormUrl(dto.externalFormUrl!)
            : null,
        ...(dto.sourceText !== undefined
          ? { sourceText: dto.sourceText || null }
          : {}),
      },
      questions: normalized.create.map((question) => ({
        ...question,
        source:
          sourceType === 'AI_GENERATED' && question.sourceReference
            ? ExamSourceType.AI_GENERATED
            : ExamSourceType.MANUAL,
      })),
    };
  }

  /** Only one published, not-yet-ended exam or quiz per subject at a time. */
  private async assertNoActiveExam(subjectId: string, exceptExamId?: string) {
    const now = new Date();
    await this.prisma.exam.updateMany({
      where: { subjectId, status: ExamStatus.PUBLISHED, endsAt: { lte: now } },
      data: { status: ExamStatus.ARCHIVED },
    });
    const activeExam = await this.prisma.exam.findFirst({
      where: {
        subjectId,
        status: ExamStatus.PUBLISHED,
        ...(exceptExamId ? { id: { not: exceptExamId } } : {}),
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
    if (activeExam)
      throw new ConflictException(
        'Stop or cancel the current scheduled exam or quiz before publishing another one'
      );
  }

  private async notifyExamPublished(
    subject: { subjectCode: string | null; name: string },
    subjectId: string,
    exam: {
      title: string;
      assessmentType: AssessmentType;
      scheduledAt: Date | null;
    }
  ) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId },
      select: { studentId: true },
    });
    if (!enrollments.length) return;
    const kind = exam.assessmentType === AssessmentType.QUIZ ? 'Quiz' : 'Exam';
    await this.prisma.notification.createMany({
      data: enrollments.map(({ studentId }) => ({
        userId: studentId,
        type: 'ASSESSMENT_CREATED',
        message:
          exam.scheduledAt && exam.scheduledAt > new Date()
            ? `${kind} "${exam.title}" for ${subject.subjectCode ?? subject.name} is scheduled for ${exam.scheduledAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : `${kind} "${exam.title}" is now available for ${subject.subjectCode ?? subject.name}.`,
      })),
    });
  }

  /**
   * Creates an exam. With `publish: false` it is saved as a DRAFT: invisible
   * to students, editable, and reviewable (AI difficulty review) before the
   * teacher publishes it.
   */
  async createExam(subjectId: string, teacherId: string, dto: CreateExamDto) {
    const subject = await this.owned(subjectId, teacherId);
    const publish = dto.publish ?? true;
    const content = await this.examContent(subjectId, teacherId, dto);
    if (publish) await this.assertNoActiveExam(subjectId);
    const versionSource = dto.sourceExamId
      ? await this.prisma.exam.findFirst({
          where: { id: dto.sourceExamId, subjectId, subject: { teacherId } },
          select: { versionGroupId: true },
        })
      : null;
    if (dto.sourceExamId && !versionSource)
      throw new NotFoundException('Source exam version not found');
    const nextVersion = versionSource
      ? ((
          await this.prisma.exam.aggregate({
            where: { versionGroupId: versionSource.versionGroupId },
            _max: { version: true },
          })
        )._max.version ?? 0) + 1
      : 1;
    const exam = await this.prisma.exam.create({
      data: {
        subjectId,
        ...content.fields,
        roomCode: crypto
          .randomUUID()
          .replaceAll('-', '')
          .slice(0, 8)
          .toUpperCase(),
        status: publish ? ExamStatus.PUBLISHED : ExamStatus.DRAFT,
        publishedAt: publish ? new Date() : null,
        versionGroupId: versionSource?.versionGroupId,
        version: nextVersion,
        questions: { create: content.questions },
      },
      include: { questions: { include: { options: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: publish ? 'EXAM_CREATED' : 'EXAM_DRAFT_CREATED',
        targetType: 'Exam',
        targetId: exam.id,
      },
    });
    if (publish) await this.notifyExamPublished(subject, subjectId, exam);
    return exam;
  }

  private async ownedDraft(subjectId: string, examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subjectId, subject: { teacherId } },
    });
    if (!exam) throw new NotFoundException('Assessment not found');
    if (exam.status !== ExamStatus.DRAFT)
      throw new ConflictException(
        'Only drafts can be edited. Published assessments are locked; create a new version instead.'
      );
    return exam;
  }

  /** Replaces a draft's settings and questions (the AI review is cleared). */
  async updateDraft(
    subjectId: string,
    examId: string,
    teacherId: string,
    dto: CreateExamDto
  ) {
    await this.owned(subjectId, teacherId);
    await this.ownedDraft(subjectId, examId, teacherId);
    const content = await this.examContent(subjectId, teacherId, dto);
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { examId } });
      return tx.exam.update({
        where: { id: examId },
        data: {
          ...content.fields,
          // Questions changed, so a previous review no longer applies.
          aiReview: Prisma.DbNull,
          aiReviewedAt: null,
          questions: { create: content.questions },
        },
        include: {
          questions: { include: { options: true }, orderBy: { order: 'asc' } },
        },
      });
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_DRAFT_UPDATED',
        targetType: 'Exam',
        targetId: examId,
      },
    });
    return saved;
  }

  /** Publishes a draft: students can see and join it from now on. */
  async publishDraft(subjectId: string, examId: string, teacherId: string) {
    const subject = await this.owned(subjectId, teacherId);
    const draft = await this.ownedDraft(subjectId, examId, teacherId);
    const period = await this.prisma.academicPeriod.findUnique({
      where: { id: draft.academicPeriodId },
      select: { status: true },
    });
    if (period?.status !== 'ACTIVE')
      throw new ConflictException(
        'Assessments cannot be published in a closed semester'
      );
    if (draft.endsAt && draft.endsAt <= new Date())
      throw new ConflictException(
        'The scheduled end time has already passed. Update the schedule before publishing.'
      );
    const questionCount = await this.prisma.question.count({
      where: { examId },
    });
    if (draft.sourceType !== ExamSourceType.GOOGLE_FORMS_IMPORT && !questionCount)
      throw new ConflictException('At least one question is required');
    await this.assertNoActiveExam(subjectId, examId);
    const exam = await this.prisma.exam.update({
      where: { id: examId },
      data: { status: ExamStatus.PUBLISHED, publishedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_PUBLISHED',
        targetType: 'Exam',
        targetId: examId,
        metadata: { aiReviewed: Boolean(draft.aiReviewedAt) },
      },
    });
    await this.notifyExamPublished(subject, subjectId, exam);
    return exam;
  }

  /**
   * Runs the advisory AI difficulty review on a saved draft and stores the
   * report with it. The teacher decides what to change; nothing is altered.
   */
  async reviewDraft(subjectId: string, examId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const draft = await this.ownedDraft(subjectId, examId, teacherId);
    const questions = (await this.prisma.question.findMany({
      where: { examId },
      include: { options: true },
      orderBy: { order: 'asc' },
    })) as unknown as ReviewedQuestion[];
    if (!questions.length)
      throw new ConflictException('Add questions before running the AI review');
    const ai = (await this.ai.reviewQuestions(
      reviewPayload(draft, questions)
    )) as AiReviewResponse;
    const report = buildReviewReport(questions, ai, draft.durationMinutes);
    await this.prisma.exam.update({
      where: { id: examId },
      data: {
        aiReview: report as unknown as Prisma.InputJsonValue,
        aiReviewedAt: new Date(report.generatedAt),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_AI_REVIEWED',
        targetType: 'Exam',
        targetId: examId,
        metadata: {
          questions: report.summary.total,
          mismatches: report.summary.mismatches,
          issues: report.summary.issues,
        },
      },
    });
    return report;
  }

  /** Rewrites one draft question at the teacher's chosen difficulty. */
  async rewriteDraftQuestion(
    subjectId: string,
    examId: string,
    teacherId: string,
    input: { question: QuestionDto; targetDifficulty: 'EASY' | 'MEDIUM' | 'HARD'; reason?: string }
  ) {
    await this.owned(subjectId, teacherId);
    const draft = await this.ownedDraft(subjectId, examId, teacherId);
    // Validates the question the same way saving it would.
    const question = normalizeQuestion(input.question, 0);
    const rewritten = await this.ai.rewriteQuestion({
      question: {
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        answers: Array.isArray(question.correctAnswer) ? question.correctAnswer : [],
        options: input.question.options ?? [],
        rubric: question.rubric ?? '',
      },
      target_difficulty: input.targetDifficulty,
      reason: input.reason ?? '',
      source_text: draft.sourceText ?? '',
    });
    return { ...rewritten, points: question.points, difficulty: input.targetDifficulty };
  }

  async deleteDraft(subjectId: string, examId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    await this.ownedDraft(subjectId, examId, teacherId);
    await this.prisma.exam.delete({ where: { id: examId } });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_DRAFT_DELETED',
        targetType: 'Exam',
        targetId: examId,
      },
    });
    return { deleted: true };
  }
  async updateExamSchedule(
    subjectId: string,
    examId: string,
    teacherId: string,
    input: UpdateExamScheduleDto
  ) {
    const subject = await this.owned(subjectId, teacherId);
    const scheduledAt = new Date(input.scheduledAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= scheduledAt)
      throw new ConflictException('End time must be after the scheduled start');
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subjectId },
    });
    if (!exam) throw new NotFoundException('Assessment not found');
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId },
      select: { studentId: true },
    });
    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: {
          scheduledAt,
          endsAt,
          durationMinutes: Math.max(
            1,
            Math.round((+endsAt - +scheduledAt) / 60000)
          ),
        },
      });
      if (enrollments.length)
        await tx.notification.createMany({
          data: enrollments.map(({ studentId }) => ({
            userId: studentId,
            type: 'ASSESSMENT_SCHEDULE_CHANGED',
            message: `The schedule for ${exam.title} in ${subject.subjectCode ?? subject.name} changed to ${scheduledAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`,
            link: '/student/calendar',
          })),
        });
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'EXAM_SCHEDULE_UPDATED',
          targetType: 'Exam',
          targetId: examId,
          metadata: { scheduledAt, endsAt },
        },
      });
      return updated;
    });
    return saved;
  }

  async stopExam(subjectId: string, examId: string, teacherId: string) {
    const subject = await this.owned(subjectId, teacherId);
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subjectId },
      include: {
        subject: { select: { enrollments: { select: { studentId: true } } } },
        sessions: { select: { studentId: true, status: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam or quiz not found');
    const endedAt = new Date();
    const naturallyEnded =
      exam.status !== ExamStatus.PUBLISHED ||
      (!!exam.endsAt && exam.endsAt <= endedAt) ||
      (exam.subject.enrollments.length > 0 &&
        exam.subject.enrollments.every((enrollment) =>
          exam.sessions.some(
            (session) =>
              session.studentId === enrollment.studentId &&
              session.status === SessionStatus.COMPLETED
          )
        ));
    if (naturallyEnded) {
      if (exam.status === ExamStatus.PUBLISHED)
        await this.prisma.exam.update({
          where: { id: examId },
          data: { status: ExamStatus.ARCHIVED },
        });
      await this.grading.finalizeExam(examId);
      return { ...exam, status: ExamStatus.ARCHIVED, alreadyInactive: true };
    }
    const stopped = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.ARCHIVED, endsAt: endedAt },
      });
      await tx.recording.updateMany({
        where: { session: { examId }, status: 'UPLOADING' },
        data: { status: 'COMPLETE' },
      });
      const enrollments = await tx.enrollment.findMany({
        where: { subjectId },
        select: { studentId: true },
      });
      if (enrollments.length)
        await tx.notification.createMany({
          data: enrollments.map(({ studentId }) => ({
            userId: studentId,
            type: 'ASSESSMENT_ENDED',
            message: `Your teacher ended the ${exam.assessmentType === AssessmentType.QUIZ ? 'quiz' : 'exam'} "${exam.title}" for ${subject.subjectCode}.`,
          })),
        });
      return saved;
    });
    // Grade each open attempt from its last saved draft (H1).
    await this.grading.finalizeExam(examId);
    void this.gateway.clearExam(examId);
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_STOPPED',
        targetType: 'Exam',
        targetId: examId,
      },
    });
    return stopped;
  }
  async exams(subjectId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    return this.prisma.exam.findMany({
      where: { subjectId },
      // The source text and AI report can be large; load them per exam.
      omit: { sourceText: true, aiReview: true },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
