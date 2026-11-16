import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EvidenceClipPhase,
  EvidenceClipStatus,
  EventType,
  Prisma,
  QuestionType,
  SessionStatus,
} from '@prisma/client';
import {
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import { spawn } from 'child_process';
import { createHmac } from 'crypto';
import ffmpegPath from 'ffmpeg-static';
import { join } from 'path';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from './sessions.gateway';
import { extraTimeWindowError } from './extra-time-policy';
import { GradingService } from './grading.service';
import { ProctoringScoreService } from './proctoring-score.service';
import { sessionRemainingSeconds } from './session-timing';
import { monitoringIntervals } from './monitoring-config';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway,
    private grading: GradingService,
    private scoring: ProctoringScoreService
  ) {}

  private async availableExam(code: string, studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { institutionId: true },
    });
    if (!student?.institutionId)
      throw new ForbiddenException('Institution is not configured');
    const exam = await this.prisma.exam.findFirst({
      where: {
        roomCode: code.trim().toUpperCase(),
        status: 'PUBLISHED',
        subject: {
          teacher: { institutionId: student.institutionId },
          enrollments: { some: { studentId } },
        },
      },
      include: {
        questions: {
          include: { options: { select: { id: true, label: true } } },
          orderBy: { order: 'asc' },
        },
        subject: true,
        studentOverrides: {
          where: { studentId },
          select: { extraTimeMinutes: true },
        },
      },
    });
    if (!exam)
      throw new NotFoundException(
        'No published enrolled exam matches this room code'
      );
    const now = new Date();
    if (exam.scheduledAt && now < exam.scheduledAt)
      throw new ConflictException('This assessment has not started yet');
    const extraTimeMinutes = exam.studentOverrides[0]?.extraTimeMinutes ?? 0;
    const personalEndsAt = exam.endsAt
      ? new Date(+exam.endsAt + extraTimeMinutes * 60_000)
      : null;
    if (personalEndsAt && now > personalEndsAt)
      throw new ConflictException('This assessment has already ended');
    return exam;
  }

  async preview(code: string, studentId: string) {
    const exam = await this.availableExam(code, studentId);
    const completed = await this.prisma.examSession.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId } },
      select: { status: true },
    });
    if (completed?.status === SessionStatus.COMPLETED)
      throw new ConflictException('This assessment has already been completed');
    return {
      id: exam.id,
      title: exam.title,
      assessmentType: exam.assessmentType,
      instructions: exam.instructions,
      requireCamera: exam.requireCamera,
      requireMicrophone: exam.requireMicrophone,
      questionCount: exam.questions.length,
      durationMinutes:
        exam.durationMinutes +
        (exam.studentOverrides[0]?.extraTimeMinutes ?? 0),
      extraTimeMinutes: exam.studentOverrides[0]?.extraTimeMinutes ?? 0,
      scheduledAt: exam.scheduledAt,
      endsAt: exam.endsAt,
      subject: {
        id: exam.subject.id,
        name: exam.subject.name,
        subjectCode: exam.subject.subjectCode,
      },
    };
  }

  async join(code: string, studentId: string) {
    const exam = await this.availableExam(code, studentId);
    const now = new Date();
    const extraTimeSeconds =
      (exam.studentOverrides[0]?.extraTimeMinutes ?? 0) * 60;
    const randomizedQuestionIds = exam.randomizeQuestions
      ? this.shuffle(exam.questions.map((question) => question.id))
      : exam.questions.map((question) => question.id);
    const randomizedOptionIds = Object.fromEntries(
      exam.questions.map((question) => [
        question.id,
        exam.randomizeOptions
          ? this.shuffle(question.options.map((option) => option.id))
          : question.options.map((option) => option.id),
      ])
    );
    let session = await this.prisma.examSession.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId } },
      include: {
        submission: { include: { answers: true } },
        proctorWarnings: {
          where: { acknowledgedAt: null },
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
    });
    if (session?.status === SessionStatus.COMPLETED)
      throw new ConflictException('This exam has already been completed');
    if (!session) {
      session = await this.prisma.examSession.create({
        data: {
          examId: exam.id,
          studentId,
          startedAt: now,
          status: SessionStatus.IN_PROGRESS,
          timerStartedAt: now,
          activeStartedAt: now,
          lastHeartbeatAt: now,
          extraTimeSeconds,
          questionOrder: randomizedQuestionIds,
          optionOrder: randomizedOptionIds,
          remainingSeconds: sessionRemainingSeconds(
            { startedAt: now, extraTimeSeconds },
            exam,
            now
          ),
        },
        include: {
          submission: { include: { answers: true } },
          proctorWarnings: {
            where: { acknowledgedAt: null },
            orderBy: { sentAt: 'desc' },
            take: 1,
          },
        },
      });
    } else {
      // The countdown keeps running while the student is away (wall clock).
      const remainingSeconds = sessionRemainingSeconds(session, exam, now);
      if (remainingSeconds <= 0) {
        await this.grading.finalizeSession(session.id);
        throw new ConflictException(
          'Time is up for this assessment. Your last saved answers were submitted.'
        );
      }
      session = await this.prisma.examSession.update({
        where: { id: session.id },
        data: {
          activeStartedAt: now,
          lastHeartbeatAt: now,
          remainingSeconds,
          questionOrder: session.questionOrder.length
            ? undefined
            : randomizedQuestionIds,
          optionOrder: session.optionOrder ?? randomizedOptionIds,
        },
        include: {
          submission: { include: { answers: true } },
          proctorWarnings: {
            where: { acknowledgedAt: null },
            orderBy: { sentAt: 'desc' },
            take: 1,
          },
        },
      });
    }
    this.gateway.emitMonitor(exam.id, 'monitor:session-start', {
      sessionId: session.id,
    });
    return {
      session,
      savedAnswers:
        session.submission?.answers.map((answer) => ({
          questionId: answer.questionId,
          responseText: answer.responseText ?? undefined,
          selectedOptionIds: answer.selectedOptionIds,
        })) ?? [],
      pendingWarning: session.proctorWarnings[0] ?? null,
      exam: {
        id: exam.id,
        title: exam.title,
        assessmentType: exam.assessmentType,
        instructions: exam.instructions,
        durationMinutes:
          exam.durationMinutes + Math.floor(session.extraTimeSeconds / 60),
        extraTimeMinutes: Math.floor(session.extraTimeSeconds / 60),
        requireCamera: exam.requireCamera,
        requireMicrophone: exam.requireMicrophone,
        // Camera/audio sampling cadence chosen by the server (see monitoring-config).
        monitoring: monitoringIntervals(),
        appPolicyMode: exam.appPolicyMode,
        appPolicyList: exam.appPolicyList,
        sourceType: exam.sourceType,
        externalFormUrl: exam.externalFormUrl,
        questions: this.orderQuestions(exam.questions, session).map(
          (question) => ({
            id: question.id,
            type: question.type,
            order: question.order,
            points: question.points,
            prompt: question.prompt,
            isRequired: question.isRequired,
            enumerationAnswerCount:
              question.type === QuestionType.ENUMERATION &&
              Array.isArray(question.correctAnswer)
                ? question.correctAnswer.length
                : undefined,
            // Number of ___ blanks (answers are never sent to the student).
            blankCount:
              question.type === QuestionType.FILL_IN_THE_BLANK &&
              Array.isArray(question.correctAnswer)
                ? question.correctAnswer.length
                : undefined,
            options: this.orderOptions(
              question.options,
              question.id,
              session
            ).map((option) => ({
              id: option.id,
              label: option.label,
            })),
          })
        ),
      },
    };
  }

  private shuffle<T>(values: T[]) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [result[index], result[swap]] = [result[swap]!, result[index]!];
    }
    return result;
  }

  private orderQuestions<T extends { id: string }>(
    questions: T[],
    session: { questionOrder: string[] }
  ) {
    if (!session.questionOrder.length) return questions;
    const order = new Map(
      session.questionOrder.map((id, index) => [id, index])
    );
    return [...questions].sort(
      (a, b) => (order.get(a.id) ?? 999999) - (order.get(b.id) ?? 999999)
    );
  }

  private orderOptions<T extends { id: string }>(
    options: T[],
    questionId: string,
    session: { optionOrder: unknown }
  ) {
    const stored = session.optionOrder as Record<string, string[]> | null;
    const ids = stored?.[questionId];
    if (!ids?.length) return options;
    const order = new Map(ids.map((id, index) => [id, index]));
    return [...options].sort(
      (a, b) => (order.get(a.id) ?? 999999) - (order.get(b.id) ?? 999999)
    );
  }

  /**
   * ICE servers for screen monitoring. Without TURN, students on school or
   * carrier-grade NAT networks cannot open a peer-to-peer stream. With
   * TURN_SECRET (coturn "use-auth-secret"), credentials are short-lived.
   */
  rtcConfig(userId: string) {
    const list = (value?: string) =>
      value
        ?.split(',')
        .map((url) => url.trim())
        .filter(Boolean) ?? [];
    const stun = list(process.env.STUN_URLS);
    const turn = list(process.env.TURN_URLS);
    const iceServers: {
      urls: string[];
      username?: string;
      credential?: string;
    }[] = [{ urls: stun.length ? stun : ['stun:stun.l.google.com:19302'] }];
    if (turn.length) {
      const secret = process.env.TURN_SECRET;
      if (secret) {
        const ttlSeconds = Number(process.env.TURN_TTL_SECONDS ?? 6 * 3600);
        const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${userId}`;
        const credential = createHmac('sha1', secret)
          .update(username)
          .digest('base64');
        iceServers.push({ urls: turn, username, credential });
      } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        iceServers.push({
          urls: turn,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        });
      }
    }
    return { iceServers };
  }

  async monitorableExams(teacherId: string) {
    const exams = await this.prisma.exam.findMany({
      // Drafts cannot be joined, so there is nothing to monitor.
      where: { subject: { teacherId }, status: { not: 'DRAFT' } },
      select: {
        id: true,
        title: true,
        status: true,
        roomCode: true,
        endsAt: true,
        term: true,
        academicPeriod: true,
        subject: { select: { code: true, name: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      exams.map(async (exam) => ({
        ...exam,
        sessionCount: exam._count.sessions,
        _count: {
          sessions: (await this.gateway.activeSessionIds(exam.id)).size,
        },
      }))
    );
  }

  async event(
    sessionId: string,
    studentId: string,
    type: EventType,
    metadata?: unknown
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId, status: SessionStatus.IN_PROGRESS },
      include: { exam: true },
    });
    if (!session) throw new ForbiddenException();
    const event = await this.scoring.record(sessionId, {
      type,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    });
    // Scores the whole attempt; a reconnect never resets the evidence. If the
    // AI service is down the event is still saved, shown and rescored later.
    const score = await this.scoring.rescore(session);
    this.scoring.publish(session, [event], score);
    return {
      ...(score ?? { suspicion_score: null, tier: null }),
      scored: Boolean(score),
      eventId: event.id,
      occurredAt: event.occurredAt,
    };
  }

  async evidenceClip(
    sessionId: string,
    studentId: string,
    input: {
      eventId: string;
      phase: EvidenceClipPhase;
      startedAt: string;
      endedAt: string;
    },
    chunk: Buffer,
    mimeType = 'video/webm'
  ) {
    const event = await this.prisma.proctoringEvent.findFirst({
      where: {
        id: input.eventId,
        sessionId,
        type: { in: [EventType.TAB_SWITCH, EventType.FULLSCREEN_EXIT] },
        session: { studentId },
      },
    });
    if (!event) throw new ForbiddenException();
    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    if (+endedAt <= +startedAt || +endedAt - +startedAt > 12_000)
      throw new ConflictException(
        'Evidence segments must be 12 seconds or shorter'
      );
    const dir = join(process.cwd(), 'storage', 'evidence');
    await mkdir(dir, { recursive: true });
    // Phones on iOS Safari record MP4; FFmpeg later merges every phase into
    // one WebM evidence clip regardless of the source container.
    const extension = /mp4/i.test(mimeType) ? 'mp4' : 'webm';
    const path = join(
      dir,
      `${event.id}-${input.phase.toLowerCase()}.${extension}`
    );
    await writeFile(path, chunk);
    const saved = await this.prisma.evidenceClip.upsert({
      where: { eventId_phase: { eventId: event.id, phase: input.phase } },
      create: {
        sessionId,
        eventId: event.id,
        phase: input.phase,
        storagePath: path,
        startedAt,
        endedAt,
        fileSizeBytes: BigInt(chunk.length),
        status: EvidenceClipStatus.COMPLETE,
      },
      update: {
        storagePath: path,
        startedAt,
        endedAt,
        fileSizeBytes: BigInt(chunk.length),
        status: EvidenceClipStatus.COMPLETE,
      },
      select: { id: true, phase: true, status: true },
    });
    if (input.phase !== EvidenceClipPhase.FOLLOWING) return saved;
    return (await this.finalizeEvidenceClip(event.id)) ?? saved;
  }

  private async finalizeEvidenceClip(eventId: string) {
    const event = await this.prisma.proctoringEvent.findUnique({
      where: { id: eventId },
      select: {
        occurredAt: true,
        sessionId: true,
        evidenceClips: {
          where: {
            phase: {
              in: [
                EvidenceClipPhase.PREVIOUS,
                EvidenceClipPhase.INCIDENT,
                EvidenceClipPhase.FOLLOWING,
              ],
            },
            status: EvidenceClipStatus.COMPLETE,
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    if (!event) return null;
    const incident = event.evidenceClips.find(
      (clip) => clip.phase === EvidenceClipPhase.INCIDENT
    );
    const following = event.evidenceClips.find(
      (clip) => clip.phase === EvidenceClipPhase.FOLLOWING
    );
    if (!incident || !following) return null;
    if (!ffmpegPath) throw new ConflictException('FFmpeg is unavailable');
    const executable = ffmpegPath;

    const parts = event.evidenceClips;
    const availableStart = parts[0]!.startedAt;
    const availableEnd = parts[parts.length - 1]!.endedAt;
    const clipStart = new Date(
      Math.max(+availableStart, +event.occurredAt - 10_000)
    );
    const clipEnd = new Date(
      Math.min(+availableEnd, +event.occurredAt + 10_000)
    );
    const durationSeconds = Math.max(0.1, (+clipEnd - +clipStart) / 1000);
    const offsetSeconds = Math.max(0, (+clipStart - +availableStart) / 1000);
    const dir = join(process.cwd(), 'storage', 'evidence');
    const listPath = join(dir, `${eventId}-concat.txt`);
    const temporaryPath = join(dir, `${eventId}-centered.tmp.webm`);
    const outputPath = join(dir, `${eventId}-centered.webm`);
    const concatList = parts
      .map((clip) => `file '${clip.storagePath.replace(/\\/g, '/')}'`)
      .join('\n');
    await writeFile(listPath, concatList);

    try {
      await new Promise<void>((resolve, reject) => {
        let errorOutput = '';
        const ffmpeg = spawn(executable, [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-ss',
          offsetSeconds.toFixed(3),
          '-t',
          durationSeconds.toFixed(3),
          '-an',
          '-c:v',
          'libvpx',
          '-deadline',
          'realtime',
          '-cpu-used',
          '5',
          temporaryPath,
        ]);
        ffmpeg.stderr.on('data', (data: Buffer) => {
          errorOutput += String(data);
        });
        ffmpeg.on('error', reject);
        ffmpeg.on('close', (code: number | null) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `FFmpeg exited with ${code}: ${errorOutput.slice(-1000)}`
              )
            );
        });
      });
      await unlink(outputPath).catch(() => undefined);
      await rename(temporaryPath, outputPath);
      const output = await stat(outputPath);
      const centered = await this.prisma.evidenceClip.upsert({
        where: {
          eventId_phase: { eventId, phase: EvidenceClipPhase.CENTERED },
        },
        create: {
          sessionId: event.sessionId,
          eventId,
          phase: EvidenceClipPhase.CENTERED,
          storagePath: outputPath,
          startedAt: clipStart,
          endedAt: clipEnd,
          fileSizeBytes: BigInt(output.size),
          status: EvidenceClipStatus.COMPLETE,
        },
        update: {
          storagePath: outputPath,
          startedAt: clipStart,
          endedAt: clipEnd,
          fileSizeBytes: BigInt(output.size),
          status: EvidenceClipStatus.COMPLETE,
        },
        select: { id: true, phase: true, status: true },
      });
      await this.prisma.evidenceClip.deleteMany({
        where: {
          eventId,
          phase: {
            in: [
              EvidenceClipPhase.PREVIOUS,
              EvidenceClipPhase.INCIDENT,
              EvidenceClipPhase.FOLLOWING,
            ],
          },
        },
      });
      await Promise.all(
        parts.map((part) => unlink(part.storagePath).catch(() => undefined))
      );
      return centered;
    } finally {
      await unlink(listPath).catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
  async monitor(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
    });
    if (!exam) throw new ForbiddenException();
    const states = await this.gateway.studentStates(examId);
    const sessions = await this.prisma.examSession.findMany({
      where: {
        examId,
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
      include: {
        student: {
          select: {
            fullName: true,
            studentProfile: {
              select: {
                program: true,
                yearLevel: true,
                section: { select: { id: true, name: true } },
              },
            },
          },
        },
        scoreHistory: { orderBy: { computedAt: 'desc' }, take: 1 },
        _count: { select: { events: true } },
        raiseHandRequests: {
          where: { resolvedAt: null },
          orderBy: { raisedAt: 'desc' },
          take: 1,
        },
        proctorWarnings: {
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startedAt: 'asc' },
    });
    // Aggregate in the database instead of shipping every event row for every
    // student on each refresh.
    const tabSwitches = await this.prisma.proctoringEvent.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: sessions.map((session) => session.id) },
        type: { in: [EventType.TAB_SWITCH, EventType.FULLSCREEN_EXIT] },
      },
      _count: { _all: true },
    });
    const tabSwitchCount = new Map(
      tabSwitches.map((row) => [row.sessionId, row._count._all])
    );
    const now = new Date();
    return sessions.map(({ _count, ...session }) => ({
      ...session,
      connected: states.has(session.id),
      connectionStatus: states.has(session.id) ? 'CONNECTED' : 'DISCONNECTED',
      screenSharing: states.get(session.id)?.screenSharing ?? false,
      feedSource: states.get(session.id)?.feedSource ?? 'screen',
      eventCount: _count.events,
      tabSwitchCount: tabSwitchCount.get(session.id) ?? 0,
      raisedHand: Boolean(session.raiseHandRequests.length),
      remainingSeconds: sessionRemainingSeconds(session, exam, now),
    }));
  }

  private async teacherSession(sessionId: string, teacherId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: { include: { subject: true } } },
    });
    if (!session || session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    return session;
  }

  private assertExtraTimeWindow(exam: {
    status: string;
    scheduledAt: Date | null;
    endsAt: Date | null;
  }) {
    const error = extraTimeWindowError(exam);
    if (error) throw new ConflictException(error);
  }

  async extraTimeOptions(
    subjectId: string,
    studentId: string,
    teacherId: string
  ) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { subjectId, studentId, subject: { teacherId } },
      select: { id: true },
    });
    if (!enrollment)
      throw new NotFoundException(
        'The student is not enrolled in this subject'
      );
    const now = new Date();
    const exams = await this.prisma.exam.findMany({
      where: {
        subjectId,
        status: 'PUBLISHED',
        scheduledAt: { lte: now },
        endsAt: { gt: now },
      },
      select: {
        id: true,
        title: true,
        assessmentType: true,
        version: true,
        scheduledAt: true,
        endsAt: true,
        sessions: {
          where: { studentId },
          select: { status: true, extraTimeSeconds: true },
          take: 1,
        },
        studentOverrides: {
          where: { studentId },
          select: { extraTimeMinutes: true },
          take: 1,
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });
    return exams.map((exam) => {
      const session = exam.sessions[0];
      const assessmentStatus =
        session?.status === SessionStatus.COMPLETED
          ? 'COMPLETED'
          : session?.status === SessionStatus.IN_PROGRESS
            ? 'IN_PROGRESS'
            : session?.status === SessionStatus.DISCONNECTED
              ? 'DISCONNECTED'
              : 'NOT_STARTED';
      const extraTimeMinutes = Math.max(
        exam.studentOverrides[0]?.extraTimeMinutes ?? 0,
        Math.floor((session?.extraTimeSeconds ?? 0) / 60)
      );
      return {
        id: exam.id,
        title: exam.title,
        assessmentType: exam.assessmentType,
        version: exam.version,
        scheduledAt: exam.scheduledAt,
        endsAt: exam.endsAt,
        lifecycle: 'LIVE',
        assessmentStatus,
        extraTimeMinutes,
        eligible: assessmentStatus !== 'COMPLETED',
        ineligibleReason:
          assessmentStatus === 'COMPLETED'
            ? 'This student has already completed the assessment'
            : null,
      };
    });
  }

  async sendWarning(sessionId: string, teacherId: string, rawMessage: string) {
    const session = await this.teacherSession(sessionId, teacherId);
    if (session.status === SessionStatus.COMPLETED)
      throw new ConflictException('This assessment attempt has ended');
    const message = rawMessage.trim();
    if (!message) throw new ConflictException('Warning message is required');
    const warning = await this.prisma.proctorWarning.create({
      data: { sessionId, teacherId, message },
      select: { id: true, message: true, sentAt: true, acknowledgedAt: true },
    });
    this.gateway.warn(sessionId, warning);
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'PROCTOR_WARNING_SENT',
        targetType: 'ExamSession',
        targetId: sessionId,
        metadata: { warningId: warning.id },
      },
    });
    return warning;
  }

  async acknowledgeWarning(
    sessionId: string,
    warningId: string,
    studentId: string
  ) {
    const warning = await this.prisma.proctorWarning.findFirst({
      where: { id: warningId, sessionId, session: { studentId } },
      include: { session: { select: { examId: true } } },
    });
    if (!warning) throw new NotFoundException('Warning not found');
    const acknowledgedAt = warning.acknowledgedAt ?? new Date();
    if (!warning.acknowledgedAt)
      await this.prisma.proctorWarning.update({
        where: { id: warningId },
        data: { acknowledgedAt },
      });
    this.gateway.warningAcknowledged(
      warning.session.examId,
      sessionId,
      warningId
    );
    return { id: warningId, acknowledgedAt };
  }

  async addExtraTime(sessionId: string, teacherId: string, minutes: number) {
    const session = await this.teacherSession(sessionId, teacherId);
    this.assertExtraTimeWindow(session.exam);
    if (session.status === SessionStatus.COMPLETED)
      throw new ConflictException(
        'This student has already completed the assessment'
      );
    const now = new Date();
    const addedSeconds = minutes * 60;
    const extraTimeSeconds = session.extraTimeSeconds + addedSeconds;
    const remainingSeconds = sessionRemainingSeconds(
      { ...session, extraTimeSeconds },
      session.exam,
      now
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.examSession.updateMany({
        where: {
          id: sessionId,
          status: { not: SessionStatus.COMPLETED },
          exam: {
            status: 'PUBLISHED',
            scheduledAt: { lte: now },
            endsAt: { gt: now },
          },
        },
        data: {
          remainingSeconds,
          extraTimeSeconds,
          activeStartedAt: now,
          lastHeartbeatAt: now,
        },
      });
      if (!updated.count) {
        const current = await tx.examSession.findUnique({
          where: { id: sessionId },
          select: {
            status: true,
            exam: {
              select: { status: true, scheduledAt: true, endsAt: true },
            },
          },
        });
        if (current?.status === SessionStatus.COMPLETED)
          throw new ConflictException(
            'This student has already completed the assessment'
          );
        if (current) this.assertExtraTimeWindow(current.exam);
        throw new ConflictException(
          'The assessment is no longer eligible for extra time'
        );
      }
      await tx.examStudentOverride.upsert({
        where: {
          examId_studentId: {
            examId: session.examId,
            studentId: session.studentId,
          },
        },
        create: {
          examId: session.examId,
          studentId: session.studentId,
          extraTimeMinutes: minutes,
        },
        update: { extraTimeMinutes: { increment: minutes } },
      });
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'EXAM_EXTRA_TIME_GRANTED',
          targetType: 'ExamSession',
          targetId: sessionId,
          metadata: { minutes, remainingSeconds },
        },
      });
      await tx.notification.create({
        data: {
          userId: session.studentId,
          type: 'EXAM_EXTRA_TIME_GRANTED',
          message: `Your teacher granted ${minutes} additional minutes for "${session.exam.title}".`,
          link: '/student/calendar',
        },
      });
    });
    this.gateway.timeAdjusted(
      session.examId,
      sessionId,
      remainingSeconds,
      extraTimeSeconds
    );
    return {
      sessionId,
      minutesAdded: minutes,
      remainingSeconds,
      extraTimeSeconds,
    };
  }

  async grantPreExamExtraTime(
    examId: string,
    studentId: string,
    teacherId: string,
    minutes: number
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: {
        id: examId,
        subject: {
          teacherId,
          enrollments: { some: { studentId } },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        endsAt: true,
      },
    });
    if (!exam)
      throw new NotFoundException('Exam or enrolled student not found');
    this.assertExtraTimeWindow(exam);
    const session = await this.prisma.examSession.findUnique({
      where: { examId_studentId: { examId, studentId } },
      select: { id: true, status: true },
    });
    if (session?.status === SessionStatus.COMPLETED)
      throw new ConflictException(
        'This student has already completed the assessment'
      );
    if (session) return this.addExtraTime(session.id, teacherId, minutes);
    const override = await this.prisma.$transaction(async (tx) => {
      const currentExam = await tx.exam.findUnique({
        where: { id: examId },
        select: { status: true, scheduledAt: true, endsAt: true },
      });
      if (!currentExam) throw new NotFoundException('Assessment not found');
      this.assertExtraTimeWindow(currentExam);
      const currentSession = await tx.examSession.findUnique({
        where: { examId_studentId: { examId, studentId } },
        select: { status: true },
      });
      if (currentSession)
        throw new ConflictException(
          currentSession.status === SessionStatus.COMPLETED
            ? 'This student has already completed the assessment'
            : 'The assessment attempt changed. Refresh the status and try again'
        );
      const savedOverride = await tx.examStudentOverride.upsert({
        where: { examId_studentId: { examId, studentId } },
        create: { examId, studentId, extraTimeMinutes: minutes },
        update: { extraTimeMinutes: { increment: minutes } },
      });
      await tx.notification.create({
        data: {
          userId: studentId,
          type: 'EXAM_EXTRA_TIME_GRANTED',
          message: `Your teacher granted ${minutes} additional minutes for "${exam.title}".`,
          link: '/student/calendar',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'EXAM_EXTRA_TIME_GRANTED',
          targetType: 'Exam',
          targetId: examId,
          metadata: { studentId, minutes, beforeStart: true },
        },
      });
      return savedOverride;
    });
    return override;
  }

  async resume(sessionId: string, teacherId: string) {
    const session = await this.teacherSession(sessionId, teacherId);
    if (session.status === SessionStatus.COMPLETED)
      throw new ConflictException('A completed attempt cannot be resumed');
    const updated = await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.IN_PROGRESS,
        isLocked: false,
        resumeAuthorizedAt: new Date(),
      },
      select: { id: true, status: true, resumeAuthorizedAt: true },
    });
    this.gateway.lock(sessionId, false);
    this.gateway.resume(sessionId);
    await this.prisma.auditLog.create({
      data: {
        actorId: teacherId,
        action: 'EXAM_SESSION_RESUMED',
        targetType: 'ExamSession',
        targetId: sessionId,
      },
    });
    return updated;
  }

  async control(
    sessionId: string,
    teacherId: string,
    action: 'warn' | 'lock' | 'unlock'
  ) {
    const session = await this.teacherSession(sessionId, teacherId);
    if (action === 'warn')
      return this.sendWarning(
        sessionId,
        teacherId,
        'Your teacher has sent a review reminder.'
      );
    const locked = action === 'lock';
    await this.prisma.examSession.update({
      where: { id: sessionId },
      data: { isLocked: locked },
    });
    this.gateway.lock(sessionId, locked);
    return { id: session.id, locked };
  }

  async playback(sessionId: string, teacherId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: { include: { subject: true } },
        recording: true,
        scoreHistory: { orderBy: { computedAt: 'asc' } },
      },
    });
    if (!session || session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    return session;
  }
}
