import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { AppThrottlerGuard } from './app-throttler.guard';

const guard = new AppThrottlerGuard(
  { throttlers: [] } as never,
  {} as never,
  new Reflector()
);
const tracker = (req: Record<string, unknown>) =>
  (guard as unknown as { getTracker(r: unknown): Promise<string> }).getTracker(req);

test('students on one campus IP get separate sign-in buckets', async () => {
  const a = await tracker({ ip: '203.0.113.7', body: { loginId: '2023-0001' } });
  const b = await tracker({ ip: '203.0.113.7', body: { loginId: '2023-0002' } });
  assert.notEqual(a, b);
  // Same account from the same address shares one bucket (brute-force guard).
  const again = await tracker({ ip: '203.0.113.7', body: { loginId: ' 2023-0001 ' } });
  assert.equal(a, again);
});

test('signed-in traffic is limited per browser session, not per IP', async () => {
  const a = await tracker({ ip: '203.0.113.7', headers: { cookie: 'proctorx_session=token-a' } });
  const b = await tracker({ ip: '203.0.113.7', headers: { cookie: 'proctorx_session=token-b' } });
  assert.notEqual(a, b);
  assert.ok(!a.includes('token-a'), 'the raw token must not be used as a key');
});
