import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  EvidenceClipPhase,
  EvidenceClipStatus,
  GradeStatus,
  Prisma,
  ProctorReviewDecision,
  Role,
  SessionStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { AvatarsService } from '../avatars/avatars.service';
import { resultsReleased, studentGradeStatus } from './result-release';
import { generateDefaultPassword } from '../users/import/password.util';
import { ROLE_DEFAULT_PERMISSIONS } from '../common/constants/role-permissions';
import {
  CreateDepartmentDto,
  CreateAcademicPeriodDto,
  InviteProfessorDto,
  SetPermissionOverrideDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
} from './dto/portal.dto';

const TEACHER_PERMISSION_CATALOG = [
  {
    key: 'CREATE_EXAM',
    description: 'Create and manage subjects, assessments, and question banks.',
  },
  {
    key: 'VIEW_OWN_CLASS_SESSIONS',
    description: 'View monitoring sessions, recordings, and incidents for assigned classes.',
  },
  {
    key: 'VIEW_STUDENT_ROSTERS',
    description: 'View student rosters for assigned classes.',
  },
  {
    key: 'FLAG_STUDENT',
    description: 'Record and review integrity findings for assigned students.',
  },
] as const;

type DeanAnalyticsFilters = {
  academicPeriodId?: string;
  term?: string;
  dateFrom?: string;
  dateTo?: string;
  program?: string;
  yearLevel?: string;
  section?: string;
  subjectCode?: string;
};

