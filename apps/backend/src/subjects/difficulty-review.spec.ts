import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReviewReport,
  reviewPayload,
  type AiQuestionReview,
  type ReviewedQuestion,
} from './difficulty-review';

const question = (order: number, difficulty: 'EASY' | 'MEDIUM' | 'HARD', extra: Partial<ReviewedQuestion> = {}): ReviewedQuestion => ({
  id: `q${order}`,
  order,
  type: 'IDENTIFICATION',
  prompt: `Question ${order}`,
  points: 1,
  difficulty,
  correctAnswer: ['answer'],
  rubric: null,
  options: [],
  ...extra,
});

const review = (index: number, estimatedDifficulty: 'EASY' | 'MEDIUM' | 'HARD', seconds = 60): AiQuestionReview => ({
  index,
  estimatedDifficulty,
  confidence: 0.9,
  bloomLevel: 'REMEMBER',
  estimatedSeconds: seconds,
  reasons: ['reason'],
  issues: index === 1 ? [{ code: 'AMBIGUOUS_WORDING', message: 'unclear' }] : [],
  suggestion: '',
});

test('the report compares teacher and AI difficulty and computes the totals itself', () => {
  const questions = [question(1, 'HARD'), question(2, 'MEDIUM'), question(3, 'EASY')];
  const report = buildReviewReport(
    questions,
    { questions: [review(0, 'EASY'), review(1, 'MEDIUM'), review(2, 'EASY')], overall: 'ok', coverage: 'ok' },
    5
  );
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.mismatches, 1);
  assert.equal(report.summary.agreementPercent, 67);
  assert.deepEqual(report.summary.teacherMix, { EASY: 1, MEDIUM: 1, HARD: 1 });
  assert.deepEqual(report.summary.aiMix, { EASY: 2, MEDIUM: 1, HARD: 0 });
  assert.equal(report.summary.issues, 1);
  assert.equal(report.summary.estimatedMinutes, 3);
  assert.equal(report.summary.timeFits, true);
  assert.equal(report.questions[0]!.matches, false);
  assert.equal(report.questions[0]!.questionId, 'q1');
});

test('a test that needs more time than the duration is flagged', () => {
  const report = buildReviewReport(
    [question(1, 'HARD')],
    { questions: [review(0, 'HARD', 900)], overall: '', coverage: '' },
    10
  );
  assert.equal(report.summary.estimatedMinutes, 15);
  assert.equal(report.summary.timeFits, false);
});

test('an incomplete AI answer is rejected', () => {
  assert.throws(() =>
    buildReviewReport([question(1, 'EASY'), question(2, 'EASY')], { questions: [review(0, 'EASY')], overall: '', coverage: '' }, 10)
  );
});

test('fill-in-the-blank keys are sent to the reviewer per blank', () => {
  const payload = reviewPayload(
    { title: 'Quiz', assessmentType: 'QUIZ', durationMinutes: 10, sourceText: null },
    [question(1, 'EASY', { type: 'FILL_IN_THE_BLANK', prompt: 'The ___ runs ___.', correctAnswer: [['CPU', 'processor'], ['code']] })]
  );
  assert.deepEqual(payload.questions[0]!.answers, ['Blank 1: CPU | processor', 'Blank 2: code']);
  assert.equal(payload.source_text, '');
});
