import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PortalService } from './portal.service';

// Avatar storage is not under test: behave like "no picture supplied".
const avatarStub = {
  resolve: async (input?: string | null) => (input ? input : undefined),
  discard: async () => undefined,
};

const inviteInput = {
  email: 'existing@example.edu',
  employeeId: 'FAC-001',
  firstName: 'Existing',
  middleName: 'Middle',
  lastName: 'Faculty',
  title: 'Computer Science',
};

test('rejects an existing faculty email as a conflict before creation', async () => {
  let createCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
      findFirst: async () => ({ email: 'existing@example.edu' }),
      create: async () => {
        createCalled = true;
        return {};
      },
    },
  } as any;
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, avatarStub as any);

  await assert.rejects(
    service.invite('dean-1', inviteInput),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Email address is already assigned to an account'
  );
  assert.equal(createCalled, false);
});

test('rejects an existing employee ID as a conflict before creation', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
      findFirst: async () => ({ email: 'another@example.edu' }),
      create: async () => {
        throw new Error('create should not be called');
      },
    },
  } as any;
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, avatarStub as any);

  await assert.rejects(
    service.invite('dean-1', inviteInput),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Employee ID is already assigned to an account'
  );
});

test('uses initials plus @123 for a new faculty account', async () => {
  let passwordHash = '';
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
      findFirst: async () => null,
      create: async ({ data }: any) => {
        passwordHash = data.passwordHash;
        return {
          id: 'faculty-1',
          email: data.email,
          status: data.status,
        };
      },
    },
    auditLog: { create: async () => ({}) },
  } as any;
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, avatarStub as any);

  const result = await service.invite('dean-1', inviteInput);
  assert.equal(result.initialPassword, 'Emf@123');
  assert.equal(await bcrypt.compare('Emf@123', passwordHash), true);
});

test('creates a normalized department inside the dean institution', async () => {
  let savedData: any;
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
    },
    department: {
      create: async ({ data }: any) => {
        savedData = data;
        return { id: 'department-1', ...data };
      },
    },
    auditLog: { create: async () => ({}) },
  } as any;
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, avatarStub as any);

  const result = await service.createDepartment('dean-1', {
    code: ' ccs ',
    name: ' Computer Studies ',
    description: ' Technology programs ',
  });

  assert.deepEqual(savedData, {
    institutionId: 'institution-1',
    code: 'CCS',
    name: 'Computer Studies',
    description: 'Technology programs',
  });
  assert.equal(result.id, 'department-1');
});

test('does not allow permission overrides outside the dean institution', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
      findFirst: async () => null,
    },
  } as any;
  const service = new PortalService(prisma, {} as any, {} as any, {} as any, avatarStub as any);

  await assert.rejects(
    service.setPermissionOverride('dean-1', 'outside-faculty', {
      permissionKey: 'VIEW_STUDENT_ROSTERS',
      granted: false,
    }),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message === 'Faculty member not found'
  );
});
