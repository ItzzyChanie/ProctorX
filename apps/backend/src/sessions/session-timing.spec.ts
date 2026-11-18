import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPastGrace,
  sessionDeadline,
  sessionRemainingSeconds,
  SUBMISSION_GRACE_SECONDS,
} from './session-timing';

const start = new Date('2026-11-15T08:00:00Z');
const at = (minutes: number, seconds = 0) =>
  new Date(+start + minutes * 60_000 + seconds * 1000);

test('the countdown keeps running while the student is offline', () => {
  const session = { startedAt: start, extraTimeSeconds: 0 };
  const exam = { durationMinutes: 60 };
  // Student disconnected at minute 10 and returned at minute 40.
  assert.equal(sessionRemainingSeconds(session, exam, at(40)), 20 * 60);
  assert.equal(sessionRemainingSeconds(session, exam, at(61)), 0);
});

test('the exam window closes the attempt even if duration remains', () => {
  const session = { startedAt: at(30), extraTimeSeconds: 0 };
  const exam = { durationMinutes: 60, endsAt: at(60) };
  assert.equal(+sessionDeadline(session, exam), +at(60));
  assert.equal(sessionRemainingSeconds(session, exam, at(50)), 10 * 60);
});

test('extra time extends both the duration and the window', () => {
  const exam = { durationMinutes: 60, endsAt: at(60) };
  const session = { startedAt: start, extraTimeSeconds: 10 * 60 };
  assert.equal(+sessionDeadline(session, exam), +at(70));
});

test('timerStartedAt takes precedence over startedAt', () => {
  const session = {
    startedAt: start,
    timerStartedAt: at(5),
    extraTimeSeconds: 0,
  };
  assert.equal(+sessionDeadline(session, { durationMinutes: 30 }), +at(35));
});

test('late submissions are accepted only inside the grace window', () => {
  const session = { startedAt: start, extraTimeSeconds: 0 };
  const exam = { durationMinutes: 30 };
  assert.equal(isPastGrace(session, exam, at(30, SUBMISSION_GRACE_SECONDS)), false);
  assert.equal(
    isPastGrace(session, exam, at(30, SUBMISSION_GRACE_SECONDS + 1)),
    true
  );
});
