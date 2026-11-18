import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AccountStatus, Role } from '@prisma/client';
import { AuthService } from './auth.service';

async function harness(role: Role) {
  const passwordHash = await bcrypt.hash('Secret@1', 4);
  const user = {
    id: `${role.toLowerCase()}-1`,
    loginId: 'user-1',
    email: 'user@example.edu',
    passwordHash,
    role,
    status: AccountStatus.ACTIVE,
    isActive: true,
    mustChangePassword: false,
    permissionOverrides: [],
  };
  const sessions: { id: string; userId: string; lastSeenAt: Date; expiresAt: Date }[] = [];
  const revoked: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    loginSession: {
      deleteMany: async () => ({ count: 0 }),
      count: async () => sessions.length,
      create: async ({ data }: any) => {
        sessions.push({ ...data, lastSeenAt: new Date() });
        return data;
      },
    },
  };
  const prisma: any = {
    user: { findFirst: async () => user },
    $transaction: async (callback: (t: unknown) => unknown) => callback(tx),
    notification: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  const jwt = { signAsync: async (payload: any) => JSON.stringify(payload) };
  const gateway = { notifyUser: () => undefined };
  const revocation = {
    revokeSession: async (id: string) => {
      revoked.push(id);
    },
  };
  const service = new AuthService(
    prisma,
    jwt as never,
    {} as never,
    gateway as never,
    revocation as never,
    {} as never
  );
  return { service, sessions, revoked };
}

test('every role receives a revocable session id (jti)', async () => {
  const { service, sessions } = await harness(Role.TEACHER);
  const result: any = await service.login('user-1', 'Secret@1');
  const payload = JSON.parse(result.accessToken);
  assert.equal(typeof payload.jti, 'string');
  assert.equal(sessions[0]!.id, payload.jti);
});

test('faculty may sign in on more than one device', async () => {
  const { service, sessions } = await harness(Role.DEAN);
  await service.login('user-1', 'Secret@1');
  await service.login('user-1', 'Secret@1');
  assert.equal(sessions.length, 2);
});

test('a student already signed in elsewhere is blocked', async () => {
  const { service } = await harness(Role.STUDENT);
  await service.login('user-1', 'Secret@1');
  await assert.rejects(service.login('user-1', 'Secret@1'), ConflictException);
});

test('logout revokes only the current session', async () => {
  const { service, revoked } = await harness(Role.TEACHER);
  await service.logout('teacher-1', 'session-a');
  assert.deepEqual(revoked, ['session-a']);
});
