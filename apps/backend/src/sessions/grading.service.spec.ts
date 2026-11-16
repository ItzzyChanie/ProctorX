import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { QuestionType, SessionStatus, SubmissionMode } from '@prisma/client';
import { GradingService } from './grading.service';

type Draft = {
  questionId: string;
  responseText: string | null;
  selectedOptionIds: string[];
};

function harness(
  overrides: {
    startedAt?: Date;
    isLocked?: boolean;
    status?: SessionStatus;
    draft?: Draft[];
  } = {}
) {
  const session = {
    id: 'session-1',
    studentId: 'student-1',
    examId: 'exam-1',
    startedAt: overrides.startedAt ?? new Date(),
    timerStartedAt: null,
    extraTimeSeconds: 0,
    isLocked: overrides.isLocked ?? false,
    status: overrides.status ?? SessionStatus.IN_PROGRESS,
    exam: {
      durationMinutes: 30,
      endsAt: null,
      totalPoints: 2,
      questions: [
        {
          id: 'q1',
          type: QuestionType.MULTIPLE_CHOICE,
          points: 1,
          correctAnswer: null,
          options: [
            { id: 'a', isCorrect: true },
            { id: 'b', isCorrect: false },
          ],
        },
        {
          id: 'q2',
          type: QuestionType.IDENTIFICATION,
          points: 1,
          correctAnswer: 'Paris',
          options: [],
        },
      ],
    },
  };
  let submission: any = overrides.draft
    ? { sessionId: session.id, answers: overrides.draft }
    : null;
  const calls = { upserts: 0 };
  const prisma: any = {
    examSession: {
      findFirst: async () => session,
      findUnique: async () => ({ ...session, submission }),
      findMany: async () => [{ id: session.id }],
      updateMany: async ({ where }: any) => {
        if (where.status?.not && session.status === where.status.not)
          return { count: 0 };
        session.status = SessionStatus.COMPLETED;
        return { count: 1 };
      },
    },
    submission: {
      findUnique: async () => submission,
      upsert: async ({ create }: any) => {
        calls.upserts += 1;
        submission = {
          ...create,
          answers: create.answers.create,
        };
        return submission;
      },
    },
    recording: { updateMany: async () => ({ count: 0 }) },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
  };
  return { service: new GradingService(prisma, {} as never), session, calls };
}

test('finalizing an unsubmitted attempt grades the last saved draft', async () => {
  const { service, session } = harness({
    draft: [
      { questionId: 'q1', responseText: null, selectedOptionIds: ['a'] },
      { questionId: 'q2', responseText: 'paris', selectedOptionIds: [] },
    ],
  });
  const result: any = await service.finalizeSession(session.id);
  assert.equal(session.status, SessionStatus.COMPLETED);
  assert.equal(result.totalScore, 2);
  assert.equal(result.mode, SubmissionMode.AUTO_TIMEOUT);
  assert.ok(result.submittedAt instanceof Date);
});

test('finalizeExam closes every open attempt with a score', async () => {
  const { service, session } = harness({ draft: [] });
  await service.finalizeExam('exam-1');
  assert.equal(session.status, SessionStatus.COMPLETED);
});

test('a locked attempt cannot be submitted manually', async () => {
  const { service } = harness({ isLocked: true });
  await assert.rejects(
    service.submit('session-1', 'student-1', []),
    ForbiddenException
  );
});

test('a locked attempt cannot save drafts', async () => {
  const { service } = harness({ isLocked: true });
  await assert.rejects(
    service.saveDraft('session-1', 'student-1', []),
    ForbiddenException
  );
});

test('a manual submission after the grace window grades the draft instead', async () => {
  const { service, session, calls } = harness({
    startedAt: new Date(Date.now() - 31 * 60_000),
    draft: [{ questionId: 'q1', responseText: null, selectedOptionIds: ['b'] }],
  });
  await assert.rejects(
    service.submit('session-1', 'student-1', [
      { questionId: 'q1', selectedOptionIds: ['a'] },
    ]),
    ConflictException
  );
  assert.equal(session.status, SessionStatus.COMPLETED);
  assert.equal(calls.upserts, 1);
});

test('only one finalize path can complete an attempt', async () => {
  const { service, calls } = harness({ draft: [] });
  await Promise.all([
    service.finalizeSession('session-1'),
    service.finalizeSession('session-1'),
  ]);
  assert.equal(calls.upserts, 1);
});
