import assert from 'node:assert/strict';
import test from 'node:test';
import { extraTimeWindowError } from './extra-time-policy';

const now = new Date('2026-09-16T08:00:00.000Z');

test('extra time is allowed only inside a published assessment window', () => {
  assert.equal(
    extraTimeWindowError(
      {
        status: 'PUBLISHED',
        scheduledAt: new Date('2026-09-16T07:00:00.000Z'),
        endsAt: new Date('2026-09-16T09:00:00.000Z'),
      },
      now
    ),
    null
  );
  assert.equal(
    extraTimeWindowError(
      {
        status: 'PUBLISHED',
        scheduledAt: new Date('2026-09-16T09:00:00.000Z'),
        endsAt: new Date('2026-09-16T10:00:00.000Z'),
      },
      now
    ),
    'This assessment has not started yet'
  );
  assert.equal(
    extraTimeWindowError(
      {
        status: 'PUBLISHED',
        scheduledAt: new Date('2026-09-16T06:00:00.000Z'),
        endsAt: now,
      },
      now
    ),
    'This assessment has already ended'
  );
  assert.equal(
    extraTimeWindowError(
      {
        status: 'ARCHIVED',
        scheduledAt: new Date('2026-09-16T07:00:00.000Z'),
        endsAt: new Date('2026-09-16T09:00:00.000Z'),
      },
      now
    ),
    'This assessment is not live'
  );
});
