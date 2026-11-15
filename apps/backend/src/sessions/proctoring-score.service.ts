import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventType, Prisma, ProctoringEvent, RiskTier } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { runExclusive } from '../common/job-lock';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from './sessions.gateway';

/** Repeats of the same behaviour within this window share one incident. */
export const INCIDENT_GROUP_SECONDS = 30;
const RESCORE_INTERVAL_MS = 30_000;

type ScoringSession = {
  id: string;
  examId: string;
  studentId: string;
  exam: { requireCamera: boolean; requireMicrophone: boolean };
};

type Aggregate = {
  type: string;
  count: number;
  seconds: number;
  latest: number | null;
};

/** The AI returns "Low" / "Medium" / "High"; anything unexpected is treated as HIGH for review. */
export function toRiskTier(tier: string): RiskTier {
  const value = String(tier).toUpperCase();
  return (Object.values(RiskTier) as string[]).includes(value)
    ? (value as RiskTier)
    : RiskTier.HIGH;
}

export type Score = {
  suspicion_score: number;
  tier: string;
  contributing_factors: unknown;
};

/**
 * One place that records proctoring events and turns the whole attempt into
 * a suspicion score.
 *
 * - Indicators come from a single aggregate query, not by loading every event.
 * - Browser events and camera/microphone findings use the same indicator set,
 *   so the latest score never flips between two partial views.
 * - If the AI service is down, events and incidents are still saved and
 *   teachers still see them live; a background job rescores later.
 */
@Injectable()
export class ProctoringScoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProctoringScoreService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () =>
        void runExclusive(this.prisma, 'rescore-pending', () =>
          this.rescorePending()
        ).catch((error) =>
          this.logger.warn(`Pending rescoring skipped: ${String(error)}`)
        ),
      RESCORE_INTERVAL_MS
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Saves an event and opens an incident unless one is already open for it. */
  async record(
    sessionId: string,
    data: {
      type: EventType;
      metadata?: Prisma.InputJsonValue;
      intensity?: number;
    }
  ): Promise<ProctoringEvent> {
    const occurredAt = new Date();
    const event = await this.prisma.proctoringEvent.create({
      data: {
        sessionId,
        type: data.type,
        intensity: data.intensity,
        metadata: data.metadata,
        occurredAt,
      },
    });
    const recentSameType = await this.prisma.proctoringEvent.findMany({
      where: {
        sessionId,
        type: data.type,
        id: { not: event.id },
        occurredAt: {
          gte: new Date(+occurredAt - INCIDENT_GROUP_SECONDS * 1000),
        },
      },
      select: { id: true },
    });
    const grouped = recentSameType.length
      ? await this.prisma.incident.findFirst({
          where: {
            sessionId,
            status: 'OPEN',
            eventId: { in: recentSameType.map(({ id }) => id) },
          },
          select: { id: true },
        })
      : null;
    if (!grouped)
      await this.prisma.incident.create({
        data: { sessionId, eventId: event.id },
      });
    return event;
  }

  /** Scores the whole attempt. Returns null when the AI service is down. */
  async rescore(session: ScoringSession): Promise<Score | null> {
    const rows = await this.prisma.$queryRaw<Aggregate[]>`
      SELECT "type"::text AS "type",
             COUNT(*)::int AS "count",
             COALESCE(SUM(
               CASE WHEN "metadata"->>'seconds' ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN ("metadata"->>'seconds')::float ELSE 0 END
             ), 0)::float AS "seconds",
             (ARRAY_AGG("intensity" ORDER BY "occurredAt" DESC))[1] AS "latest"
      FROM "proctoring_events"
      WHERE "sessionId" = ${session.id}
      GROUP BY "type"`;
    const by = new Map(rows.map((row) => [row.type, row]));
    const count = (type: EventType) => by.get(type)?.count ?? 0;
    const seconds = (type: EventType) => by.get(type)?.seconds ?? 0;
    const latest = (type: EventType) => by.get(type)?.latest ?? 0;

    const base = {
      tab_switch_count: count(EventType.TAB_SWITCH),
      blacklisted_app_seconds: seconds(EventType.BLACKLISTED_APP),
      idle_seconds: seconds(EventType.IDLE),
      usb_event_count: count(EventType.USB_EVENT),
    };
    const { requireCamera, requireMicrophone } = session.exam;
    let score: Score;
    try {
      score =
        requireCamera || requireMicrophone
          ? await this.ai.scoreFull(session.id, session.studentId, {
              ...base,
              ...(requireCamera
                ? {
                    face_not_visible: latest(EventType.FACE_NOT_VISIBLE),
                    excessive_eye_movement: latest(
                      EventType.EXCESSIVE_EYE_MOVEMENT
                    ),
                    possible_talking: latest(EventType.POSSIBLE_TALKING),
                    multiple_faces: latest(EventType.MULTIPLE_FACES_DETECTED),
                  }
                : {}),
              ...(requireMicrophone
                ? { voice_detected: latest(EventType.VOICE_DETECTED) }
                : {}),
            })
          : await this.ai.scoreReduced(session.id, session.studentId, base);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) return null;
      throw error;
    }
    await this.prisma.suspicionScoreSnapshot.create({
      data: {
        sessionId: session.id,
        score: score.suspicion_score,
        tier: toRiskTier(score.tier),
        contributingFactors: score.contributing_factors as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });
    return score;
  }

  /** Pushes new events (and the score, when available) to monitoring teachers. */
  publish(
    session: Pick<ScoringSession, 'id' | 'examId' | 'studentId'>,
    events: ProctoringEvent[],
    score: Score | null
  ) {
    for (const event of events)
      this.gateway.emitMonitor(session.examId, 'monitor:update', {
        sessionId: session.id,
        studentId: session.studentId,
        score: score?.suspicion_score ?? null,
        tier: score?.tier ?? null,
        scorePending: !score,
        event,
      });
  }

  /** Rescores attempts whose newest event is newer than their newest score. */
  private async rescorePending() {
    const pending = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id"
      FROM "exam_sessions" s
      WHERE s."status" = 'IN_PROGRESS'
        AND EXISTS (
          SELECT 1 FROM "proctoring_events" e
          WHERE e."sessionId" = s."id"
            AND e."occurredAt" > COALESCE(
              (SELECT MAX(x."computedAt") FROM "suspicion_score_snapshots" x
               WHERE x."sessionId" = s."id"),
              'epoch'::timestamp)
        )
      LIMIT 200`;
    for (const { id } of pending) {
      const session = await this.prisma.examSession.findUnique({
        where: { id },
        select: {
          id: true,
          examId: true,
          studentId: true,
          exam: { select: { requireCamera: true, requireMicrophone: true } },
        },
      });
      if (!session) continue;
      const score = await this.rescore(session);
      if (!score) return; // AI still unavailable; try again next round.
      this.gateway.emitMonitor(session.examId, 'monitor:update', {
        sessionId: session.id,
        studentId: session.studentId,
        score: score.suspicion_score,
        tier: score.tier,
      });
    }
  }
}
