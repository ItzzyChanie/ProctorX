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
  QuestionType,
  RecordingStatus,
  SessionStatus,
} from '@prisma/client';
import {
  appendFile,
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { join } from 'path';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from './sessions.gateway';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway
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
      const scheduledSeconds = exam.endsAt
        ? Math.max(0, Math.floor((+exam.endsAt - +now) / 1000)) +
          extraTimeSeconds
        : exam.durationMinutes * 60 + extraTimeSeconds;
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
          remainingSeconds: Math.min(
            exam.durationMinutes * 60 + extraTimeSeconds,
            scheduledSeconds
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
      const previouslyConsumed =
        session.activeStartedAt && session.lastHeartbeatAt
          ? Math.max(
              0,
              Math.floor(
                (+session.lastHeartbeatAt - +session.activeStartedAt) / 1000
              )
            )
          : 0;
      const deadlineSeconds = exam.endsAt
        ? Math.max(
            0,
            Math.floor((+exam.endsAt - +now) / 1000) + session.extraTimeSeconds
          )
        : Number.MAX_SAFE_INTEGER;
      const remainingSeconds = Math.min(
        Math.max(
          0,
          (session.remainingSeconds ??
            exam.durationMinutes * 60 + session.extraTimeSeconds) -
            previouslyConsumed
        ),
        deadlineSeconds
      );
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

  async monitorableExams(teacherId: string) {
    const exams = await this.prisma.exam.findMany({
      where: { subject: { teacherId } },
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
    return exams.map((exam) => ({
      ...exam,
      sessionCount: exam._count.sessions,
      _count: { sessions: this.gateway.activeSessionIds(exam.id).size },
    }));
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
    const event = await this.prisma.proctoringEvent.create({
      data: {
        sessionId,
        type,
        metadata: metadata as any,
        occurredAt: new Date(),
      },
    });
    await this.prisma.incident.create({
      data: { sessionId, eventId: event.id },
    });
    const connectedAt = this.gateway.connectedAt(sessionId);
    const all = await this.prisma.proctoringEvent.findMany({
      where: {
        sessionId,
        ...(connectedAt ? { occurredAt: { gte: connectedAt } } : {}),
      },
    });
    const score = await this.ai.scoreReduced(sessionId, studentId, {
      tab_switch_count: all.filter((x) => x.type === EventType.TAB_SWITCH)
        .length,
      blacklisted_app_seconds: all
        .filter((x) => x.type === EventType.BLACKLISTED_APP)
        .reduce((n, x) => n + Number((x.metadata as any)?.seconds ?? 0), 0),
      idle_seconds: all
        .filter((x) => x.type === EventType.IDLE)
        .reduce((n, x) => n + Number((x.metadata as any)?.seconds ?? 0), 0),
      usb_event_count: all.filter((x) => x.type === EventType.USB_EVENT).length,
    });
    await this.prisma.suspicionScoreSnapshot.create({
      data: {
        sessionId,
        score: score.suspicion_score,
        tier: score.tier.toUpperCase(),
        contributingFactors: score.contributing_factors,
        computedAt: new Date(),
      },
    });
    this.gateway.emitMonitor(session.examId, 'monitor:update', {
      sessionId,
      studentId,
      score: score.suspicion_score,
      tier: score.tier,
      event,
    });
    return { ...score, eventId: event.id, occurredAt: event.occurredAt };
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
    chunk: Buffer
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
    const path = join(dir, `${event.id}-${input.phase.toLowerCase()}.webm`);
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
  async recording(sessionId: string, studentId: string, chunk: Buffer) {
    const session = await this.prisma.examSession.findFirst({
      where: {
        id: sessionId,
        studentId,
        OR: [
          { status: SessionStatus.IN_PROGRESS },
          {
            status: SessionStatus.COMPLETED,
            endedAt: { gte: new Date(Date.now() - 30_000) },
          },
        ],
      },
    });
    if (!session) throw new ForbiddenException();
    const dir = join(process.cwd(), 'storage', 'recordings');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${sessionId}.webm`);
    await appendFile(path, chunk);
    const record = await this.prisma.recording.upsert({
      where: { sessionId },
      create: {
        sessionId,
        storagePath: path,
        status: RecordingStatus.UPLOADING,
        fileSizeBytes: BigInt(chunk.length),
      },
      update: { fileSizeBytes: { increment: BigInt(chunk.length) } },
    });
    return { id: record.id };
  }

  async monitor(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, subject: { teacherId } },
    });
    if (!exam) throw new ForbiddenException();
    const activeIds = this.gateway.activeSessionIds(examId);
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
        events: true,
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
    const now = Date.now();
    return sessions.map((session) => ({
      ...session,
      connected: activeIds.has(session.id),
      connectionStatus: activeIds.has(session.id)
        ? 'CONNECTED'
        : 'DISCONNECTED',
      eventCount: session.events.length,
      raisedHand: Boolean(session.raiseHandRequests.length),
      remainingSeconds: Math.max(
        0,
        (session.remainingSeconds ?? exam.durationMinutes * 60) -
          (session.activeStartedAt
            ? Math.floor((now - +session.activeStartedAt) / 1000)
            : 0)
      ),
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
    if (session.status === SessionStatus.COMPLETED)
      throw new ConflictException('This assessment attempt has ended');
    const now = new Date();
    const elapsed = session.activeStartedAt
      ? Math.max(0, Math.floor((+now - +session.activeStartedAt) / 1000))
      : 0;
    const currentRemaining = Math.max(
      0,
      (session.remainingSeconds ?? session.exam.durationMinutes * 60) - elapsed
    );
    const addedSeconds = minutes * 60;
    const remainingSeconds = currentRemaining + addedSeconds;
    const extraTimeSeconds = session.extraTimeSeconds + addedSeconds;
    await this.prisma.$transaction([
      this.prisma.examSession.update({
        where: { id: sessionId },
        data: {
          remainingSeconds,
          extraTimeSeconds,
          activeStartedAt: now,
          lastHeartbeatAt: now,
        },
      }),
      this.prisma.examStudentOverride.upsert({
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
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'EXAM_EXTRA_TIME_GRANTED',
          targetType: 'ExamSession',
          targetId: sessionId,
          metadata: { minutes, remainingSeconds },
        },
      }),
    ]);
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
      select: { id: true, title: true },
    });
    if (!exam)
      throw new NotFoundException('Exam or enrolled student not found');
    const session = await this.prisma.examSession.findUnique({
      where: { examId_studentId: { examId, studentId } },
      select: { id: true, status: true },
    });
    if (session?.status === SessionStatus.COMPLETED)
      throw new ConflictException(
        'A completed attempt cannot receive extra time'
      );
    if (session) return this.addExtraTime(session.id, teacherId, minutes);
    const [override] = await this.prisma.$transaction([
      this.prisma.examStudentOverride.upsert({
        where: { examId_studentId: { examId, studentId } },
        create: { examId, studentId, extraTimeMinutes: minutes },
        update: { extraTimeMinutes: { increment: minutes } },
      }),
      this.prisma.notification.create({
        data: {
          userId: studentId,
          type: 'EXAM_EXTRA_TIME_GRANTED',
          message: `Your teacher granted ${minutes} additional minutes for "${exam.title}".`,
          link: '/student/calendar',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: teacherId,
          action: 'EXAM_EXTRA_TIME_GRANTED',
          targetType: 'Exam',
          targetId: examId,
          metadata: { studentId, minutes, beforeStart: true },
        },
      }),
    ]);
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
