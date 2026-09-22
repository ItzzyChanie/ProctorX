import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcrypt';
import { AccountStatus, Role } from '@prisma/client';
import { AuthService } from './auth.service';

test('activation code resend enforces the 30-second cooldown', async () => {
  const passwordHash = await bcrypt.hash('Jbp@123', 4);
  const user = {
    id: 'faculty-1',
    loginId: 'fac-1',
    email: 'faculty@example.edu',
    passwordHash,
    role: Role.TEACHER,
    status: AccountStatus.PENDING,
    isActive: true,
    mustChangePassword: true,
  };
  let activeCode: { id: string; createdAt: Date } | null = null;
  let createdCodes = 0;
  let sentEmails = 0;

  const prisma = {
    user: {
      findFirst: async () => user,
    },
    activationCode: {
      findFirst: async () => activeCode,
      updateMany: async () => {
        activeCode = null;
      },
      create: async () => {
        createdCodes += 1;
        activeCode = { id: `code-${createdCodes}`, createdAt: new Date() };
        return activeCode;
      },
      delete: async () => {
        activeCode = null;
      },
    },
    auditLog: { create: async () => ({}) },
  };
  const email = {
    sendActivationCode: async () => {
      sentEmails += 1;
    },
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    email as never,
    {} as never
  );

  const login = await service.login('FAC-1', 'Jbp@123');
  assert.equal('activationRequired' in login, true);
  assert.equal(createdCodes, 1);
  assert.equal(sentEmails, 1);

  const earlyResend = await service.resendActivation('FAC-1');
  assert.equal(earlyResend.resent, false);
  assert.equal(createdCodes, 1);
  assert.equal(sentEmails, 1);

  assert.ok(activeCode);
  (activeCode as { id: string; createdAt: Date }).createdAt = new Date(
    Date.now() - 31_000
  );
  const allowedResend = await service.resendActivation('faculty@example.edu');
  assert.equal(allowedResend.resent, true);
  assert.equal(createdCodes, 2);
  assert.equal(sentEmails, 2);
});
