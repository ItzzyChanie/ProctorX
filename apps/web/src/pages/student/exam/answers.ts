/**
 * Answer handling for the exam room: local answer shape, conversion to the
 * submission payload, validation, and display helpers.
 */
import axios from 'axios';
import { z } from 'zod';

export type Answer = {
  responseText?: string;
  selectedOptionIds?: string[];
  enumerationAnswers?: string[];
};

export type StudentSubject = {
  id: string;
  code: string;
  subjectCode?: string;
  schedule?: string;
  name: string;
  teacher: { fullName: string };
  exams: {
    assessmentType: 'EXAM' | 'QUIZ';
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    endsAt: string | null;
    sessions: { endedAt: string }[];
  }[];
};

export const roomCodeSchema = z.string().trim().min(1).max(32);
export const QUESTIONS_PER_PAGE = 10;

export const answerSchema = z.object({
  questionId: z.string().min(1).max(128),
  responseText: z.string().max(5000).optional(),
  selectedOptionIds: z.array(z.string().min(1).max(128)).max(1).optional(),
});

/** Server explanation for expected refusals (time is up, attempt locked). */
export function conflictMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const status = error.response?.status;
  const message = error.response?.data?.message;
  return (status === 409 || status === 403) && typeof message === 'string'
    ? message
    : undefined;
}

export const enumerationEntries = (question: any, answer?: Answer) =>
  answer?.enumerationAnswers ??
  Array.from(
    { length: Math.max(1, question.enumerationAnswerCount ?? 1) },
    () => ''
  );

export const parseEnumerationResponse = (responseText?: string) => {
  if (!responseText) return undefined;
  try {
    const parsed: unknown = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return responseText.split(/\r?\n/u);
  }
};

export const hasAnswer = (question: any, answer?: Answer) =>
  question.type === 'MULTIPLE_CHOICE'
    ? Boolean(answer?.selectedOptionIds?.length)
    : question.type === 'ENUMERATION'
      ? Boolean(answer?.enumerationAnswers?.some((value) => value.trim()))
      : Boolean(answer?.responseText?.trim());

export const submissionAnswer = (question: any, answer?: Answer) => ({
  questionId: question.id,
  responseText:
    question.type === 'ENUMERATION'
      ? JSON.stringify(
          (answer?.enumerationAnswers ?? [])
            .map((value) => value.trim())
            .filter(Boolean)
        )
      : answer?.responseText,
  selectedOptionIds: answer?.selectedOptionIds,
});

export const formatCountdown = (total: number) => {
  const safe = Math.max(0, total);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};
