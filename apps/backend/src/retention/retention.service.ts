import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { runExclusive } from '../common/job-lock';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 180;
const FIRST_RUN_DELAY_MS = 60_000;

export function retentionDays() {
  const configured = Number(process.env.EVIDENCE_RETENTION_DAYS);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_RETENTION_DAYS;
}

type PurgeResult = { recordings: number; evidenceClips: number };

/**
 * Data-retention policy (RA 10173 storage limitation): screen recordings and
 * incident evidence clips are deleted once the attempt ended more than
 * EVIDENCE_RETENTION_DAYS ago (default 180 - one semester plus appeals).
 * Scores, events and the audit trail are kept.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  lastRunAt: Date | null = null;
  lastResult: PurgeResult | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const run = () =>
      void runExclusive(this.prisma, 'retention-purge', () =>
        this.purgeExpired()
      ).catch((error) =>
        this.logger.error(`Retention purge failed: ${String(error)}`)
      );
    this.timers.push(setTimeout(run, FIRST_RUN_DELAY_MS));
    this.timers.push(setInterval(run, DAY_MS));
  }

  onModuleDestroy() {
    this.timers.forEach((timer) => clearTimeout(timer));
  }

  async purgeExpired(now = new Date()): Promise<PurgeResult> {
    if (this.running) return { recordings: 0, evidenceClips: 0 };
    this.running = true;
    try {
      const cutoff = new Date(+now - retentionDays() * DAY_MS);
      const expired = { session: { endedAt: { lt: cutoff } } };
      const owner = {
        session: {
          select: {
            exam: {
              select: {
                subject: {
                  select: { teacher: { select: { institutionId: true } } },
                },
              },
            },
          },
        },
      };
      const [recordings, clips] = await Promise.all([
        this.prisma.recording.findMany({
          where: expired,
          select: { id: true, storagePath: true, ...owner },
        }),
        this.prisma.evidenceClip.findMany({
          where: expired,
          select: { id: true, storagePath: true, ...owner },
        }),
      ]);
      if (!recordings.length && !clips.length) {
        this.record(now, { recordings: 0, evidenceClips: 0 });
        return { recordings: 0, evidenceClips: 0 };
      }

      await Promise.all(
        [...recordings, ...clips].map((item) =>
          unlink(item.storagePath).catch(() => undefined)
        )
      );
      await this.prisma.$transaction([
        this.prisma.evidenceClip.deleteMany({
          where: { id: { in: clips.map(({ id }) => id) } },
        }),
        this.prisma.recording.deleteMany({
          where: { id: { in: recordings.map(({ id }) => id) } },
        }),
      ]);

      // One audit entry per institution, attributed to its dean (the data
      // controller) and marked as automated.
      const perInstitution = new Map<string, PurgeResult>();
      const tally = (
        institutionId: string | null | undefined,
        key: keyof PurgeResult
      ) => {
        if (!institutionId) return;
        const entry = perInstitution.get(institutionId) ?? {
          recordings: 0,
          evidenceClips: 0,
        };
        entry[key] += 1;
        perInstitution.set(institutionId, entry);
      };
      recordings.forEach((item) =>
        tally(item.session.exam.subject.teacher.institutionId, 'recordings')
      );
      clips.forEach((item) =>
        tally(item.session.exam.subject.teacher.institutionId, 'evidenceClips')
      );
      for (const [institutionId, counts] of perInstitution) {
        const dean = await this.prisma.user.findFirst({
          where: { institutionId, role: Role.DEAN },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!dean) continue;
        await this.prisma.auditLog.create({
          data: {
            actorId: dean.id,
            action: 'EVIDENCE_RETENTION_PURGE',
            targetType: 'Institution',
            targetId: institutionId,
            metadata: {
              automated: true,
              retentionDays: retentionDays(),
              cutoff: cutoff.toISOString(),
              ...counts,
            },
          },
        });
      }

      const result = {
        recordings: recordings.length,
        evidenceClips: clips.length,
      };
      this.logger.log(
        `Retention purge removed ${result.recordings} recording(s) and ${result.evidenceClips} evidence clip(s).`
      );
      this.record(now, result);
      return result;
    } finally {
      this.running = false;
    }
  }

  private record(at: Date, result: PurgeResult) {
    this.lastRunAt = at;
    this.lastResult = result;
  }
}
