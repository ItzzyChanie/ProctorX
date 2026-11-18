import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { countBlanks, normalizeQuestion } from './question-rules';

const base = { prompt: 'Q', points: 2, isRequired: true } as const;
const option = (label: string, isCorrect = false) => ({ label, isCorrect });

test('multiple choice needs exactly one correct answer', () => {
  assert.throws(
    () =>
      normalizeQuestion(
        { ...base, type: 'MULTIPLE_CHOICE', options: [option('A', true), option('B', true)] },
        0
      ),
    BadRequestException
  );
  const ok = normalizeQuestion(
    { ...base, type: 'MULTIPLE_CHOICE', options: [option('A', true), option('B')] },
    0
  );
  assert.equal(ok.type, 'MULTIPLE_CHOICE');
});

test('checkboxes (multiple response) allow several correct answers', () => {
  const ok = normalizeQuestion(
    {
      ...base,
      type: 'MULTIPLE_RESPONSE',
      options: [option('A', true), option('B', true), option('C')],
    },
    0
  );
  assert.equal(ok.type, 'MULTIPLE_RESPONSE');
  assert.throws(
    () => normalizeQuestion({ ...base, type: 'MULTIPLE_RESPONSE', options: [option('A'), option('B')] }, 0),
    BadRequestException
  );
});

test('duplicate or empty choices are rejected', () => {
  assert.throws(
    () => normalizeQuestion({ ...base, type: 'MULTIPLE_CHOICE', options: [option('A', true), option('a')] }, 0),
    BadRequestException
  );
});

test('identification stores a list of accepted answers', () => {
  const single = normalizeQuestion({ ...base, type: 'IDENTIFICATION', correctAnswer: 'CPU' }, 0);
  assert.deepEqual(single.correctAnswer, ['CPU']);
  const several = normalizeQuestion(
    { ...base, type: 'IDENTIFICATION', correctAnswer: JSON.stringify(['CPU', 'Central Processing Unit']) },
    0
  );
  assert.deepEqual(several.correctAnswer, ['CPU', 'Central Processing Unit']);
});

test('malformed enumeration keys are a clear validation error, not a crash', () => {
  assert.throws(
    () => normalizeQuestion({ ...base, type: 'ENUMERATION', correctAnswer: '[broken' }, 0),
    BadRequestException
  );
});

test('fill in the blank needs one answer list per blank', () => {
  const prompt = 'The ___ executes instructions and ___ stores data.';
  assert.equal(countBlanks(prompt), 2);
  const ok = normalizeQuestion(
    { ...base, prompt, type: 'FILL_IN_THE_BLANK', correctAnswer: JSON.stringify([['CPU'], ['RAM', 'memory']]) },
    0
  );
  assert.deepEqual(ok.correctAnswer, [['CPU'], ['RAM', 'memory']]);
  assert.throws(
    () => normalizeQuestion({ ...base, prompt, type: 'FILL_IN_THE_BLANK', correctAnswer: JSON.stringify([['CPU']]) }, 0),
    BadRequestException
  );
  assert.throws(
    () => normalizeQuestion({ ...base, prompt: 'No blanks here', type: 'FILL_IN_THE_BLANK', correctAnswer: '[]' }, 0),
    BadRequestException
  );
});

test('new questions default to Medium difficulty and partial credit', () => {
  const q = normalizeQuestion({ ...base, type: 'ESSAY' }, 0);
  assert.equal(q.difficulty, 'MEDIUM');
  assert.equal(q.partialCredit, true);
  assert.equal(q.allowTypos, false);
});
