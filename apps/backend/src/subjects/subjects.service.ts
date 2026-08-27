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
  QuestionType,
  Role,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExamDto,
  CreateSubjectDto,
  UpdateSubjectDto,
} from './dto/subjects.dto';
import { AiService, QuestionCounts } from '../ai/ai.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

@Injectable()
export class SubjectsService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway
  ) {}
  onModuleInit() {
    void this.closeExpiredExams().catch(() => undefined);
    this.expiryTimer = setInterval(
      () => void this.closeExpiredExams().catch(() => undefined),
      5_000
    );
  }
  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }
  private async closeExpiredExams() {
    const expired = await this.prisma.exam.findMany({
      where: { status: ExamStatus.PUBLISHED, endsAt: { lte: new Date() } },
      select: {
        id: true,
        title: true,
        assessmentType: true,
        subject: {
          select: {
            subjectCode: true,
            enrollments: { select: { studentId: true } },
          },
        },
      },
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
    const endedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.exam.updateMany({
        where: { id: { in: ids }, status: ExamStatus.PUBLISHED },
        data: { status: ExamStatus.ARCHIVED },
      }),
      this.prisma.examSession.updateMany({
        where: { examId: { in: ids }, status: SessionStatus.IN_PROGRESS },
        data: { status: SessionStatus.COMPLETED, endedAt },
      }),
      this.prisma.recording.updateMany({
        where: { session: { examId: { in: ids } }, status: 'UPLOADING' },
        data: { status: 'COMPLETE' },
      }),
      this.prisma.notification.createMany({ data: notifications }),
    ]);
    ids.forEach((id) => this.gateway.clearExam(id));
  }
  private googleFormUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new BadRequestException('Enter a valid Google Form URL');
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'docs.google.com' ||
      !url.pathname.startsWith('/forms/')
    )
      throw new BadRequestException(
        'Only https://docs.google.com/forms links can be embedded'
      );
    if (url.pathname.endsWith('/edit'))
      url.pathname = `${url.pathname.slice(0, -5)}/viewform`;
    url.searchParams.set('embedded', 'true');
    return url.toString();
  }
  async create(teacherId: string, dto: CreateSubjectDto) {
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
      where: { role: Role.DEAN },
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
    exams.forEach((exam) => this.gateway.clearExam(exam.id));
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
    const subject = await this.prisma.subject.findUnique({
      where: { code: code.trim().toUpperCase() },
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
      where: { studentId },
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
      await this.prisma.exam.updateMany({
        where: {
          subject: { teacherId: userId },
          status: ExamStatus.PUBLISHED,
          endsAt: { lte: now },
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
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
            select: {
              id: true,
              title: true,
              assessmentType: true,
              term: true,
              academicPeriod: { select: { academicYear: true, semester: true } },
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
                select: { studentId: true, program: true, yearLevel: true, section: { select: { id: true, name: true } } },
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
    const [subjects, sections] = await Promise.all([
      this.prisma.subject.findMany({
        where: { teacherId },
        select: {
          id: true, subjectCode: true, name: true, schedule: true,
          sectionAssignments: { include: { section: { include: { _count: { select: { students: true } } } } } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { subjectCode: 'asc' },
      }),
      this.prisma.studentSection.findMany({
        include: { _count: { select: { students: true } } },
        orderBy: [{ program: 'asc' }, { yearLevel: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return { subjects, sections };
  }
  async assignSection(subjectId: string, sectionId: string, enrollStudents: boolean, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const section = await this.prisma.studentSection.findUnique({
      where: { id: sectionId }, include: { students: { select: { userId: true } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.subjectSection.upsert({
        where: { subjectId_sectionId: { subjectId, sectionId } },
        create: { subjectId, sectionId }, update: {},
      });
      if (enrollStudents && section.students.length)
        await tx.enrollment.createMany({
          data: section.students.map(({ userId }) => ({ subjectId, studentId: userId })),
          skipDuplicates: true,
        });
      return assignment;
    });
    await this.prisma.auditLog.create({ data: { actorId: teacherId, action: 'SECTION_ASSIGNED_TO_SUBJECT', targetType: 'StudentSection', targetId: sectionId } });
    return { assignment: result, enrolledCount: enrollStudents ? section.students.length : 0 };
  }
  async unassignSection(subjectId: string, sectionId: string, teacherId: string) {
    await this.owned(subjectId, teacherId);
    const result = await this.prisma.subjectSection.deleteMany({ where: { subjectId, sectionId } });
    if (!result.count) throw new NotFoundException('Section assignment not found');
    await this.prisma.auditLog.create({ data: { actorId: teacherId, action: 'SECTION_REMOVED_FROM_SUBJECT', targetType: 'StudentSection', targetId: sectionId } });
    return { deleted: true };
  }
  async generateQuestions(
    subjectId: string,
    teacherId: string,
    file: Express.Multer.File,
    counts: QuestionCounts
  ) {
    await this.owned(subjectId, teacherId);
    return this.ai.generateQuestions(file, counts);
  }
  async availableStudents(subjectId: string, teacherId: string, search = '') {
    await this.owned(subjectId, teacherId);
    return this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
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
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: Role.STUDENT },
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
  async createExam(subjectId: string, teacherId: string, dto: CreateExamDto) {
    const subject = await this.owned(subjectId, teacherId);
    const academicPeriod = await this.prisma.academicPeriod.findUnique({
      where: { id: dto.academicPeriodId },
    });
    if (!academicPeriod)
      throw new NotFoundException('Academic period not found');
    if (academicPeriod.status !== 'ACTIVE')
      throw new ConflictException(
        'Assessments cannot be created in a closed semester'
      );
    const now = new Date();
    await this.prisma.exam.updateMany({
      where: { subjectId, status: ExamStatus.PUBLISHED, endsAt: { lte: now } },
      data: { status: ExamStatus.ARCHIVED },
    });
    const activeExam = await this.prisma.exam.findFirst({
      where: {
        subjectId,
        status: ExamStatus.PUBLISHED,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
    if (activeExam)
      throw new ConflictException(
        'Stop the active exam or quiz before creating another one'
      );
    const questions = dto.questions ?? [];
    const sourceType = dto.sourceType ?? 'MANUAL';
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
    for (const question of questions) {
      if (
        question.type === 'MULTIPLE_CHOICE' &&
        (!question.options?.length ||
          !question.options.some((option) => option.isCorrect))
      )
        throw new ConflictException(
          'Multiple-choice questions need options and one correct answer'
        );
      if (
        (question.type === 'ENUMERATION' ||
          question.type === 'IDENTIFICATION') &&
        !question.correctAnswer
      )
        throw new ConflictException(
          'This question type requires a correct answer'
        );
    }
    const exam = await this.prisma.$transaction(async (tx) => {
      return tx.exam.create({
        data: {
          subjectId,
          academicPeriodId: dto.academicPeriodId,
          term: dto.term,
          assessmentType: dto.assessmentType as AssessmentType,
          title: dto.title.trim(),
          instructions: dto.instructions?.trim(),
          totalPoints: questions.reduce(
            (sum, question) => sum + question.points,
            0
          ),
          durationMinutes: dto.durationMinutes,
          roomCode: crypto
            .randomUUID()
            .replaceAll('-', '')
            .slice(0, 8)
            .toUpperCase(),
          requireCamera: dto.requireCamera,
          requireMicrophone: dto.requireMicrophone,
          appPolicyMode: dto.appPolicyMode as AppPolicyMode,
          appPolicyList: dto.appPolicyList,
          status: ExamStatus.PUBLISHED,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          sourceType: sourceType as ExamSourceType,
          externalFormUrl:
            sourceType === 'GOOGLE_FORMS_IMPORT'
              ? this.googleFormUrl(dto.externalFormUrl!)
              : null,
          questions: {
            create: questions.map((question, index) => ({
              type: question.type as QuestionType,
              order: index + 1,
              points: question.points,
              prompt: question.prompt.trim(),
              isRequired: question.isRequired,
              correctAnswer:
                question.type === 'MULTIPLE_CHOICE' || question.type === 'ESSAY'
                  ? undefined
                  : question.type === 'ENUMERATION'
                    ? JSON.parse(question.correctAnswer!)
                    : question.correctAnswer!,
              rubric: question.rubric?.trim(),
              options:
                question.type === 'MULTIPLE_CHOICE'
                  ? { create: question.options }
                  : undefined,
            })),
          },
        },
        include: { questions: { include: { options: true } } },
      });
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_CREATED',
        targetType: 'Exam',
        targetId: exam.id,
      },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId },
      select: { studentId: true },
    });
    if (enrollments.length)
      await this.prisma.notification.createMany({
        data: enrollments.map(({ studentId }) => ({
          userId: studentId,
          type: 'ASSESSMENT_CREATED',
          message: `${exam.assessmentType === AssessmentType.QUIZ ? 'Quiz' : 'Exam'} "${exam.title}" is now available for ${subject.subjectCode ?? subject.name}.`,
        })),
      });
    return exam;
  }
  async stopExam(subjectId: string, examId: string, teacherId: string) {
    const subject = await this.owned(subjectId, teacherId);
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subjectId },
    });
    if (!exam) throw new NotFoundException('Exam or quiz not found');
    if (exam.status !== ExamStatus.PUBLISHED)
      throw new ConflictException('This exam or quiz is already inactive');
    const endedAt = new Date();
    const stopped = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.ARCHIVED, endsAt: endedAt },
      });
      await tx.examSession.updateMany({
        where: { examId, status: SessionStatus.IN_PROGRESS },
        data: { status: SessionStatus.COMPLETED, endedAt },
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
    this.gateway.clearExam(examId);
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
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
