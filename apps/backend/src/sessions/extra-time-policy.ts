export type ExtraTimeWindow = {
  status: string;
  scheduledAt: Date | null;
  endsAt: Date | null;
};

export function extraTimeWindowError(
  exam: ExtraTimeWindow,
  now = new Date()
): string | null {
  if (exam.status !== 'PUBLISHED') return 'This assessment is not live';
  if (!exam.scheduledAt || !exam.endsAt)
    return 'This assessment does not have an active schedule';
  if (now < exam.scheduledAt) return 'This assessment has not started yet';
  if (now >= exam.endsAt) return 'This assessment has already ended';
  return null;
}
