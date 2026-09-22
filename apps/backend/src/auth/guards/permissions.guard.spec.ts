import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PermissionsGuard, REQUIRE_PERMISSION_KEY } from './permissions.guard';

const contextFor = (permission: string, role: Role = Role.DEAN) => {
  const handler = () => undefined;
  Reflect.defineMetadata(REQUIRE_PERMISSION_KEY, permission, handler);
  return {
    getHandler: () => handler,
    getClass: () => class ProtectedController {},
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'user-1', role } }),
    }),
  } as any;
};

test('uses named dean defaults when no override exists', async () => {
  const prisma = {
    userPermission: { findFirst: async () => null },
  } as any;
  const guard = new PermissionsGuard(new Reflector(), prisma);

  assert.equal(
    await guard.canActivate(contextFor('VIEW_DEAN_ANALYTICS')),
    true
  );
  assert.equal(
    await guard.canActivate(contextFor('UNKNOWN_PERMISSION')),
    false
  );
});

test('a user-specific denial overrides a role default', async () => {
  const prisma = {
    userPermission: { findFirst: async () => ({ granted: false }) },
  } as any;
  const guard = new PermissionsGuard(new Reflector(), prisma);

  assert.equal(await guard.canActivate(contextFor('MANAGE_FACULTY')), false);
});
