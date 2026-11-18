import assert from 'node:assert/strict';
import test from 'node:test';
import { runExclusive } from './job-lock';

const prismaWithLock = (locked: boolean) =>
  ({
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({ $queryRaw: async () => [{ locked }] }),
  }) as never;

test('the job runs when this instance obtains the lock', async () => {
  let runs = 0;
  const ran = await runExclusive(prismaWithLock(true), 'job', async () => {
    runs += 1;
  });
  assert.equal(ran, true);
  assert.equal(runs, 1);
});

test('the job is skipped while another instance holds the lock', async () => {
  let runs = 0;
  const ran = await runExclusive(prismaWithLock(false), 'job', async () => {
    runs += 1;
  });
  assert.equal(ran, false);
  assert.equal(runs, 0);
});
