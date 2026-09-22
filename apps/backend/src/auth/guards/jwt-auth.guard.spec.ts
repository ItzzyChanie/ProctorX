import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const context = {
  getHandler: () => () => undefined,
  getClass: () => class ProtectedController {},
} as any;

test('blocks authenticated users who still must change their password', () => {
  const reflector = { getAllAndOverride: () => false } as any;
  const guard = new JwtAuthGuard(reflector);
  assert.throws(
    () =>
      guard.handleRequest(
        null,
        { id: 'user-1', mustChangePassword: true },
        null,
        context
      ),
    ForbiddenException
  );
});

test('allows password-change-required users on explicitly allowed routes', () => {
  const reflector = { getAllAndOverride: () => true } as any;
  const guard = new JwtAuthGuard(reflector);
  const user = { id: 'user-1', mustChangePassword: true };
  assert.equal(guard.handleRequest(null, user, null, context), user);
});
