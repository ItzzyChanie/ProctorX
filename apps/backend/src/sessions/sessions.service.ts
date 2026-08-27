import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventType, RecordingStatus, SessionStatus } from '@prisma/client';
import { appendFile, mkdir } from 'fs/promises';
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
    const exam = await this.prisma.exam.findFirst({
      where: {
        roomCode: code.trim().toUpperCase(),
        status: 'PUBLISHED',
        subject: { enrollments: { some: { studentId } } },
      },
      include: {
        questions: {
          include: { options: { select: { id: true, label: true } } },
          orderBy: { order: 'asc' },
        },
        subject: true,
      },
    });
    if (!exam)
      throw new NotFoundException(
        'No published enrolled exam matches this room code'
      );
    const now = new Date();
    if (exam.scheduledAt && now < exam.scheduledAt)
      throw new ConflictException('This assessment has not started yet');
    if (exam.endsAt && now > exam.endsAt)
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
      subject: {
        id: exam.subject.id,
        name: exam.subject.name,
        subjectCode: exam.subject.subjectCode,
      },
    };
  }

  async join(code: string, studentId: string) {
    const exam = await this.availableExam(code, studentId);
    let session = await this.prisma.examSession.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId } },
    });
    if (session?.status === SessionStatus.COMPLETED)
      throw new ConflictException('This exam has already been completed');
    if (!session)
      session = await this.prisma.examSession.create({
        data: {
          examId: exam.id,
          studentId,
          startedAt: new Date(),
          status: SessionStatus.IN_PROGRESS,
        },
      });
    this.gateway.emitMonitor(exam.id, 'monitor:session-start', {
      sessionId: session.id,
    });
    return {
      session,
      exam: {
        id: exam.id,
        title: exam.title,
        assessmentType: exam.assessmentType,
        instructions: exam.instructions,
        durationMinutes: exam.durationMinutes,
        requireCamera: exam.requireCamera,
        requireMicrophone: exam.requireMicrophone,
        sourceType: exam.sourceType,
        externalFormUrl: exam.externalFormUrl,
        questions: exam.questions,
      },
    };
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
    return score;
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
    const activeIds = [...this.gateway.activeSessionIds(examId)];
    if (!activeIds.length) return [];
    const sessions = await this.prisma.examSession.findMany({
      where: {
        examId,
        id: { in: activeIds },
        status: SessionStatus.IN_PROGRESS,
      },
      include: {
        student: { select: { fullName: true } },
        scoreHistory: { orderBy: { computedAt: 'desc' } },
        events: true,
      },
    });
    return sessions.map((session) => {
      const connectedAt = this.gateway.connectedAt(session.id);
      if (!connectedAt) return { ...session, events: [], scoreHistory: [] };
      return {
        ...session,
        events: session.events.filter(
          (event) => event.occurredAt >= connectedAt
        ),
        scoreHistory: session.scoreHistory
          .filter((score) => score.computedAt >= connectedAt)
          .slice(0, 1),
      };
    });
  }

  async control(
    sessionId: string,
    teacherId: string,
    action: 'warn' | 'lock' | 'unlock'
  ) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: { include: { subject: true } } },
    });
    if (!session || session.exam.subject.teacherId !== teacherId)
      throw new ForbiddenException();
    if (action === 'warn')
      this.gateway.warn(sessionId, 'Your teacher has sent a review reminder.');
    else this.gateway.lock(sessionId, action === 'lock');
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
