/**
 * Single source of truth for an exam attempt's deadline.
 *
 * The countdown is wall-clock based: it starts when the attempt is created and
 * keeps running while the student is offline. Teachers compensate genuine
 * outages by granting extra time, which extends the deadline.
 */

/** Late manual submissions are accepted within this window (network slack). */
export const SUBMISSION_GRACE_SECONDS = 15;

export type TimedSession = {
  startedAt: Date;
  timerStartedAt?: Date | null;
  extraTimeSeconds: number;
};

export type TimedExam = {
  durationMinutes: number;
  endsAt?: Date | null;
};

export function sessionDeadline(session: TimedSession, exam: TimedExam): Date {
  const start = session.timerStartedAt ?? session.startedAt;
  const durationEnd =
    +start + (exam.durationMinutes * 60 + session.extraTimeSeconds) * 1000;
  const windowEnd = exam.endsAt
    ? +exam.endsAt + session.extraTimeSeconds * 1000
    : Number.POSITIVE_INFINITY;
  return new Date(Math.min(durationEnd, windowEnd));
}

export function sessionRemainingSeconds(
  session: TimedSession,
  exam: TimedExam,
  now: Date = new Date()
): number {
  return Math.max(
    0,
    Math.floor((+sessionDeadline(session, exam) - +now) / 1000)
  );
}

/** True once the deadline plus the grace window has passed. */
export function isPastGrace(
  session: TimedSession,
  exam: TimedExam,
  now: Date = new Date()
): boolean {
  return (
    +now >
    +sessionDeadline(session, exam) + SUBMISSION_GRACE_SECONDS * 1000
  );
}
