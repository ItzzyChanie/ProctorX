import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

test('does not transfer a student to a section outside the institution', async () => {
  let transactionCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({ institutionId: 'institution-1' }),
      findFirst: async () => ({ id: 'student-1' }),
    },
    studentSection: {
      findFirst: async () => null,
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as any;
  const service = new UsersService(prisma, {} as never, {} as never);

  await assert.rejects(
    service.transferStudent(
      'student-1',
      { program: 'CS', yearLevel: '2', sectionId: 'outside-section' },
      'dean-1'
    ),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message ===
        'Target section does not match the selected program and year level'
  );
  assert.equal(transactionCalled, false);
});
