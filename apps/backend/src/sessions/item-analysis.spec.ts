import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeItems, difficultyFromP, discriminationLabel, type AnalysisQuestion } from './item-analysis';

const questions: AnalysisQuestion[] = [
  { id: 'easy', order: 1, type: 'MULTIPLE_CHOICE', prompt: 'Q1', points: 1, difficulty: 'EASY' },
  { id: 'hard', order: 2, type: 'IDENTIFICATION', prompt: 'Q2', points: 2, difficulty: 'EASY' },
];

// 10 students: everyone gets Q1; only the top 2 get Q2.
const submissions = Array.from({ length: 10 }, (_, index) => {
  const strong = index < 2;
  return {
    totalScore: 1 + (strong ? 2 : 0),
    answers: [
      { questionId: 'easy', awardedPoints: 1 },
      { questionId: 'hard', awardedPoints: strong ? 2 : 0 },
    ],
  };
});

test('difficulty index and level come from actual student scores', () => {
  const report = analyzeItems(questions, submissions);
  const [easy, hard] = report.items;
  assert.equal(easy!.difficultyIndex, 1);
  assert.equal(easy!.actualDifficulty, 'EASY');
  assert.equal(hard!.difficultyIndex, 0.2);
  assert.equal(hard!.actualDifficulty, 'HARD');
  assert.equal(report.teacherAgreementPercent, 50, 'teacher said Q2 was easy');
});

test('discrimination separates strong from weak students', () => {
  const report = analyzeItems(questions, submissions);
  assert.equal(report.items[0]!.discrimination, 0, 'everyone got it: no discrimination');
  assert.equal(report.items[1]!.discrimination, 0.67);
  assert.equal(report.items[1]!.discriminationLabel, 'VERY_GOOD');
  assert.equal(discriminationLabel(-0.1), 'NEGATIVE');
  assert.equal(discriminationLabel(0.25), 'FAIR');
});

test('AI predictions are scored against the actual difficulty', () => {
  const report = analyzeItems(questions, submissions, [
    { questionId: 'easy', estimatedDifficulty: 'EASY' },
    { questionId: 'hard', estimatedDifficulty: 'HARD' },
  ]);
  assert.equal(report.aiAgreementPercent, 100);
  assert.equal(report.aiPredictionsAvailable, true);
  const none = analyzeItems(questions, submissions);
  assert.equal(none.aiAgreementPercent, null);
});

test('ungraded essays are left out and small classes are flagged', () => {
  const small = analyzeItems(
    [{ id: 'essay', order: 1, type: 'ESSAY', prompt: 'E', points: 5, difficulty: 'MEDIUM' }],
    [
      { totalScore: 5, answers: [{ questionId: 'essay', awardedPoints: 5 }] },
      { totalScore: 0, answers: [{ questionId: 'essay', awardedPoints: null }] },
    ]
  );
  assert.equal(small.items[0]!.responses, 1);
  assert.equal(small.enoughStudents, false);
  assert.equal(difficultyFromP(0.7), 'MEDIUM');
  assert.equal(difficultyFromP(0.71), 'EASY');
  assert.equal(difficultyFromP(0.29), 'HARD');
});
