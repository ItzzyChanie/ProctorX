import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  GradeStatus,
  Role,
  SessionStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

type DeanAnalyticsFilters = {
  dateFrom?: string;
  dateTo?: string;
  program?: string;
  yearLevel?: string;
  section?: string;
  subjectCode?: string;
};

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private gateway: SessionsGateway,
    private ai: AiService
  ) {}

  async studentSessions(userId: string) {
    const rows = await this.prisma.examSession.findMany({
      where: { studentId: userId },
      include: {
        exam: { include: { subject: true } },
        scoreHistory: { orderBy: { computedAt: 'desc' } },
        incidents: { where: { status: 'OPEN' }, select: { id: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    return rows.map((x) => ({
      sessionId: x.id,
      examTitle: x.exam.title,
      subjectCode: x.exam.subject.code,
      startedAt: x.startedAt,
      endedAt: x.endedAt,
      durationSec: x.endedAt
        ? Math.round((+x.endedAt - +x.startedAt) / 1000)
        : null,
      status: x.status,
      reviewStatus:
        x.scoreHistory.some((s) => s.tier === 'HIGH') || x.incidents.length
          ? 'UNDER_REVIEW'
          : 'CLEARED',
    }));
  }

  notifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        message: true,
        isRead: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
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
        include: { exam: { include: { subject: true } }, submission: true },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: userId },
        include: {
          subject: {
            include: {
              exams: {
                where: { status: 'PUBLISHED', scheduledAt: { gt: new Date() } },
                select: { title: true, scheduledAt: true },
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
        .map((e) => ({ examTitle: e.title, startsAt: e.scheduledAt! }))
        .sort((a, b) => +a.startsAt - +b.startsAt),
      recentActivity: sessions.slice(0, 5).map((x) => ({
        text: `${x.status === 'IN_PROGRESS' ? 'Joined' : 'Completed'} ${x.exam.title}`,
        occurredAt: x.startedAt,
      })),
      scoreHistory: sessions
        .filter(
          (x) =>
            x.submission?.gradeStatus === GradeStatus.TEACHER_CONFIRMED &&
            x.submission.totalScore !== null
        )
        .map((x) => ({
          examTitle: x.exam.title,
          score: x.submission!.totalScore!,
          maxScore: x.submission!.maxScore,
        })),
      sessionTimeMinutes: sessions
        .filter((x) => x.endedAt)
        .map((x) => ({
          examTitle: x.exam.title,
          minutes: Math.round((+x.endedAt! - +x.startedAt) / 60000),
        })),
    };
  }

  async teacherExams(teacherId: string) {
    const exams = await this.prisma.exam.findMany({
      where: { subject: { teacherId } },
      include: {
        subject: { include: { _count: { select: { enrollments: true } } } },
        sessions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return exams.map((x) => {
      const ended =
        x.status !== 'PUBLISHED' || (!!x.endsAt && x.endsAt <= new Date());
      const live = ended
        ? 0
        : x.sessions.filter((s) => s.status === SessionStatus.IN_PROGRESS)
            .length;
      const completed =
        x.sessions.length > 0 &&
        x.sessions.every((s) => s.status === SessionStatus.COMPLETED);
      return {
        examId: x.id,
        title: x.title,
        subjectCode: x.subject.code,
        roomCode: x.roomCode,
        status: ended
          ? 'Ended'
          : live
            ? 'Live'
            : completed
              ? 'Ended'
              : x.status === 'PUBLISHED'
                ? 'Scheduled'
                : x.status,
        liveSessionCount: live,
        studentCount: x.subject._count.enrollments,
      };
    });
  }

  async playback(teacherId: string, id: string) {
    const matchedSession = await this.prisma.examSession.findFirst({
      where: { id, exam: { subject: { teacherId } } },
      select: { examId: true },
    });
    const examId = matchedSession?.examId ?? id;
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
      include: {
        subject: { select: { code: true, subjectCode: true, name: true } },
        sessions: {
          include: {
            student: { select: { id: true, fullName: true } },
            recording: true,
            scoreHistory: { orderBy: { computedAt: 'asc' } },
            events: { orderBy: { occurredAt: 'asc' } },
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
        .filter((session) => session.status === SessionStatus.COMPLETED)
        .map((session) => ({
          sessionId: session.id,
          student: session.student,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          recording: session.recording
            ? {
                status: session.recording.status,
                durationSec:
                  session.recording.durationSec ??
                  (session.endedAt
                    ? Math.max(
                        0,
                        Math.round(
                          (+session.endedAt - +session.startedAt) / 1000
                        )
                      )
                    : null),
                playbackUrl: `/teacher/sessions/${session.id}/recording`,
              }
            : null,
          scoreTimeline: session.scoreHistory.map((score) => ({
            computedAt: score.computedAt,
            score: score.score,
            tier: score.tier,
          })),
          events: session.events.map((event) => ({
            type: event.type,
            occurredAt: event.occurredAt,
            intensity: event.intensity,
          })),
        })),
    };
  }

  async recordingFile(teacherId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: {
        id: sessionId,
        status: SessionStatus.COMPLETED,
        exam: { subject: { teacherId } },
      },
      include: { recording: true },
    });

    if (!session?.recording)
      throw new NotFoundException('Recording is not available');
    return session.recording.storagePath;
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
            exam: { select: { title: true } },
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
    const saved = await this.prisma.raiseHandRequest.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    this.gateway.warn(
      row.sessionId,
      'Your teacher has resolved your raised-hand request.'
    );
    return saved;
  }

  async professors() {
    const rows = await this.prisma.user.findMany({
      where: { role: Role.TEACHER },
      include: { taughtSubjects: true },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((x) => ({
      userId: x.id,
      name: x.fullName,
      subjects: x.taughtSubjects.map((s) => s.code),
      lastActiveAt: x.updatedAt,
    }));
  }

  async invite(deanId: string, email: string, fullName: string) {
    const loginId = email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { loginId } }))
      throw new ConflictException('Account already exists');

    const user = await this.prisma.user.create({
      data: {
        role: Role.TEACHER,
        loginId,
        email: loginId,
        fullName: fullName.trim(),
        passwordHash: await bcrypt.hash(loginId, 10),
        status: AccountStatus.PENDING,
        mustChangePassword: true,
        teacherProfile: { create: {} },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: deanId,
        action: 'TEACHER_INVITED',
        targetType: 'User',
        targetId: user.id,
      },
    });
    return { userId: user.id, email: user.email, status: user.status };
  }

  async teacherDashboard(teacherId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { exam: { subject: { teacherId } } },
      include: {
        student: { include: { studentProfile: true } },
        exam: { include: { subject: true } },
        events: true,
        scoreHistory: { orderBy: { computedAt: 'asc' } },
      },
    });

    const active = sessions.filter(
        (s) => s.status === SessionStatus.IN_PROGRESS
      ),
      latest = (s: (typeof sessions)[number]) => s.scoreHistory.at(-1),
      scores = sessions
        .map(latest)
        .map((s) => s?.score)
        .filter((x): x is number => x !== undefined),
      sections = new Map<string, number[]>();

    for (const s of sessions) {
      const key = s.student.studentProfile?.section ?? 'Unassigned',
        score = latest(s)?.score;
      if (score !== undefined)
        sections.set(key, [...(sections.get(key) ?? []), score]);
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
      avgSuspicionBySection: [...sections].map(([section, values]) => ({
        section,
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      })),
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
    };
  }

  async audit(
    actor?: string,
    action?: string,
    dateFrom?: string,
    dateTo?: string,
    cursor?: string,
    rawLimit?: string
  ) {
    const limit = Math.min(Math.max(Number(rawLimit) || 25, 1), 100);
    let d: Date | undefined, id: string | undefined;

    if (cursor) {
      try {
        const parts = Buffer.from(cursor, 'base64url').toString().split('|');
        d = new Date(parts[0] ?? '');
        id = parts[1];
        if (Number.isNaN(+d) || !id) throw new Error();
      } 
      catch {
        throw new NotFoundException('Invalid cursor');
      }
    }
    const where: any = {
      ...(action ? { action } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(actor
        ? {
            actor: {
              OR: [
                { fullName: { contains: actor, mode: 'insensitive' } },
                { email: { contains: actor, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(d && id
        ? { OR: [{ createdAt: { lt: d } }, { createdAt: d, id: { lt: id } }] }
        : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      last = rows.at(-1);
    return {
      items: rows.map((x) => ({
        actorName: x.actor.fullName,
        action: x.action,
        targetType: x.targetType,
        targetId: x.targetId,
        occurredAt: x.createdAt,
      })),
      nextCursor:
        rows.length === limit && last
          ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString(
              'base64url'
            )
          : null,
    };
  }

  private scope(f: DeanAnalyticsFilters) {
    const profile: any = {
      ...(f.program ? { program: f.program } : {}),
      ...(f.yearLevel ? { yearLevel: f.yearLevel } : {}),
      ...(f.section ? { section: f.section } : {}),
    };
    return {
      ...(f.dateFrom || f.dateTo
        ? {
            startedAt: {
              ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
              ...(f.dateTo ? { lte: new Date(f.dateTo) } : {}),
            },
          }
        : {}),
      ...(f.subjectCode ? { exam: { subject: { code: f.subjectCode } } } : {}),
      ...(Object.keys(profile).length
        ? { student: { studentProfile: { is: profile } } }
        : {}),
    };
  }

  async deanDashboard(filters: DeanAnalyticsFilters = {}) {
    const sessions = await this.prisma.examSession.findMany({
      where: this.scope(filters),
      include: {
        student: { include: { studentProfile: true } },
        exam: { include: { subject: true } },
        events: true,
        scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
      },
    });

    const scores = sessions
        .map((s) => s.scoreHistory[0]?.score)
        .filter((x): x is number => x !== undefined),
      bySection = new Map<string, [number, number]>(),
      bySubject = new Map<string, [number, number]>(),
      byWeek = new Map<string, [Date, number, number]>(),
      types = new Map<string, number>();

    for (const s of sessions) {
      const incident = s.events.length > 0 ? 1 : 0,
        section = s.student.studentProfile?.section ?? 'Unassigned',
        subject = s.exam.subject.name;

      for (const [key, map] of [
        [section, bySection],
        [subject, bySubject],
      ] as const) {
        const current = map.get(key) ?? [0, 0];
        map.set(key, [current[0] + 1, current[1] + incident]);
      }
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
      s.events.forEach((e) => types.set(e.type, (types.get(e.type) ?? 0) + 1));
    }
    const average = (values: number[]) =>
        values.length
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0,
      rate = ([total, incidents]: [number, number]) =>
        total ? Math.round((incidents / total) * 100) : 0;
    return {
      kpis: {
        monitoredSessionsThisTerm: sessions.length,
        collegeWideAvgSuspicion: average(scores),
        incidentRatePercent: sessions.length
          ? Math.round(
              (sessions.filter((s) => s.events.length > 0).length /
                sessions.length) *
                100
            )
          : 0,
        sectionsAboveThreshold: [...bySection.values()].filter(
          (v) => rate(v) >= 70
        ).length,
      },
      incidenceRateBySection: [...bySection].map(([section, v]) => ({
        section,
        rate: rate(v),
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
    };
  }

  async deanAnalytics(filters: DeanAnalyticsFilters = {}) {
    const dashboard = await this.deanDashboard(filters);
    const submissions = await this.prisma.submission.findMany({
      where: {
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
        totalScore: { not: null },
        session: this.scope(filters),
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
      s.totalScore !== null && s.maxScore > 0 && s.session.scoreHistory[0]
        ? [
            {
              suspicion_score: s.session.scoreHistory[0].score,
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
