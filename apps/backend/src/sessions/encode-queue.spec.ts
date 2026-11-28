import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EncodeQueue } from './encode-queue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('never runs more tasks at once than the limit, and runs them all', async () => {
  const queue = new EncodeQueue(2);
  let running = 0;
  let peak = 0;
  const order: number[] = [];
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      queue.run(async () => {
        running++;
        peak = Math.max(peak, running);
        order.push(index);
        await tick();
        running--;
        return index;
      })
    )
  );
  assert.equal(peak, 2);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // First come, first served.
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a failing task frees its slot for the next one', async () => {
  const queue = new EncodeQueue(1);
  const failed = queue.run(async () => {
    await tick();
    throw new Error('ffmpeg failed');
  });
  const next = queue.run(async () => 'done');
  await assert.rejects(failed, /ffmpeg failed/);
  assert.equal(await next, 'done');
});
