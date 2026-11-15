import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';

function harness(owners: { actorId: string; targetId: string }[]) {
  const prisma = {
    auditLog: {
      findFirst: async ({ where }: any) =>
        owners.find(
          (row) =>
            row.actorId === where.actorId && row.targetId === where.targetId
        ) ?? null,
    },
  };
  const ai = {
    jobStatus: async (jobId: string) => ({ job_id: jobId, status: 'PENDING' }),
  };
  return new ReportsService(prisma as never, ai as never, {} as never);
}

test('a teacher can poll a report job they requested', async () => {
  const service = harness([{ actorId: 'teacher-a', targetId: 'job-1' }]);
  const status = await service.jobStatus('job-1', 'teacher-a');
  assert.equal(status.job_id, 'job-1');
});

test("a teacher cannot poll or download another teacher's report job", async () => {
  const service = harness([{ actorId: 'teacher-a', targetId: 'job-1' }]);
  await assert.rejects(service.jobStatus('job-1', 'teacher-b'), NotFoundException);
  await assert.rejects(
    service.jobDownload('job-1', 'teacher-b'),
    NotFoundException
  );
});
