import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RetentionService, retentionDays } from './retention.service';

test('the default retention period is 180 days', () => {
  const previous = process.env.EVIDENCE_RETENTION_DAYS;
  delete process.env.EVIDENCE_RETENTION_DAYS;
  assert.equal(retentionDays(), 180);
  process.env.EVIDENCE_RETENTION_DAYS = 'abc';
  assert.equal(retentionDays(), 180);
  process.env.EVIDENCE_RETENTION_DAYS = '30';
  assert.equal(retentionDays(), 30);
  if (previous === undefined) delete process.env.EVIDENCE_RETENTION_DAYS;
  else process.env.EVIDENCE_RETENTION_DAYS = previous;
});

test('expired recordings and clips are deleted from disk and database, with an audit entry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'proctorx-retention-'));
  const recordingPath = join(dir, 'session.webm');
  const clipPath = join(dir, 'clip.webm');
  writeFileSync(recordingPath, 'x');
  writeFileSync(clipPath, 'x');
  const owner = {
    session: { exam: { subject: { teacher: { institutionId: 'inst-1' } } } },
  };
  let cutoffSeen: Date | undefined;
  const deleted: string[] = [];
  const audits: any[] = [];
  const prisma: any = {
    recording: {
      findMany: async ({ where }: any) => {
        cutoffSeen = where.session.endedAt.lt;
        return [{ id: 'rec-1', storagePath: recordingPath, ...owner }];
      },
      deleteMany: ({ where }: any) => {
        deleted.push(...where.id.in);
        return Promise.resolve();
      },
    },
    evidenceClip: {
      findMany: async () => [{ id: 'clip-1', storagePath: clipPath, ...owner }],
      deleteMany: ({ where }: any) => {
        deleted.push(...where.id.in);
        return Promise.resolve();
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    user: { findFirst: async () => ({ id: 'dean-1' }) },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
      },
    },
  };
  const service = new RetentionService(prisma);
  const now = new Date('2026-11-15T00:00:00Z');
  const result = await service.purgeExpired(now);

  assert.deepEqual(result, { recordings: 1, evidenceClips: 1 });
  assert.equal(+now - +cutoffSeen!, 180 * 24 * 60 * 60 * 1000);
  assert.ok(!existsSync(recordingPath) && !existsSync(clipPath));
  assert.deepEqual(deleted.sort(), ['clip-1', 'rec-1']);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'EVIDENCE_RETENTION_PURGE');
  assert.equal(audits[0].metadata.automated, true);
});