function inclusiveDateEnd(value: string) {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCMilliseconds(date.getUTCMilliseconds() - 1);
  }
  return date;
}

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private gateway: SessionsGateway,
    private ai: AiService,
    private revocation: SessionRevocationService,
    private avatars: AvatarsService
  ) {}

  async academicPeriods(institutionId?: string | null) {
    return this.prisma.academicPeriod.findMany({
      where: { institutionId },
      include: { _count: { select: { exams: true } } },
      orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
    });
  }

  async createAcademicPeriod(deanId: string, input: CreateAcademicPeriodDto) {
    const institutionId = await this.institutionFor(deanId);
    if (
      input.startsAt &&
      input.endsAt &&
      new Date(input.endsAt) <= new Date(input.startsAt)
    )
      throw new ConflictException(
        'Semester end date must be after its start date'
      );
    if (
      await this.prisma.academicPeriod.findFirst({
        where: { status: 'ACTIVE', institutionId },
      })
    )
      throw new ConflictException(
        'Close the current active semester before starting another one'
      );
    const years = input.academicYear.split('-').map(Number);
    if (years.length !== 2 || years[1] !== years[0]! + 1)
      throw new ConflictException(
        'Academic year must contain consecutive years'
      );
    try {
      const period = await this.prisma.academicPeriod.create({
        data: {
          institutionId,
          academicYear: input.academicYear,
          semester: input.semester,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: deanId,
          action: 'ACADEMIC_PERIOD_CREATED',
          targetType: 'AcademicPeriod',
          targetId: period.id,
          metadata: {
            academicYear: period.academicYear,
            semester: period.semester,
          },
        },
      });
      return period;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ConflictException(
        'That academic year and semester already exists'
      );
    }
  }

  async closeAcademicPeriod(deanId: string, id: string) {
    const institutionId = await this.institutionFor(deanId);
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, institutionId },
      include: {
        exams: {
          select: {
            id: true,
            term: true,
            status: true,
            sessions: {
              where: { status: SessionStatus.IN_PROGRESS },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Academic period not found');
    if (period.status === 'CLOSED')
      throw new ConflictException('This semester is already closed');
    if (
      period.exams.some(
        (exam) => exam.status === 'PUBLISHED' || exam.sessions.length
      )
    )
      throw new ConflictException(
        'Stop all active assessments before closing the semester'
      );
    if (
      !period.exams.some(
        (exam) => exam.term === 'FINAL' && exam.status !== 'DRAFT'
      )
    )
      throw new ConflictException(
        'A Final-term assessment is required before closing the semester'
      );
    const saved = await this.prisma.academicPeriod.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'ACADEMIC_PERIOD_CLOSED',
        targetType: 'AcademicPeriod',
        targetId: id,
      },
    });
    return saved;
  }

  async reopenAcademicPeriod(deanId: string, id: string) {
    const institutionId = await this.institutionFor(deanId);
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, institutionId },
    });
    if (!period) throw new NotFoundException('Academic period not found');
    if (period.academicYear === 'Legacy')
      throw new ConflictException('The legacy period cannot be reopened');
    if (
      await this.prisma.academicPeriod.findFirst({
        where: { status: 'ACTIVE', id: { not: id }, institutionId },
      })
    )
      throw new ConflictException(
        'Close the current active semester before reopening another one'
      );
    const saved = await this.prisma.academicPeriod.update({
      where: { id },
      data: { status: 'ACTIVE', closedAt: null },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'ACADEMIC_PERIOD_REOPENED',
        targetType: 'AcademicPeriod',
        targetId: id,
      },
    });
    return saved;
  }

  async studentSessions(userId: string) {
    const rows = await this.prisma.examSession.findMany({
      where: { studentId: userId },
      include: {
        exam: { include: { subject: true, academicPeriod: true } },
        scoreHistory: { orderBy: { computedAt: 'desc' } },
        incidents: { where: { status: 'OPEN' }, select: { id: true } },
        submission: {
          select: {
            id: true,
            gradeStatus: true,
            totalScore: true,
            maxScore: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return rows.map((x) => ({
      sessionId: x.id,
      examTitle: x.exam.title,
      subjectCode: x.exam.subject.code,
      term: x.exam.term,
      academicPeriod: x.exam.academicPeriod,
      startedAt: x.startedAt,
      endedAt: x.endedAt,
      durationSec: x.endedAt
        ? Math.round((+x.endedAt - +x.startedAt) / 1000)
        : null,
      status: x.status,
      // Scores stay hidden until the exam closes (see result-release.ts).
      submission: x.submission
        ? {
            ...x.submission,
            gradeStatus: studentGradeStatus(x.submission.gradeStatus, x.exam.status),
            totalScore: resultsReleased(x.submission.gradeStatus, x.exam.status)
              ? x.submission.totalScore
              : null,
          }
        : null,
      reviewStatus:
        x.proctorReviewDecision !== ProctorReviewDecision.PENDING
          ? x.proctorReviewDecision
          : x.scoreHistory.some((s) => s.tier === 'HIGH') || x.incidents.length
            ? 'FLAGGED'
            : 'NO_FLAGS',
      proctorReviewedAt: x.proctorReviewedAt,
    }));
  }

  async notifications(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === Role.STUDENT) await this.ensureStudentReminders(userId);
    return this.prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        message: true,
        isRead: true,
        createdAt: true,
        link: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async ensureStudentReminders(userId: string) {
    const now = new Date();
    const sevenDays = new Date(+now + 7 * 24 * 60 * 60 * 1000);
    const oneDay = new Date(+now + 24 * 60 * 60 * 1000);
    const [exams, released, reviewed] = await Promise.all([
      this.prisma.exam.findMany({
        where: {
          status: 'PUBLISHED',
          subject: { enrollments: { some: { studentId: userId } } },
          OR: [
            { scheduledAt: { gt: now, lte: sevenDays } },
            { endsAt: { gt: now, lte: oneDay } },
          ],
        },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          endsAt: true,
          subject: { select: { subjectCode: true, name: true } },
        },
      }),
      this.prisma.submission.findMany({
        where: {
          gradeStatus: GradeStatus.TEACHER_CONFIRMED,
          deletedAt: null,
          // Notify only once results are actually visible (exam closed).
          session: { studentId: userId, exam: { status: { not: 'PUBLISHED' } } },
        },
        select: {
          id: true,
          sessionId: true,
          session: { select: { exam: { select: { title: true } } } },
        },
      }),
      this.prisma.examSession.findMany({
        where: {
          studentId: userId,
          proctorReviewDecision: { in: ['NEGATIVE', 'POSITIVE'] },
        },
        select: {
          id: true,
          proctorReviewDecision: true,
          proctorReviewedAt: true,
          exam: { select: { title: true } },
        },
      }),
    ]);
    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const exam of exams) {
      const subject = exam.subject.subjectCode ?? exam.subject.name;
      if (
        exam.scheduledAt &&
        exam.scheduledAt > now &&
        exam.scheduledAt <= sevenDays
      )
        rows.push({
          userId,
          type: 'UPCOMING_ASSESSMENT',
          message: `${exam.title} for ${subject} starts ${exam.scheduledAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`,
          dedupeKey: `upcoming:${userId}:${exam.id}:${exam.scheduledAt.toISOString()}`,
          link: '/student/calendar',
        });
      if (exam.endsAt && exam.endsAt > now && exam.endsAt <= oneDay)
        rows.push({
          userId,
          type: 'ASSESSMENT_DEADLINE',
          message: `${exam.title} closes ${exam.endsAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`,
          dedupeKey: `deadline:${userId}:${exam.id}:${exam.endsAt.toISOString()}`,
          link: '/student/calendar',
        });
    }
    for (const submission of released)
      rows.push({
        userId,
        type: 'RESULT_RELEASED',
        message: `Your result for ${submission.session.exam.title} is available.`,
        dedupeKey: `result:${userId}:${submission.id}`,
        link: `/student/sessions/${submission.sessionId}/result`,
      });
    for (const session of reviewed)
      rows.push({
        userId,
        type:
          session.proctorReviewDecision === 'NEGATIVE'
            ? 'PROCTOR_REVIEW_CLEAR'
            : 'PROCTOR_REVIEW_WARN',
        message:
          session.proctorReviewDecision === 'NEGATIVE'
            ? `Your teacher reviewed ${session.exam.title} and found no violation.`
            : `Your teacher reviewed ${session.exam.title} and confirmed a violation.`,
        dedupeKey: `proctor-review:${userId}:${session.id}:${session.proctorReviewDecision}:${session.proctorReviewedAt?.toISOString() ?? 'reviewed'}`,
        link: '/student/sessions',
      });
    if (rows.length)
      await this.prisma.notification.createMany({
        data: rows,
        skipDuplicates: true,
      });
  }

  async readNotification(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!row) throw new NotFoundException();
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async studentDashboard(userId: string) {
    const [sessions, enrollments] = await Promise.all([
      this.prisma.examSession.findMany({
        where: { studentId: userId },
        include: {
          exam: { include: { subject: true, academicPeriod: true } },
          submission: true,
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: userId },
        include: {
          subject: {
            include: {
              exams: {
                where: { status: 'PUBLISHED', scheduledAt: { gt: new Date() } },
                select: {
                  title: true,
                  scheduledAt: true,
                  term: true,
                  academicPeriod: true,
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      monitoringClientStatus: sessions.some(
        (s) => s.status === SessionStatus.IN_PROGRESS
      )
        ? 'CONNECTED'
        : 'IDLE',
      upcomingSessions: enrollments
        .flatMap((e) => e.subject.exams)
        .map((e) => ({
          examTitle: e.title,
          startsAt: e.scheduledAt!,
          term: e.term,
          academicPeriod: e.academicPeriod,
        }))
        .sort((a, b) => +a.startsAt - +b.startsAt),
      recentActivity: sessions
        .filter((x) => !x.studentActivityArchivedAt)
        .slice(0, 5)
        .map((x) => ({
          id: x.id,
          text: `${x.status === 'IN_PROGRESS' ? 'Joined' : 'Completed'} ${x.exam.title}`,
          occurredAt: x.startedAt,
          term: x.exam.term,
          academicPeriod: x.exam.academicPeriod,
        })),
      archivedActivity: sessions
        .filter((x) => x.studentActivityArchivedAt)
        .slice(0, 5)
        .map((x) => ({
          id: x.id,
          text: `${x.status === 'IN_PROGRESS' ? 'Joined' : 'Completed'} ${x.exam.title}`,
          occurredAt: x.startedAt,
          term: x.exam.term,
          academicPeriod: x.exam.academicPeriod,
        })),
      scoreHistory: sessions
        .filter(
          (x) =>
            !!x.submission &&
            resultsReleased(x.submission.gradeStatus, x.exam.status) &&
            x.submission.totalScore !== null
        )
        .map((x) => ({
          examTitle: x.exam.title,
          score: x.submission!.totalScore!,
          maxScore: x.submission!.maxScore,
          term: x.exam.term,
          academicPeriod: x.exam.academicPeriod,
        })),
      sessionTimeMinutes: sessions
        .filter((x) => x.endedAt)
        .map((x) => ({
          examTitle: x.exam.title,
          minutes: Math.round((+x.endedAt! - +x.startedAt) / 60000),
          term: x.exam.term,
          academicPeriod: x.exam.academicPeriod,
        })),
      academicPeriods: await this.academicPeriods(
        await this.institutionFor(userId)
      ),
    };
  }

  async setStudentActivityArchived(
    userId: string,
    sessionId: string,
    archived: boolean
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId: userId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Activity not found');

    return this.prisma.examSession.update({
      where: { id: sessionId },
      data: { studentActivityArchivedAt: archived ? new Date() : null },
      select: { id: true, studentActivityArchivedAt: true },
    });
  }

  async studentAssessments(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: userId },
      select: {
        subject: {
          select: {
            id: true,
            subjectCode: true,
            name: true,
            teacher: { select: { fullName: true } },
            exams: {
              where: { scheduledAt: { not: null } },
              select: {
                id: true,
                title: true,
                assessmentType: true,
                scheduledAt: true,
                endsAt: true,
                durationMinutes: true,
                status: true,
                term: true,
                createdAt: true,
                academicPeriod: true,
                sessions: {
                  where: { studentId: userId },
                  select: { id: true, status: true },
                },
              },
              orderBy: { scheduledAt: 'asc' },
            },
          },
        },
      },
    });
    return enrollments.flatMap(({ subject }) =>
      subject.exams.map((exam) => ({
        ...exam,
        subject: {
          id: subject.id,
          subjectCode: subject.subjectCode,
          name: subject.name,
          teacherName: subject.teacher.fullName,
        },
      }))
    );
  }

  async studentResult(userId: string, sessionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { sessionId, session: { studentId: userId }, deletedAt: null },
      include: {
        session: {
          include: {
            exam: { include: { subject: true, academicPeriod: true } },
          },
        },
        answers: {
          orderBy: { question: { order: 'asc' } },
          include: { question: { include: { options: true } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Result not found');
    const released = resultsReleased(
      submission.gradeStatus,
      submission.session.exam.status
    );
    const showCorrect = released && submission.session.exam.showCorrectAnswers;
    return {
      id: submission.id,
      sessionId,
      submittedAt: submission.submittedAt,
      totalScore: released ? submission.totalScore : null,
      maxScore: submission.maxScore,
      gradeStatus: studentGradeStatus(
        submission.gradeStatus,
        submission.session.exam.status
      ),
      teacherFeedback: released ? submission.teacherFeedback : null,
      showCorrectAnswers: showCorrect,
      exam: {
        title: submission.session.exam.title,
        assessmentType: submission.session.exam.assessmentType,
        term: submission.session.exam.term,
        academicPeriod: submission.session.exam.academicPeriod,
        subject: {
          code:
            submission.session.exam.subject.subjectCode ??
            submission.session.exam.subject.code,
          name: submission.session.exam.subject.name,
        },
      },
      answers: submission.answers.map((answer) => ({
        id: answer.id,
        responseText: answer.responseText,
        selectedOptionIds: answer.selectedOptionIds,
        awardedPoints: released ? answer.awardedPoints : null,
        gradeStatus: answer.gradeStatus,
        question: {
          order: answer.question.order,
          prompt: answer.question.prompt,
          type: answer.question.type,
          points: answer.question.points,
          correctAnswer: showCorrect ? answer.question.correctAnswer : null,
          options: answer.question.options.map((option) => ({
            id: option.id,
            label: option.label,
            ...(showCorrect ? { isCorrect: option.isCorrect } : {}),
          })),
        },
      })),
    };
  }

  async studentAnalytics(userId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        session: { studentId: userId, exam: { status: { not: 'PUBLISHED' } } },
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
        totalScore: { not: null },
        deletedAt: null,
      },
      include: {
        session: {
          include: {
            exam: { include: { subject: true, academicPeriod: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const attempts = submissions.map((submission) => ({
      sessionId: submission.sessionId,
      examTitle: submission.session.exam.title,
      subjectId: submission.session.exam.subjectId,
      subjectCode:
        submission.session.exam.subject.subjectCode ??
        submission.session.exam.subject.code,
      subjectName: submission.session.exam.subject.name,
      term: submission.session.exam.term,
      academicPeriod: submission.session.exam.academicPeriod,
      submittedAt: submission.submittedAt,
      score: submission.totalScore!,
      maxScore: submission.maxScore,
      percentage: submission.maxScore
        ? Math.round((submission.totalScore! / submission.maxScore) * 100)
        : 0,
      timeMinutes: submission.session.endedAt
        ? Math.max(
            0,
            Math.round(
              (+submission.session.endedAt - +submission.session.startedAt) /
                60000
            )
          )
        : 0,
    }));
    const subjects = [...new Set(attempts.map((item) => item.subjectId))].map(
      (subjectId) => {
        const rows = attempts.filter((item) => item.subjectId === subjectId);
        return {
          subjectId,
          subjectCode: rows[0]!.subjectCode,
          subjectName: rows[0]!.subjectName,
          attempts: rows.length,
          averageScore: Math.round(
            rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length
          ),
          totalTimeMinutes: rows.reduce((sum, row) => sum + row.timeMinutes, 0),
        };
      }
    );
    return { attempts, subjects };
  }

  async teacherExams(teacherId: string, archived = false) {
    const exams = await this.prisma.exam.findMany({
      where: {
        subject: { teacherId },
        sessionsArchivedAt: archived ? { not: null } : null,
      },
      include: {
        subject: { include: { _count: { select: { enrollments: true } } } },
        academicPeriod: true,
        sessions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams.map((x) => {
      const completed =
        x.subject._count.enrollments > 0 &&
        x.sessions.filter(
          (session) => session.status === SessionStatus.COMPLETED
        ).length >= x.subject._count.enrollments;
      const now = new Date();
      const ended =
        x.status === 'ARCHIVED' ||
        completed ||
        (!!x.endsAt && x.endsAt <= now);
      const withinWindow =
        x.status === 'PUBLISHED' &&
        !!x.scheduledAt &&
        x.scheduledAt <= now &&
        !!x.endsAt &&
        x.endsAt > now;
      const live = ended
        ? 0
        : x.sessions.filter((s) => s.status === SessionStatus.IN_PROGRESS)
            .length;
      return {
        id: x.id,
        examId: x.id,
        title: x.title,
        version: x.version,
        versionGroupId: x.versionGroupId,
        subject: { code: x.subject.code, name: x.subject.name },
        subjectCode: x.subject.code,
        term: x.term,
        academicPeriod: x.academicPeriod,
        roomCode: x.roomCode,
        sessionsArchivedAt: x.sessionsArchivedAt,
        status: ended
          ? 'Ended'
          : withinWindow
            ? 'Live'
            : x.status === 'PUBLISHED'
              ? 'Scheduled'
              : x.status,
        liveSessionCount: live,
        studentCount: x.subject._count.enrollments,
      };
    });
  }

  async setTeacherExamArchived(
    teacherId: string,
    examId: string,
    archived: boolean
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      select: {
        id: true,
        title: true,
        status: true,
        endsAt: true,
        sessionsArchivedAt: true,
        subject: {
          select: { _count: { select: { enrollments: true } } },
        },
        sessions: { select: { status: true } },
      },
    });
    if (!exam) throw new NotFoundException('Assessment not found');
    const completed =
      exam.subject._count.enrollments > 0 &&
      exam.sessions.filter(
        (session) => session.status === SessionStatus.COMPLETED
      ).length >= exam.subject._count.enrollments;
    if (
      archived &&
      exam.status === 'PUBLISHED' &&
      !completed &&
      (!exam.endsAt || exam.endsAt > new Date())
    )
      throw new ConflictException(
        'Only ended assessments can be archived from Sessions'
      );
    if (archived === Boolean(exam.sessionsArchivedAt))
      return {
        id: exam.id,
        sessionsArchivedAt: exam.sessionsArchivedAt,
        unchanged: true,
      };
    const updated = await this.prisma.exam.update({
      where: { id: exam.id },
      data: { sessionsArchivedAt: archived ? new Date() : null },
      select: { id: true, sessionsArchivedAt: true },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: archived
          ? 'TEACHER_SESSION_ROW_ARCHIVED'
          : 'TEACHER_SESSION_ROW_RESTORED',
        targetType: 'Exam',
        targetId: exam.id,
        metadata: { title: exam.title },
      },
    });
    return updated;
  }

  async playback(teacherId: string, id: string) {
    const lookup = id.trim();
    const matchedSession = await this.prisma.examSession.findFirst({
      where: { id: lookup, exam: { subject: { teacherId } } },
      select: { examId: true },
    });
    const exam = await this.prisma.exam.findFirst({
      where: {
        subject: { teacherId },
        ...(matchedSession
          ? { id: matchedSession.examId }
          : {
              OR: [{ id: lookup }, { roomCode: lookup.toUpperCase() }],
            }),
      },
      include: {
        subject: { select: { code: true, subjectCode: true, name: true } },
        sessions: {
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true,
                enrollments: { select: { subjectId: true } },
              },
            },
            scoreHistory: { orderBy: { computedAt: 'asc' } },
            events: {
              orderBy: { occurredAt: 'asc' },
              include: {
                evidenceClips: {
                  where: {
                    // CENTERED is the current single clip per incident.
                    // BEFORE/AFTER are from the first clip format (early
                    // September 2026) and are still valid evidence.
                    phase: {
                      in: [
                        EvidenceClipPhase.CENTERED,
                        EvidenceClipPhase.BEFORE,
                        EvidenceClipPhase.AFTER,
                      ],
                    },
                    status: EvidenceClipStatus.COMPLETE,
                  },
                  orderBy: { startedAt: 'asc' },
                },
              },
            },
          },
          orderBy: { student: { fullName: 'asc' } },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam session was not found');

    const ended =
      exam.status !== 'PUBLISHED' ||
      (!!exam.endsAt && exam.endsAt <= new Date());

    if (
      !ended ||
      exam.sessions.some(
        (session) => session.status === SessionStatus.IN_PROGRESS
      )
    )
      throw new ConflictException(
        'Playback is available only after the exam has ended'
      );
    return {
      exam: {
        id: exam.id,
        title: exam.title,
        subjectCode: exam.subject.subjectCode,
        subjectName: exam.subject.name,
      },
      sessions: exam.sessions
        .filter(
          (session) =>
            session.status === SessionStatus.COMPLETED &&
            session.student.enrollments.some(
              (enrollment) => enrollment.subjectId === exam.subjectId
            )
        )
        .map((session) => ({
          sessionId: session.id,
          student: {
            id: session.student.id,
            fullName: session.student.fullName,
            profilePicture: session.student.profilePicture,
          },
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          proctorReviewDecision: session.proctorReviewDecision,
          proctorReviewedAt: session.proctorReviewedAt,
          scoreTimeline: session.scoreHistory.map((score) => ({
            computedAt: score.computedAt,
            score: score.score,
            tier: score.tier,
          })),
          events: session.events.map((event) => ({
            id: event.id,
            type: event.type,
            occurredAt: event.occurredAt,
            intensity: event.intensity,
            // Prefer the centered clip; fall back to legacy before/after parts.
            clips: (event.evidenceClips.some(
              (clip) => clip.phase === EvidenceClipPhase.CENTERED
            )
              ? event.evidenceClips.filter(
                  (clip) => clip.phase === EvidenceClipPhase.CENTERED
                )
              : event.evidenceClips
            ).map((clip) => ({
              id: clip.id,
              phase: clip.phase,
              startedAt: clip.startedAt,
              endedAt: clip.endedAt,
              status: clip.status,
              playbackUrl: `/teacher/evidence-clips/${clip.id}`,
              eventOffsetSec: Math.max(
                0,
                (event.occurredAt.getTime() - clip.startedAt.getTime()) / 1000
              ),
            })),
          })),
        })),
    };
  }

  async evidenceClipFile(teacherId: string, clipId: string) {
    const clip = await this.prisma.evidenceClip.findFirst({
      where: {
        id: clipId,
        status: 'COMPLETE',
        session: { exam: { subject: { teacherId } } },
      },
      select: {
        storagePath: true,
        session: {
          select: { studentId: true, exam: { select: { subjectId: true } } },
        },
      },
    });
    if (!clip) throw new NotFoundException('Evidence clip is not available');
    const enrolled = await this.prisma.enrollment.findUnique({
      where: {
        subjectId_studentId: {
          subjectId: clip.session.exam.subjectId,
          studentId: clip.session.studentId,
        },
      },
      select: { id: true },
    });
    if (!enrolled)
      throw new NotFoundException('Evidence clip is not available');
    return clip.storagePath;
  }
  async raise(userId: string, sessionId: string, reason?: string) {
    const s = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId: userId },
    });

    if (!s) throw new ForbiddenException();
    const row = await this.prisma.raiseHandRequest.create({
      data: { sessionId, reason },
    });
    this.gateway.emitMonitor(s.examId, 'raise-hand:new', row);
    return row;
  }

  async queue(teacherId: string) {
    return this.prisma.raiseHandRequest.findMany({
      where: {
        resolvedAt: null,
        session: {
          status: SessionStatus.IN_PROGRESS,
          exam: { subject: { teacherId } },
        },
      },
      include: {
        session: {
          include: {
            student: { select: { fullName: true } },
            exam: { select: { title: true, term: true, academicPeriod: true } },
          },
        },
      },
      orderBy: { raisedAt: 'asc' },
    });
  }

  async resolve(teacherId: string, id: string) {
    const row = await this.prisma.raiseHandRequest.findUnique({
      where: { id },
      include: {
        session: { include: { exam: { include: { subject: true } } } },
      },
    });

    if (!row || row.session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    const [saved, warning] = await this.prisma.$transaction([
      this.prisma.raiseHandRequest.update({
        where: { id },
        data: { resolvedAt: new Date() },
      }),
      this.prisma.proctorWarning.create({
        data: {
          sessionId: row.sessionId,
          teacherId,
          message: 'Your teacher has resolved your raised-hand request.',
        },
        select: { id: true, message: true, sentAt: true },
      }),
    ]);
    this.gateway.warn(row.sessionId, warning);
    return saved;
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

  private async assertDepartment(
    institutionId: string,
    departmentId?: string | null
  ) {
    if (!departmentId) return null;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, institutionId, isActive: true },
      select: { id: true },
    });
    if (!department)
      throw new NotFoundException('Active department not found');
    return department.id;
  }

  async departments(institutionId: string) {
    return this.prisma.department.findMany({
      where: { institutionId },
      include: { _count: { select: { faculty: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async securityAccess(institutionId: string) {
    const faculty = await this.prisma.user.findMany({
      where: { institutionId, role: Role.TEACHER },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        teacherProfile: {
          select: {
            employeeId: true,
            department: { select: { name: true } },
          },
        },
        permissionOverrides: {
          select: {
            granted: true,
            permission: { select: { key: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    const defaults = ROLE_DEFAULT_PERMISSIONS[Role.TEACHER];
    return {
      permissions: TEACHER_PERMISSION_CATALOG.map((permission) => ({
        ...permission,
        defaultGranted: defaults.includes(permission.key),
      })),
      faculty: faculty.map((member) => {
        const overrides = Object.fromEntries(
          member.permissionOverrides.map((override) => [
            override.permission.key,
            override.granted,
          ])
        );
        return {
          userId: member.id,
          name: member.fullName,
          email: member.email,
          employeeId: member.teacherProfile?.employeeId ?? null,
          department: member.teacherProfile?.department?.name ?? null,
          status: member.status,
          overrides,
          effective: Object.fromEntries(
            TEACHER_PERMISSION_CATALOG.map((permission) => [
              permission.key,
              overrides[permission.key] ?? defaults.includes(permission.key),
            ])
          ),
        };
      }),
    };
  }

  async setPermissionOverride(
    deanId: string,
    targetUserId: string,
    input: SetPermissionOverrideDto
  ) {
    const institutionId = await this.institutionFor(deanId);
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, institutionId, role: Role.TEACHER },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Faculty member not found');
    const definition = TEACHER_PERMISSION_CATALOG.find(
      (permission) => permission.key === input.permissionKey
    );
    if (!definition) throw new ForbiddenException('Permission cannot be managed');
    const permission = await this.prisma.permission.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        description: definition.description,
      },
      update: { description: definition.description },
    });
    const override = await this.prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: target.id,
          permissionId: permission.id,
        },
      },
      create: {
        userId: target.id,
        permissionId: permission.id,
        granted: input.granted,
      },
      update: { granted: input.granted },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'FACULTY_PERMISSION_OVERRIDE_SET',
        targetType: 'User',
        targetId: target.id,
      },
    });
    return override;
  }

  async resetPermissionOverride(
    deanId: string,
    targetUserId: string,
    permissionKey: string
  ) {
    const institutionId = await this.institutionFor(deanId);
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, institutionId, role: Role.TEACHER },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Faculty member not found');
    if (
      !TEACHER_PERMISSION_CATALOG.some(
        (permission) => permission.key === permissionKey
      )
    )
      throw new ForbiddenException('Permission cannot be managed');
    await this.prisma.userPermission.deleteMany({
      where: {
        userId: target.id,
        permission: { key: permissionKey },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'FACULTY_PERMISSION_OVERRIDE_RESET',
        targetType: 'User',
        targetId: target.id,
      },
    });
    return { reset: true };
  }

  async createDepartment(deanId: string, input: CreateDepartmentDto) {
    const institutionId = await this.institutionFor(deanId);
    try {
      const department = await this.prisma.department.create({
        data: {
          institutionId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description?.trim() || null,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: deanId,
          action: 'DEPARTMENT_CREATED',
          targetType: 'Department',
          targetId: department.id,
        },
      });
      return department;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A department with this code or name already exists'
        );
      throw error;
    }
  }

  async updateDepartment(
    deanId: string,
    id: string,
    input: UpdateDepartmentDto
  ) {
    const institutionId = await this.institutionFor(deanId);
    const existing = await this.prisma.department.findFirst({
      where: { id, institutionId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Department not found');
    try {
      const department = await this.prisma.department.update({
        where: { id },
        data: {
          ...(input.code !== undefined
            ? { code: input.code.trim().toUpperCase() }
            : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description.trim() || null }
            : {}),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          actorId: deanId,
          action: 'DEPARTMENT_UPDATED',
          targetType: 'Department',
          targetId: id,
        },
      });
      return department;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A department with this code or name already exists'
        );
      throw error;
    }
  }

  async setDepartmentStatus(
    deanId: string,
    id: string,
    status: 'ACTIVE' | 'ARCHIVED'
  ) {
    const institutionId = await this.institutionFor(deanId);
    const existing = await this.prisma.department.findFirst({
      where: { id, institutionId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Department not found');
    const department = await this.prisma.department.update({
      where: { id },
      data: { isActive: status === 'ACTIVE' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action:
          status === 'ACTIVE'
            ? 'DEPARTMENT_REACTIVATED'
            : 'DEPARTMENT_ARCHIVED',
        targetType: 'Department',
        targetId: id,
      },
    });
    return department;
  }

  async professors(institutionId: string) {
    const rows = await this.prisma.user.findMany({
      where: { institutionId, role: { in: [Role.DEAN, Role.TEACHER] } },
      include: {
        taughtSubjects: {
          include: {
            _count: { select: { enrollments: true, exams: true } },
          },
        },
        teacherProfile: { include: { department: true } },
        deanProfile: true,
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((x) => ({
      userId: x.id,
      employeeId: x.teacherProfile?.employeeId ?? x.deanProfile?.employeeId,
      name: x.fullName,
      email: x.email,
      title: x.teacherProfile?.title ?? x.deanProfile?.title,
      department: x.teacherProfile?.department ?? null,
      role: x.role,
      profilePicture: (x as typeof x & { profilePicture: string | null })
        .profilePicture,
      status: x.status,
      createdAt: x.createdAt,
      subjects: x.taughtSubjects.map((subject) => ({
        id: subject.id,
        code: subject.subjectCode ?? subject.code,
        name: subject.name,
        schedule: subject.schedule,
        createdAt: subject.createdAt,
        studentCount: subject._count.enrollments,
        assessmentCount: subject._count.exams,
      })),
      workload: x.taughtSubjects.length,
      lastActiveAt: x.updatedAt,
    }));
  }

  async invite(deanId: string, input: InviteProfessorDto) {
    const institutionId = await this.institutionFor(deanId);
    const departmentId = await this.assertDepartment(
      institutionId,
      input.departmentId
    );
    const loginId = input.employeeId.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    const initialPassword = generateDefaultPassword(input, 123);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ loginId }, { email }] },
      select: { email: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email?.toLowerCase() === email
          ? 'Email address is already assigned to an account'
          : 'Employee ID is already assigned to an account'
      );
    }

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          institutionId,
          role: Role.TEACHER,
          loginId,
          email,
          fullName: [input.firstName, input.middleName, input.lastName]
            .filter(Boolean)
            .map((value) => value!.trim())
            .join(' '),
          profilePicture: await this.avatars.resolve(input.profilePicture),
          passwordHash: await bcrypt.hash(initialPassword, 12),
          status: AccountStatus.PENDING,
          mustChangePassword: true,
          teacherProfile: {
            create: {
              employeeId: input.employeeId.trim(),
              title: input.title.trim(),
              departmentId,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Employee ID or email is already assigned to an account'
        );
      }
      throw error;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'TEACHER_ACCOUNT_CREATED',
        targetType: 'User',
        targetId: user.id,
      },
    });
    return {
      userId: user.id,
      email: user.email,
      status: user.status,
      initialPassword,
    };
  }

  async updateFaculty(deanId: string, id: string, input: UpdateFacultyDto) {
    const institutionId = await this.institutionFor(deanId);
    const departmentId =
      input.departmentId !== undefined
        ? await this.assertDepartment(institutionId, input.departmentId)
        : undefined;
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: { in: [Role.DEAN, Role.TEACHER] } },
    });

    if (!exists) throw new NotFoundException('Faculty member not found');
    const profilePicture = await this.avatars.resolve(
      input.profilePicture,
      exists.profilePicture
    );
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        ...(profilePicture !== undefined ? { profilePicture } : {}),
        ...(exists.role === Role.DEAN
          ? {
              deanProfile: {
                update: {
                  title: input.title.trim(),
                  ...(input.employeeId !== undefined
                    ? { employeeId: input.employeeId.trim() || null }
                    : {}),
                },
              },
            }
          : {
              teacherProfile: {
                update: {
                  title: input.title.trim(),
                  ...(departmentId !== undefined ? { departmentId } : {}),
                  ...(input.employeeId !== undefined
                    ? { employeeId: input.employeeId.trim() || null }
                    : {}),
                },
              },
            }),
      },
    });
    await this.avatars.discard(exists.profilePicture, profilePicture);
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'FACULTY_ACCOUNT_UPDATED',
        targetType: 'User',
        targetId: id,
      },
    });
    return user;
  }

  async setFacultyStatus(
    deanId: string,
    id: string,
    status: 'ACTIVE' | 'DISABLED'
  ) {
    const institutionId = await this.institutionFor(deanId);
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: Role.TEACHER },
      select: { id: true, status: true },
    });
    if (!exists) throw new NotFoundException('Faculty member not found');
    if (exists.status === AccountStatus.PENDING) {
      throw new ConflictException(
        'Pending invitations must be activated before their account status can be changed.'
      );
    }
    const saved = await this.prisma.user.update({
      where: { id },
      data: { status, isActive: status === 'ACTIVE' },
    });
    // A disabled faculty member is signed out everywhere immediately.
    if (status === 'DISABLED') await this.revocation.revokeUser(id);
    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action:
          status === 'DISABLED'
            ? 'FACULTY_ACCOUNT_DISABLED'
            : 'FACULTY_ACCOUNT_REACTIVATED',
        targetType: 'User',
        targetId: id,
      },
    });
    return { userId: saved.id, status: saved.status };
  }

  async importFaculty(deanId: string, file: Express.Multer.File) {
    if (!file?.originalname.toLowerCase().endsWith('.xlsx'))
      throw new ConflictException('Choose an XLSX faculty file');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) throw new ConflictException('The workbook has no sheets');
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) throw new ConflictException('The workbook sheet is invalid');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    let created = 0,
      errors = 0;

    for (const row of rows) {
      try {
        await this.invite(deanId, {
          employeeId: String(row['Employee ID'] ?? ''),
          firstName: String(row['First Name'] ?? ''),
          middleName: String(row['Middle Name'] ?? ''),
          lastName: String(row['Last Name'] ?? ''),
          email: String(row['Email Address'] ?? ''),
          title: String(row['Title/Position'] ?? ''),
        });
        created++;
      } catch {
        errors++;
      }
    }
    return { created, errors };
  }

  async teacherDashboard(
    teacherId: string,
    filters: {
      academicPeriodId?: string;
      term?: string;
      dateFrom?: string;
      dateTo?: string;
      subjectId?: string;
      sectionId?: string;
      program?: string;
      yearLevel?: string;
    } = {}
  ) {
    const profileFilter = {
      ...(filters.program ? { program: filters.program } : {}),
      ...(filters.yearLevel ? { yearLevel: filters.yearLevel } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    };
    const sessions = await this.prisma.examSession.findMany({
      where: {
        exam: {
          subject: {
            teacherId,
            ...(filters.subjectId ? { id: filters.subjectId } : {}),
          },
          ...(filters.academicPeriodId
            ? { academicPeriodId: filters.academicPeriodId }
            : {}),
          ...(filters.term ? { term: filters.term as any } : {}),
        },
        ...(filters.dateFrom || filters.dateTo
          ? {
              startedAt: {
                ...(filters.dateFrom
                  ? { gte: new Date(`${filters.dateFrom}T00:00:00`) }
                  : {}),
                ...(filters.dateTo
                  ? { lte: new Date(`${filters.dateTo}T23:59:59.999`) }
                  : {}),
              },
            }
          : {}),
        ...(Object.keys(profileFilter).length
          ? { student: { studentProfile: { is: profileFilter } } }
          : {}),
      },
      include: {
        student: {
          include: { studentProfile: { include: { section: true } } },
        },
        exam: { include: { subject: true } },
        events: true,
        scoreHistory: { orderBy: { computedAt: 'asc' } },
      },
    });

    const now = new Date();
    const activeByExam = new Map(
      await Promise.all(
        [...new Set(sessions.map((s) => s.examId))].map(
          async (examId) =>
            [examId, await this.gateway.activeSessionIds(examId)] as const
        )
      )
    );
    const active = sessions.filter(
        (s) =>
          s.status === SessionStatus.IN_PROGRESS &&
          s.exam.status === 'PUBLISHED' &&
          (!s.exam.scheduledAt || s.exam.scheduledAt <= now) &&
          (!s.exam.endsAt || s.exam.endsAt > now) &&
          activeByExam.get(s.examId)?.has(s.id)
      ),
      latest = (s: (typeof sessions)[number]) => s.scoreHistory.at(-1),
      scores = sessions
        .map(latest)
        .map((s) => s?.score)
        .filter((x): x is number => x !== undefined),
      sections = new Map<
        string,
        { scores: number[]; sessions: number; incidents: number }
      >(),
      subjects = new Map<string, number[]>();

    for (const s of sessions) {
      const profile = s.student.studentProfile;
      const key = profile
          ? `${profile.program} · ${profile.yearLevel} Year - ${profile.section?.name ?? 'Unassigned'}`
          : 'Unassigned',
        score = latest(s)?.score;
      const section = sections.get(key) ?? {
        scores: [],
        sessions: 0,
        incidents: 0,
      };
      section.sessions++;
      if (s.events.length) section.incidents++;
      if (score !== undefined) section.scores.push(score);
      sections.set(key, section);
      if (score !== undefined) {
        const subjectKey = s.exam.subject.subjectCode ?? s.exam.subject.code;
        subjects.set(subjectKey, [...(subjects.get(subjectKey) ?? []), score]);
      }
    }

    const types = new Map<string, number>();
    sessions
      .flatMap((s) => s.events)
      .forEach((e) => types.set(e.type, (types.get(e.type) ?? 0) + 1));
    return {
      kpis: {
        activeSessionsNow: active.length,
        studentsMonitoredToday: sessions.filter(
          (s) => +s.startedAt > Date.now() - 86400000
        ).length,
        avgSuspicionScore: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0,
        flaggedIncidentsLast7Days: sessions
          .flatMap((s) => s.events)
          .filter((e) => +e.occurredAt > Date.now() - 604800000).length,
      },
      avgSuspicionBySection: [...sections].map(([section, value]) => ({
        section,
        avg: value.scores.length
          ? Math.round(
              value.scores.reduce((a, b) => a + b, 0) / value.scores.length
            )
          : 0,
      })),
      incidentRateBySection: [...sections].map(([section, value]) => ({
        section,
        rate: Math.round((value.incidents / value.sessions) * 100),
      })),
      avgSuspicionBySubject: [...subjects].map(([subject, values]) => ({
        subject,
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      })),
      termComparison: this.termComparison(sessions),
      incidentTypeBreakdown: [...types].map(([type, count]) => ({
        type,
        count,
      })),
      liveSuspicionTrend: active
        .flatMap((s) => s.scoreHistory)
        .map((s) => ({ sampledAt: s.computedAt, score: s.score })),
      highestRiskRightNow: active
        .map((s) => ({
          studentName: s.student.fullName,
          score: latest(s)?.score ?? 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
      filterOptions: await this.teacherDashboardFilters(teacherId),
    };
  }

  private async teacherDashboardFilters(teacherId: string) {
    const subjects = await this.prisma.subject.findMany({
      where: { teacherId },
      select: {
        id: true,
        subjectCode: true,
        name: true,
        sectionAssignments: {
          select: {
            section: {
              select: { id: true, name: true, program: true, yearLevel: true },
            },
          },
        },
      },
      orderBy: { subjectCode: 'asc' },
    });
    const sections = [
      ...new Map(
        subjects
          .flatMap((s) => s.sectionAssignments.map((x) => x.section))
          .map((x) => [x.id, x])
      ).values(),
    ];
    const institutionId = await this.institutionFor(teacherId);
    const periods = await this.academicPeriods(institutionId);
    return {
      subjects: subjects.map(({ sectionAssignments: _ignored, ...s }) => s),
      sections,
      periods,
    };
  }

  private termComparison(
    sessions: Array<{
      exam: { term: string };
      events: unknown[];
      scoreHistory: Array<{ score: number }>;
      proctorReviewDecision?: string;
    }>,
    reviewedOnly = false
  ) {
    return ['PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL'].map((term) => {
      const rows = sessions.filter(
        (session) =>
          session.exam.term === term &&
          (!reviewedOnly || session.proctorReviewDecision !== 'PENDING')
      );
      const scores = rows.flatMap((session) =>
        session.proctorReviewDecision === 'NEGATIVE'
          ? [0]
          : (session.scoreHistory.at(-1)?.score ?? [])
      );
      return {
        term,
        sessions: rows.length,
        incidentRate: rows.length
          ? Math.round(
              (rows.filter(
                (session) =>
                  session.proctorReviewDecision === 'POSITIVE' ||
                  (!reviewedOnly && session.events.length)
              ).length /
                rows.length) *
                100
            )
          : 0,
        avgSuspicion: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0,
      };
    });
  }

  async audit(
    institutionId: string,
    query: {
      role: string;
      dateFrom?: string;
      dateTo?: string;
      timeFrom?: string;
      timeTo?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const dateFrom = query.dateFrom
      ? new Date(`${query.dateFrom}T${query.timeFrom ?? '00:00'}:00`)
      : undefined;
    const dateTo = query.dateTo
      ? new Date(`${query.dateTo}T${query.timeTo ?? '23:59'}:59.999`)
      : undefined;
    const where: any = {
      actor: { is: { institutionId, role: query.role as Role } },
      ...(query.dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { fullName: true, email: true, role: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((x) => ({
        id: x.id,
        actorName: x.actor.fullName,
        actorEmail: x.actor.email,
        actorRole: x.actor.role,
        action: x.action,
        targetType: x.targetType,
        targetId: x.targetId,
        occurredAt: x.createdAt,
      })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private scope(institutionId: string, f: DeanAnalyticsFilters) {
    const profile: any = {
      ...(f.program ? { program: f.program } : {}),
      ...(f.yearLevel ? { yearLevel: f.yearLevel } : {}),
      ...(f.section ? { section: { is: { name: f.section } } } : {}),
    };
    return {
      ...(f.dateFrom || f.dateTo
        ? {
            startedAt: {
              ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
              ...(f.dateTo ? { lte: inclusiveDateEnd(f.dateTo) } : {}),
            },
          }
        : {}),
      exam: {
        subject: {
          teacher: { institutionId },
          ...(f.subjectCode ? { code: f.subjectCode } : {}),
        },
        ...(f.academicPeriodId ? { academicPeriodId: f.academicPeriodId } : {}),
        ...(f.term ? { term: f.term as any } : {}),
      },
      ...(Object.keys(profile).length
        ? { student: { studentProfile: { is: profile } } }
        : {}),
    };
  }

  async deanDashboard(
    institutionId: string,
    filters: DeanAnalyticsFilters = {}
  ) {
    const academicPeriods = await this.academicPeriods(institutionId);
    const requestedPeriod = filters.academicPeriodId;
    const effectiveFilters: DeanAnalyticsFilters = {
      ...filters,
      academicPeriodId:
        requestedPeriod === 'ALL'
          ? undefined
          : requestedPeriod ||
            academicPeriods.find((period) => period.status === 'ACTIVE')?.id,
    };
    const [sessions, configuredSections] = await Promise.all([
      this.prisma.examSession.findMany({
        where: this.scope(institutionId, effectiveFilters),
        include: {
          student: {
            include: { studentProfile: { include: { section: true } } },
          },
          exam: { include: { subject: true } },
          events: true,
          scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.studentSection.findMany({
        where: {
          institutionId,
          ...(effectiveFilters.program ? { program: effectiveFilters.program } : {}),
          ...(effectiveFilters.yearLevel ? { yearLevel: effectiveFilters.yearLevel } : {}),
          ...(effectiveFilters.section ? { name: effectiveFilters.section } : {}),
        },
      }),
    ]);

    const confirmedSessions = sessions.filter(
        (session) =>
          session.proctorReviewDecision !== ProctorReviewDecision.PENDING
      ),
      scores = confirmedSessions
        .map((s) =>
          s.proctorReviewDecision === ProctorReviewDecision.NEGATIVE
            ? 0
            : s.scoreHistory[0]?.score
        )
        .filter((x): x is number => x !== undefined),
      bySection = new Map<
        string,
        {
          program: string;
          yearLevel: string;
          section: string;
          participants: Set<string>;
          flaggedStudents: Set<string>;
        }
      >(
        configuredSections.map((section) => [
          section.id,
          {
            program: section.program,
            yearLevel: section.yearLevel,
            section: section.name,
            participants: new Set<string>(),
            flaggedStudents: new Set<string>(),
          },
        ])
      ),
      bySubject = new Map<string, [number, number]>(),
      byWeek = new Map<string, [Date, number, number]>(),
      types = new Map<string, number>();

    for (const s of confirmedSessions) {
      const incident =
          s.proctorReviewDecision === ProctorReviewDecision.POSITIVE ? 1 : 0,
        profile = s.student.studentProfile,
        sectionId =
          profile?.sectionId ??
          `unassigned:${profile?.program ?? ''}:${profile?.yearLevel ?? ''}`,
        sectionGroup = bySection.get(sectionId) ?? {
          program: profile?.program ?? 'Unknown',
          yearLevel: profile?.yearLevel ?? 'Unknown',
          section: profile?.section?.name ?? 'Unassigned',
          participants: new Set<string>(),
          flaggedStudents: new Set<string>(),
        },
        subject = s.exam.subject.name;
      sectionGroup.participants.add(s.studentId);
      if (incident) sectionGroup.flaggedStudents.add(s.studentId);
      bySection.set(sectionId, sectionGroup);
      const subjectGroup = bySubject.get(subject) ?? [0, 0];
      bySubject.set(subject, [subjectGroup[0] + 1, subjectGroup[1] + incident]);
      const weekStart = new Date(
        Date.UTC(
          s.startedAt.getUTCFullYear(),
          s.startedAt.getUTCMonth(),
          s.startedAt.getUTCDate()
        )
      );
      weekStart.setUTCDate(
        weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)
      );
      const weekKey = weekStart.toISOString().slice(0, 10),
        week = byWeek.get(weekKey) ?? [weekStart, 0, 0];
      byWeek.set(weekKey, [week[0], week[1] + 1, week[2] + incident]);
      if (incident)
        s.events.forEach((e) =>
          types.set(e.type, (types.get(e.type) ?? 0) + 1)
        );
    }
    const average = (values: number[]) =>
        values.length
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0,
      rate = ([total, incidents]: [number, number]) =>
        total ? Math.round((incidents / total) * 100) : 0,
      yearLabel = (value: string) => {
        const year = value.replace('YEAR_', '');
        if (!['1', '2', '3', '4'].includes(year)) return value;
        const suffix =
          year === '1'
            ? 'st'
            : year === '2'
              ? 'nd'
              : year === '3'
                ? 'rd'
                : 'th';
        return `${year}${suffix} Yr`;
      };
    return {
      kpis: {
        monitoredSessionsThisTerm: sessions.length,
        collegeWideAvgSuspicion: average(scores),
        incidentRatePercent: confirmedSessions.length
          ? Math.round(
              (confirmedSessions.filter(
                (s) =>
                  s.proctorReviewDecision === ProctorReviewDecision.POSITIVE
              ).length /
                confirmedSessions.length) *
                100
            )
          : 0,
        sectionsAboveThreshold: [...bySection.values()].filter(
          (v) => rate([v.participants.size, v.flaggedStudents.size]) >= 70
        ).length,
      },
      sessionDrilldown: sessions
        .map((session) => ({
          sessionId: session.id,
          studentName: session.student.fullName,
          studentId: session.student.studentProfile?.studentId ?? null,
          program: session.student.studentProfile?.program ?? null,
          yearLevel: session.student.studentProfile?.yearLevel ?? null,
          section:
            session.student.studentProfile?.section?.name ?? 'Unassigned',
          subjectCode:
            session.exam.subject.subjectCode ?? session.exam.subject.code,
          subjectName: session.exam.subject.name,
          examTitle: session.exam.title,
          startedAt: session.startedAt,
          reviewDecision: session.proctorReviewDecision,
          suspicion:
            session.proctorReviewDecision === ProctorReviewDecision.NEGATIVE
              ? 0
              : (session.scoreHistory[0]?.score ?? null),
          incidentCount: session.events.length,
        }))
        .sort(
          (a, b) =>
            (b.suspicion ?? -1) - (a.suspicion ?? -1) ||
            +b.startedAt - +a.startedAt
        )
        .slice(0, 100),
      incidenceRateBySection: [...bySection.values()]
        .sort(
          (a, b) =>
            a.program.localeCompare(b.program) ||
            Number(a.yearLevel.replace(/\D/g, '')) -
              Number(b.yearLevel.replace(/\D/g, '')) ||
            a.section.localeCompare(b.section, undefined, { numeric: true })
        )
        .map((group) => ({
          program: group.program,
          yearLevel: group.yearLevel,
          sectionName: group.section,
          section: `${group.program} · ${yearLabel(group.yearLevel)} - ${group.section}`,
          participantCount: group.participants.size,
          flaggedStudentCount: group.flaggedStudents.size,
          rate: rate([group.participants.size, group.flaggedStudents.size]),
        })),
      incidentsByType: [...types].map(([type, count]) => ({ type, count })),
      incidenceRateTrend: [...byWeek.values()]
        .sort((a, b) => +a[0] - +b[0])
        .map(([date, total, incidents]) => ({
          week: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          }),
          rate: rate([total, incidents]),
        })),
      incidenceRateBySubject: [...bySubject].map(([subject, v]) => ({
        subject,
        rate: rate(v),
      })),
      termComparison: this.termComparison(sessions, true),
      academicPeriods,
      activeAcademicPeriodId:
        academicPeriods.find((period) => period.status === 'ACTIVE')?.id ?? null,
    };
  }

  async deanAnalytics(
    institutionId: string,
    filters: DeanAnalyticsFilters = {}
  ) {
    const dashboard = await this.deanDashboard(institutionId, filters);
    const effectiveFilters: DeanAnalyticsFilters = {
      ...filters,
      academicPeriodId:
        filters.academicPeriodId === 'ALL'
          ? undefined
          : filters.academicPeriodId ||
            dashboard.activeAcademicPeriodId ||
            undefined,
    };
    const submissions = await this.prisma.submission.findMany({
      where: {
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
        totalScore: { not: null },
        session: this.scope(institutionId, effectiveFilters),
      },
      include: {
        session: {
          include: {
            scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const pairs = submissions.flatMap((s) =>
      s.totalScore !== null &&
      s.maxScore > 0 &&
      s.session.proctorReviewDecision !== ProctorReviewDecision.PENDING &&
      (s.session.scoreHistory[0] ||
        s.session.proctorReviewDecision === ProctorReviewDecision.NEGATIVE)
        ? [
            {
              suspicion_score:
                s.session.proctorReviewDecision ===
                ProctorReviewDecision.NEGATIVE
                  ? 0
                  : s.session.scoreHistory[0]!.score,
              exam_score: Math.round((s.totalScore / s.maxScore) * 100),
            },
          ]
        : []
    );

    const correlation = await this.ai.correlation(pairs);
    return {
      ...dashboard,
      correlation: {
        ...correlation,
        points: pairs.map((p) => ({
          suspicion: p.suspicion_score,
          performance: p.exam_score,
        })),
      },
    };
  }
}
