import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventType, ProctoringEvent, SessionStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { monitoringIntervals } from './monitoring-config';
import { ProctoringScoreService } from './proctoring-score.service';

const FINDING_TYPES: Record<string, EventType> = {
  face_not_visible: EventType.FACE_NOT_VISIBLE,
  excessive_eye_movement: EventType.EXCESSIVE_EYE_MOVEMENT,
  possible_talking: EventType.POSSIBLE_TALKING,
  multiple_faces: EventType.MULTIPLE_FACES_DETECTED,
  voice_detected: EventType.VOICE_DETECTED,
};

type Finding = { event?: boolean; intensity?: number; duration_seconds?: number };
type Streaks = Record<string, number>;

/** Face streaks are forgotten after this long without a frame. */
const STREAK_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class MonitoringAnalysisService {
  /**
   * Per-attempt face "streak" counters (how many consecutive frames showed
   * the same behaviour). Kept here so the AI service is stateless and can run
   * as several processes. With several backend instances, route a student's
   * requests to one instance (sticky sessions) or streaks restart there.
   */
  private streaks = new Map<string, { state: Streaks; at: number }>();
  private analyses = 0;

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private scoring: ProctoringScoreService
  ) {}

  private previousStreaks(sessionId: string, now: number) {
    if (++this.analyses % 500 === 0)
      for (const [id, entry] of this.streaks)
        if (now - entry.at > STREAK_TTL_MS) this.streaks.delete(id);
    return this.streaks.get(sessionId)?.state;
  }

  async analyze(
    sessionId: string,
    studentId: string,
    kind: 'face' | 'audio',
    sample: Buffer,
    mimeType?: string
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId, status: SessionStatus.IN_PROGRESS },
      select: {
        id: true,
        examId: true,
        studentId: true,
        exam: { select: { requireCamera: true, requireMicrophone: true } },
      },
    });
    if (!session) throw new ForbiddenException();
    if (
      (kind === 'face' && !session.exam.requireCamera) ||
      (kind === 'audio' && !session.exam.requireMicrophone)
    )
      return { skipped: true };

    const now = Date.now();
    const { state, ...result } = (await this.ai.analyze(
      kind,
      sessionId,
      sample,
      kind === 'face' ? 'frame.jpg' : 'sample.wav',
      monitoringIntervals().faceSampleSeconds,
      mimeType,
      kind === 'face' ? this.previousStreaks(sessionId, now) : undefined
    )) as Record<string, Finding | unknown> & { state?: Streaks };
    if (kind === 'face' && state && typeof state === 'object')
      this.streaks.set(sessionId, { state, at: now });

    const emitted: ProctoringEvent[] = [];
    for (const [name, value] of Object.entries(result)) {
      const finding = value as Finding;
      const type = FINDING_TYPES[name];
      if (!type || !finding?.event) continue;
      emitted.push(
        await this.scoring.record(sessionId, {
          type,
          intensity: finding.intensity,
          metadata: { duration_seconds: finding.duration_seconds ?? 0 },
        })
      );
    }
    if (!emitted.length) return result;
    const score = await this.scoring.rescore(session);
    this.scoring.publish(session, emitted, score);
    return result;
  }
}
