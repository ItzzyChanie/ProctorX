import assert from 'node:assert/strict';
import test from 'node:test';
import { GradeStatus } from '@prisma/client';
import { GradingService } from '../sessions/grading.service';
import {
  PENDING_RELEASE,
  resultsReleased,
  studentGradeStatus,
} from './result-release';

test('graded results stay hidden while the exam is still open', () => {
  assert.equal(
    studentGradeStatus(GradeStatus.TEACHER_CONFIRMED, 'PUBLISHED'),
    PENDING_RELEASE
  );
  assert.equal(resultsReleased(GradeStatus.TEACHER_CONFIRMED, 'PUBLISHED'), false);
});

test('results are released once the exam has closed', () => {
  assert.equal(resultsReleased(GradeStatus.TEACHER_CONFIRMED, 'ARCHIVED'), true);
  assert.equal(
    studentGradeStatus(GradeStatus.TEACHER_CONFIRMED, 'ARCHIVED'),
    GradeStatus.TEACHER_CONFIRMED
  );
});

test('ungraded work is never shown as released', () => {
  assert.equal(resultsReleased(GradeStatus.UNGRADED, 'ARCHIVED'), false);
  assert.equal(studentGradeStatus(GradeStatus.UNGRADED, 'PUBLISHED'), GradeStatus.UNGRADED);
});

test('the submit receipt carries no score or per-question marks', () => {
  const service = new GradingService({} as never);
  const receipt = service.studentReceipt({
    id: 'sub1',
    submittedAt: new Date(),
    maxScore: 20,
    mode: 'MANUAL',
    totalScore: 18,
    answers: [{ awardedPoints: 1 }],
  } as never);
  assert.ok(receipt);
  assert.equal('totalScore' in receipt, false);
  assert.equal('answers' in receipt, false);
  assert.equal(receipt.resultsPending, true);
});
