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
  responseText: z.string().max(20000).optional(),
  // Checkbox questions allow several choices.
  selectedOptionIds: z.array(z.string().min(1).max(128)).max(50).optional(),
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

/** Inputs for enumeration items, or one per blank for fill in the blank. */
export const enumerationEntries = (question: any, answer?: Answer) => {
  const length = Math.max(
    1,
    question.type === 'FILL_IN_THE_BLANK'
      ? (question.blankCount ?? 1)
      : (question.enumerationAnswerCount ?? 1)
  );
  const saved = answer?.enumerationAnswers ?? [];
  return Array.from({ length }, (_, index) => saved[index] ?? '');
};

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
  question.type === 'MULTIPLE_CHOICE' || question.type === 'MULTIPLE_RESPONSE'
    ? Boolean(answer?.selectedOptionIds?.length)
    : question.type === 'ENUMERATION'
      ? Boolean(answer?.enumerationAnswers?.some((value) => value.trim()))
      : question.type === 'FILL_IN_THE_BLANK'
        ? enumerationEntries(question, answer).every((value) => value.trim())
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
      : question.type === 'FILL_IN_THE_BLANK'
        ? // Positions matter: blank 2's answer must stay in slot 2.
          JSON.stringify(enumerationEntries(question, answer).map((value) => value.trim()))
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
