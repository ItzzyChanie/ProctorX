import { GradeStatus } from '@prisma/client';

/**
 * Students see scores and answer keys only after the exam has closed
 * (window ended, or the teacher stopped it). Otherwise a student who finishes
 * early could tell classmates which answers were right while they are still
 * taking the exam.
 */
export const PENDING_RELEASE = 'PENDING_RELEASE' as const;

export function examClosed(examStatus: string) {
  return examStatus !== 'PUBLISHED';
}

/** The grade status a student is allowed to see. */
export function studentGradeStatus(
  gradeStatus: GradeStatus,
  examStatus: string
): GradeStatus | typeof PENDING_RELEASE {
  if (gradeStatus !== GradeStatus.TEACHER_CONFIRMED) return gradeStatus;
  return examClosed(examStatus) ? gradeStatus : PENDING_RELEASE;
}

export function resultsReleased(gradeStatus: GradeStatus, examStatus: string) {
  return studentGradeStatus(gradeStatus, examStatus) === GradeStatus.TEACHER_CONFIRMED;
}
