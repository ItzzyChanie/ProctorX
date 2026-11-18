import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesAccepted, scoreAnswer, withinOneEdit, type ScorableQuestion } from './scoring';

const options = (correct: string[], all = ['a', 'b', 'c', 'd']) =>
  all.map((id) => ({ id, isCorrect: correct.includes(id) }));
const q = (extra: Partial<ScorableQuestion>): ScorableQuestion => ({
  type: 'IDENTIFICATION',
  points: 3,
  correctAnswer: null,
  options: [],
  ...extra,
});
const answer = (extra: { responseText?: string; selectedOptionIds?: string[] }) => ({ questionId: 'q', ...extra });

test('multiple choice: only the one correct choice scores', () => {
  const question = q({ type: 'MULTIPLE_CHOICE', options: options(['b']) });
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['b'] })), 3);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a'] })), 0);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b'] })), 0);
});

test('checkboxes: wrong ticks cancel right ticks, never below zero', () => {
  const question = q({ type: 'MULTIPLE_RESPONSE', options: options(['a', 'b', 'c']), partialCredit: true });
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b', 'c'] })), 3);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b'] })), 2);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b', 'd'] })), 1);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b', 'c', 'd'] })), 2);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['d'] })), 0);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['zzz', 'a'] })), 1, 'unknown ids are ignored');
});

test('checkboxes without partial credit are all-or-nothing', () => {
  const question = q({ type: 'MULTIPLE_RESPONSE', options: options(['a', 'b']), partialCredit: false });
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a', 'b'] })), 3);
  assert.equal(scoreAnswer(question, answer({ selectedOptionIds: ['a'] })), 0);
});

test('identification accepts any listed answer, ignoring case, spaces and hyphens', () => {
  const question = q({ correctAnswer: ['CPU', 'Central Processing Unit'] });
  assert.equal(scoreAnswer(question, answer({ responseText: 'cpu' })), 3);
  assert.equal(scoreAnswer(question, answer({ responseText: 'central processing-unit' })), 3);
  assert.equal(scoreAnswer(question, answer({ responseText: 'GPU' })), 0);
  assert.equal(scoreAnswer(q({ correctAnswer: 'Primary key' }), answer({ responseText: 'PRIMARY KEY' })), 3, 'legacy string keys still work');
});

test('one small typo is forgiven only when the teacher allows it', () => {
  const strict = q({ correctAnswer: ['Recursion'] });
  const lenient = q({ correctAnswer: ['Recursion'], allowTypos: true });
  assert.equal(scoreAnswer(strict, answer({ responseText: 'Recurssion' })), 0);
  assert.equal(scoreAnswer(lenient, answer({ responseText: 'Recurssion' })), 3);
  assert.equal(scoreAnswer(lenient, answer({ responseText: 'Recrusion' })), 3, 'swapped letters');
  assert.equal(scoreAnswer(lenient, answer({ responseText: 'Reduction' })), 0, 'two or more edits');
  assert.equal(matchesAccepted('RAN', ['RAM'], true), false, 'short answers must be exact');
  assert.equal(withinOneEdit('abc', 'abd'), true);
  assert.equal(withinOneEdit('abc', 'xyz'), false);
});

test('enumeration gives credit per correct item by default', () => {
  const question = q({ type: 'ENUMERATION', points: 4, correctAnswer: ['TCP', 'UDP', 'IP', 'HTTP'], partialCredit: true });
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['udp', 'tcp', 'http', 'ip']) })), 4);
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['tcp', 'udp', 'ftp', '']) })), 2);
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['tcp', 'tcp', 'tcp', 'tcp']) })), 1, 'duplicates count once');
  assert.equal(
    scoreAnswer(question, answer({ responseText: JSON.stringify(['x', 'y', 'z', 'w', 'tcp', 'udp']) })),
    0,
    'only as many entries as expected items are considered'
  );
});

test('enumeration without partial credit is all-or-nothing (legacy behaviour)', () => {
  const question = q({ type: 'ENUMERATION', correctAnswer: ['TCP', 'UDP'], partialCredit: false });
  assert.equal(scoreAnswer(question, answer({ responseText: 'TCP\nUDP' })), 3);
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['TCP']) })), 0);
});

test('fill in the blank scores each blank against its own accepted answers', () => {
  const question = q({
    type: 'FILL_IN_THE_BLANK',
    points: 2,
    correctAnswer: [['CPU', 'processor'], ['RAM', 'memory'], ['disk']],
    partialCredit: true,
  });
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['processor', 'memory', 'disk']) })), 2);
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['CPU', '', 'disk']) })), 1.33);
  assert.equal(scoreAnswer(question, answer({ responseText: JSON.stringify(['RAM', 'CPU', 'disk']) })), 0.67, 'answers must be in the right blank');
});

test('essays are left for the teacher', () => {
  assert.equal(scoreAnswer(q({ type: 'ESSAY' }), answer({ responseText: 'anything' })), null);
});
