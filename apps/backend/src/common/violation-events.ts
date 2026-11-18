import { EventType, Prisma } from '@prisma/client';

/**
 * Proctoring events that count as possible violations. Notes such as a
 * student opening the exam's own Google Form in a new tab are kept for the
 * teacher's timeline but never counted as incidents.
 */
export const NOTE_EVENT_TYPES: EventType[] = [EventType.EXTERNAL_FORM_OPENED];

export const VIOLATION_EVENTS = {
  type: { notIn: NOTE_EVENT_TYPES },
} satisfies Prisma.ProctoringEventWhereInput;

export const isViolationEvent = (event: { type: EventType | string }) =>
  !NOTE_EVENT_TYPES.includes(event.type as EventType);
