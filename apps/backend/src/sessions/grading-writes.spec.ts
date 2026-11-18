import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestionType, SessionStatus } from '@prisma/client';
import { GradingService } from './grading.service';

function harness(lastHeartbeatAt: Date | null, savedAnswers?: unknown[]) {
  const writes: string[] = [];
  const session = {
    id: 's1',
    studentId: 'u1',
    startedAt: new Date(),
    timerStartedAt: null,
    extraTimeSeconds: 0,
    isLocked: false,
    status: SessionStatus.IN_PROGRESS,
    lastHeartbeatAt,
    exam: {
      durationMinutes: 60,
      endsAt: null,
      totalPoints: 2,
      questions: [
        { id: 'q1', type: QuestionType.MULTIPLE_CHOICE, options: [] },
        { id: 'q2', type: QuestionType.IDENTIFICATION, options: [] },
      ],
    },
    submission: savedAnswers ? { id: 'sub1', answers: savedAnswers } : null,
  };
  const prisma: any = {
    examSession: {
      findFirst: async () => session,
      update: async () => writes.push('session.update'),
    },
    submission: { create: async () => writes.push('submission.create') },
    answer: {
      upsert: (args: any) => {
        writes.push(`answer.upsert:${args.where.submissionId_questionId.questionId}`);
        return Promise.resolve();
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  return { service: new GradingService(prisma, {} as never), writes };
}

test('heartbeats only write "last seen" once a minute', async () => {
  const recent = harness(new Date(Date.now() - 5_000));
  await recent.service.heartbeat('s1', 'u1');
  assert.deepEqual(recent.writes, []);

  const stale = harness(new Date(Date.now() - 61_000));
  const result = await stale.service.heartbeat('s1', 'u1');
  assert.deepEqual(stale.writes, ['session.update']);
  assert.equal(result.expired, false);
  assert.ok(result.remainingSeconds > 59 * 60);
});

test('autosave writes only the answers that changed', async () => {
  const saved = [
    { questionId: 'q1', responseText: null, selectedOptionIds: ['a'] },
    { questionId: 'q2', responseText: 'paris', selectedOptionIds: [] },
  ];
  const { service, writes } = harness(new Date(), saved);
  await service.saveDraft('s1', 'u1', [
    { questionId: 'q1', selectedOptionIds: ['a'] },
    { questionId: 'q2', responseText: 'london' },
  ]);
  assert.deepEqual(writes, ['answer.upsert:q2']);
});

test('an unchanged autosave writes nothing', async () => {
  const saved = [
    { questionId: 'q1', responseText: null, selectedOptionIds: ['a'] },
    { questionId: 'q2', responseText: 'paris', selectedOptionIds: [] },
  ];
  const { service, writes } = harness(new Date(), saved);
  await service.saveDraft('s1', 'u1', [
    { questionId: 'q1', selectedOptionIds: ['a'] },
    { questionId: 'q2', responseText: ' paris ' },
  ]);
  assert.deepEqual(writes, []);
});

test('the first autosave creates the draft', async () => {
  const { service, writes } = harness(new Date());
  await service.saveDraft('s1', 'u1', [{ questionId: 'q1', selectedOptionIds: ['a'] }]);
  assert.deepEqual(writes, ['submission.create']);
});
