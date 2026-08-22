import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY, RolesGuard } from './roles.guard';

const contextFor = (role: Role) => {
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, [Role.DEAN], handler);
  return {
    getHandler: () => handler,
    getClass: () => class ProtectedController {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as any;
};

test('role guard rejects a Teacher JWT from a Dean-only handler', () => {
  const guard = new RolesGuard(new Reflector());
  assert.equal(guard.canActivate(contextFor(Role.TEACHER)), false);
  assert.equal(guard.canActivate(contextFor(Role.DEAN)), true);
});
