import { EventType, Prisma } from '@prisma/client';

/**
 * Proctoring events that count as possible violations. Notes such as a
 * student opening the exam's own Google Form in a new tab, or taking the exam
 * on a device without a working camera/microphone, are kept for the teacher's
 * timeline but never counted as incidents or scored.
 */
export const DEVICE_NOTE_TYPES: EventType[] = [
  EventType.CAMERA_UNAVAILABLE,
  EventType.MICROPHONE_UNAVAILABLE,
];
export const NOTE_EVENT_TYPES: EventType[] = [
  EventType.EXTERNAL_FORM_OPENED,
  ...DEVICE_NOTE_TYPES,
];

export const VIOLATION_EVENTS = {
  type: { notIn: NOTE_EVENT_TYPES },
} satisfies Prisma.ProctoringEventWhereInput;

/** Attempts the teacher should review: violations or a missing device. */
export const REVIEW_EVENTS = {
  type: { not: EventType.EXTERNAL_FORM_OPENED },
} satisfies Prisma.ProctoringEventWhereInput;

export const isViolationEvent = (event: { type: EventType | string }) =>
  !NOTE_EVENT_TYPES.includes(event.type as EventType);
