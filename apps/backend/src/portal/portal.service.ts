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
  Role,
  SessionStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import {
  CreateAcademicPeriodDto,
  InviteProfessorDto,
  UpdateFacultyDto,
} from './dto/portal.dto';

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

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private gateway: SessionsGateway,
    private ai: AiService
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
    if (!period.exams.some((exam) => exam.term === 'FINAL'))
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
      recentActivity: sessions.slice(0, 5).map((x) => ({
        text: `${x.status === 'IN_PROGRESS' ? 'Joined' : 'Completed'} ${x.exam.title}`,
        occurredAt: x.startedAt,
        term: x.exam.term,
        academicPeriod: x.exam.academicPeriod,
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

  async teacherExams(teacherId: string) {
    const exams = await this.prisma.exam.findMany({
      where: { subject: { teacherId } },
      include: {
        subject: { include: { _count: { select: { enrollments: true } } } },
        academicPeriod: true,
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
        x.subject._count.enrollments > 0 &&
        x.sessions.filter(
          (session) => session.status === SessionStatus.COMPLETED
        ).length >= x.subject._count.enrollments;
      return {
        examId: x.id,
        title: x.title,
        subjectCode: x.subject.code,
        term: x.term,
        academicPeriod: x.academicPeriod,
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
            recording: true,
            scoreHistory: { orderBy: { computedAt: 'asc' } },
            events: {
              orderBy: { occurredAt: 'asc' },
              include: {
                evidenceClips: {
                  where: {
                    phase: EvidenceClipPhase.CENTERED,
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
            id: event.id,
            type: event.type,
            occurredAt: event.occurredAt,
            intensity: event.intensity,
            clips: event.evidenceClips.map((clip) => ({
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

  private async institutionFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { institutionId: true },
    });
    if (!user?.institutionId)
      throw new ForbiddenException('Institution is not configured');
    return user.institutionId;
  }

  async professors(institutionId: string) {
    const rows = await this.prisma.user.findMany({
      where: { institutionId, role: { in: [Role.DEAN, Role.TEACHER] } },
      include: {
        taughtSubjects: true,
        teacherProfile: true,
        deanProfile: true,
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((x) => ({
      userId: x.id,
      employeeId: x.teacherProfile?.employeeId ?? x.deanProfile?.employeeId,
      name: x.fullName,
      email: x.email,
      title: x.teacherProfile?.department ?? x.deanProfile?.college,
      role: x.role,
      profilePicture: (x as typeof x & { profilePicture: string | null })
        .profilePicture,
      status: x.status,
      createdAt: x.createdAt,
      subjects: x.taughtSubjects.map((s) => s.code),
      lastActiveAt: x.updatedAt,
    }));
  }

  async invite(deanId: string, input: InviteProfessorDto) {
    const institutionId = await this.institutionFor(deanId);
    const loginId = input.employeeId.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { loginId } }))
      throw new ConflictException('Account already exists');
    const email = input.email.trim().toLowerCase();
    const initialPassword = `${input.firstName.trim()[0]}${input.lastName.trim()[0]}@123`;
    const user = await this.prisma.user.create({
      data: {
        institutionId,
        role: Role.TEACHER,
        loginId,
        email,
        fullName: `${input.firstName.trim()} ${input.lastName.trim()}`,
        profilePicture: input.profilePicture,
        passwordHash: await bcrypt.hash(initialPassword.toLowerCase(), 12),
        status: AccountStatus.PENDING,
        mustChangePassword: true,
        teacherProfile: {
          create: {
            employeeId: input.employeeId.trim(),
            department: input.title.trim(),
          },
        },
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
    return {
      userId: user.id,
      email: user.email,
      status: user.status,
      initialPassword,
    };
  }

  async updateFaculty(deanId: string, id: string, input: UpdateFacultyDto) {
    const institutionId = await this.institutionFor(deanId);
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: { in: [Role.DEAN, Role.TEACHER] } },
    });

    if (!exists) throw new NotFoundException('Faculty member not found');
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        ...(input.profilePicture !== undefined
          ? { profilePicture: input.profilePicture || null }
          : {}),
        ...(input.newPassword
          ? {
              passwordHash: await bcrypt.hash(
                input.newPassword.toLowerCase(),
                12
              ),
              mustChangePassword: true,
            }
          : {}),
        ...(exists.role === Role.DEAN
          ? {
              deanProfile: {
                update: {
                  college: input.title.trim(),
                  ...(input.employeeId !== undefined
                    ? { employeeId: input.employeeId.trim() || null }
                    : {}),
                },
              },
            }
          : {
              teacherProfile: {
                update: {
                  department: input.title.trim(),
                  ...(input.employeeId !== undefined
                    ? { employeeId: input.employeeId.trim() || null }
                    : {}),
                },
              },
            }),
      },
    });
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

  async deleteFaculty(deanId: string, id: string) {
    const institutionId = await this.institutionFor(deanId);
    const exists = await this.prisma.user.findFirst({
      where: { id, institutionId, role: Role.TEACHER },
      select: {
        id: true,
        fullName: true,
        _count: { select: { taughtSubjects: true } },
      },
    });
    if (!exists) throw new NotFoundException('Faculty member not found');
    if (exists._count.taughtSubjects > 0) {
      throw new ConflictException(
        `${exists.fullName} still owns ${exists._count.taughtSubjects} subject${exists._count.taughtSubjects === 1 ? '' : 's'}. Transfer or remove those subjects before deleting this account.`
      );
    }
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This faculty account still has related academic or activity records and cannot be deleted.'
        );
      }
      throw error;
    }
    return { deleted: true };
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
    const active = sessions.filter(
        (s) =>
          s.status === SessionStatus.IN_PROGRESS &&
          s.exam.status === 'PUBLISHED' &&
          (!s.exam.scheduledAt || s.exam.scheduledAt <= now) &&
          (!s.exam.endsAt || s.exam.endsAt > now) &&
          this.gateway.activeSessionIds(s.examId).has(s.id)
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
    }>
  ) {
    return ['PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL'].map((term) => {
      const rows = sessions.filter((session) => session.exam.term === term);
      const scores = rows.flatMap(
        (session) => session.scoreHistory.at(-1)?.score ?? []
      );
      return {
        term,
        sessions: rows.length,
        incidentRate: rows.length
          ? Math.round(
              (rows.filter((session) => session.events.length).length /
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

  async deleteAuditLog(institutionId: string, id: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, actor: { institutionId } },
    });
    if (!log) throw new NotFoundException('Audit log not found');
    await this.prisma.auditLog.delete({ where: { id } });
    return { deleted: true };
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
              ...(f.dateTo ? { lte: new Date(f.dateTo) } : {}),
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
    const [sessions, configuredSections] = await Promise.all([
      this.prisma.examSession.findMany({
        where: this.scope(institutionId, filters),
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
          ...(filters.program ? { program: filters.program } : {}),
          ...(filters.yearLevel ? { yearLevel: filters.yearLevel } : {}),
          ...(filters.section ? { name: filters.section } : {}),
        },
      }),
    ]);

    const scores = sessions
        .map((s) => s.scoreHistory[0]?.score)
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

    for (const s of sessions) {
      const incident = s.events.length > 0 ? 1 : 0,
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
      s.events.forEach((e) => types.set(e.type, (types.get(e.type) ?? 0) + 1));
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
        incidentRatePercent: sessions.length
          ? Math.round(
              (sessions.filter((s) => s.events.length > 0).length /
                sessions.length) *
                100
            )
          : 0,
        sectionsAboveThreshold: [...bySection.values()].filter(
          (v) => rate([v.participants.size, v.flaggedStudents.size]) >= 70
        ).length,
      },
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
      termComparison: this.termComparison(sessions),
      academicPeriods: await this.academicPeriods(institutionId),
    };
  }

  async deanAnalytics(
    institutionId: string,
    filters: DeanAnalyticsFilters = {}
  ) {
    const dashboard = await this.deanDashboard(institutionId, filters);
    const submissions = await this.prisma.submission.findMany({
      where: {
        gradeStatus: GradeStatus.TEACHER_CONFIRMED,
        totalScore: { not: null },
        session: this.scope(institutionId, filters),
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
