import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStatus } from '@prisma/client';
import { isLiveLoginSession } from './login-session';

const future = new Date(Date.now() + 60_000);
const prismaWith = (row: unknown) =>
  ({ loginSession: { findUnique: async () => row } }) as never;
const active = { isActive: true, status: AccountStatus.ACTIVE };

test('a live session for the same user is accepted', async () => {
  const prisma = prismaWith({ userId: 'u1', expiresAt: future, user: active });
  assert.equal(await isLiveLoginSession(prisma, 'u1', 's1'), true);
});

test('revoked, expired, foreign or disabled sessions are rejected', async () => {
  assert.equal(await isLiveLoginSession(prismaWith(null), 'u1', 's1'), false);
  assert.equal(await isLiveLoginSession(prismaWith({}), 'u1', undefined), false);
  assert.equal(
    await isLiveLoginSession(
      prismaWith({ userId: 'u1', expiresAt: new Date(0), user: active }),
      'u1',
      's1'
    ),
    false
  );
  assert.equal(
    await isLiveLoginSession(
      prismaWith({ userId: 'u2', expiresAt: future, user: active }),
      'u1',
      's1'
    ),
    false
  );
  assert.equal(
    await isLiveLoginSession(
      prismaWith({
        userId: 'u1',
        expiresAt: future,
        user: { isActive: false, status: AccountStatus.DISABLED },
      }),
      'u1',
      's1'
    ),
    false
  );
});
