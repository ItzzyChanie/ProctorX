/**
 * Question model used by the exam builder, and conversions to/from the API
 * (stored exams, AI drafts, question bank items).
 */

export type QType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_RESPONSE'
  | 'IDENTIFICATION'
  | 'ENUMERATION'
  | 'FILL_IN_THE_BLANK'
  | 'ESSAY';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type Question = {
  type: QType;
  prompt: string;
  points: number;
  isRequired: boolean;
  difficulty: Difficulty;
  /** Identification: accepted answers. Enumeration: expected items. */
  answers: string[];
  /** Fill in the blank: accepted answers per blank, separated by "|". */
  blankAnswers: string[];
  rubric: string;
  options: { label: string; isCorrect: boolean }[];
  allowTypos: boolean;
  partialCredit: boolean;
  /** AI citation (file and page/slide), kept for traceability. */
  sourceReference?: string;
};

export const TYPE_LABELS: Record<QType, string> = {
  MULTIPLE_CHOICE: 'Multiple choice (one answer)',
  MULTIPLE_RESPONSE: 'Checkboxes (select all that apply)',
  IDENTIFICATION: 'Identification',
  ENUMERATION: 'Enumeration',
  FILL_IN_THE_BLANK: 'Fill in the blank',
  ESSAY: 'Essay',
};

/** Types offered in the builder. */
export const AVAILABLE_TYPES: QType[] = [
  'MULTIPLE_CHOICE',
  'MULTIPLE_RESPONSE',
  'IDENTIFICATION',
  'ENUMERATION',
  'FILL_IN_THE_BLANK',
  'ESSAY',
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

export const BLANK_PATTERN = /_{3,}/g;
export const countBlanks = (prompt: string) =>
  prompt.match(BLANK_PATTERN)?.length ?? 0;

export const blankQuestion = (type: QType = 'MULTIPLE_CHOICE'): Question => ({
  type,
  prompt: '',
  points: 1,
  isRequired: true,
  difficulty: 'MEDIUM',
  answers: [''],
  blankAnswers: [],
  rubric: '',
  options: [
    { label: '', isCorrect: true },
    { label: '', isCorrect: false },
  ],
  allowTypos: false,
  partialCredit: true,
});

const asStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item))
    : value === null || value === undefined || value === ''
      ? []
      : [String(value)];

const splitAlternatives = (value: string) =>
  value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

/** A question as stored by the API (exam copy / draft / bank item). */
export function fromStored(question: any): Question {
  const key = question.correctAnswer;
  const isBlanks = question.type === 'FILL_IN_THE_BLANK';
  const answers = isBlanks ? [] : asStringList(key);
  return {
    ...blankQuestion(question.type as QType),
    prompt: question.prompt ?? '',
    points: question.points ?? 1,
    isRequired: question.isRequired ?? true,
    difficulty: (question.difficulty as Difficulty) ?? 'MEDIUM',
    answers: answers.length ? answers : [''],
    blankAnswers: isBlanks && Array.isArray(key) ? key.map((list: unknown) => asStringList(list).join(' | ')) : [],
    rubric: question.rubric ?? '',
    options: (question.options ?? []).map((option: any) => ({
      label: option.label,
      isCorrect: Boolean(option.isCorrect),
    })),
    allowTypos: Boolean(question.allowTypos),
    partialCredit: question.partialCredit ?? true,
    sourceReference: question.sourceReference ?? undefined,
  };
}

/** A question from an AI-generated draft. */
export function fromGenerated(question: any): Question {
  return {
    ...blankQuestion(question.type as QType),
    prompt: question.prompt ?? '',
    points: question.points ?? 1,
    isRequired: question.isRequired ?? true,
    difficulty: (question.difficulty as Difficulty) ?? 'MEDIUM',
    answers: question.answers?.length ? question.answers.map(String) : [''],
    blankAnswers: (question.blanks ?? []).map((list: string[]) => list.join(' | ')),
    rubric: question.rubric ?? '',
    options: question.options ?? [],
    sourceReference: question.sourceReference || undefined,
  };
}

/** The request body for one question. */
export function toPayload(q: Question) {
  const answers = q.answers.map((answer) => answer.trim()).filter(Boolean);
  const hasOptions = q.type === 'MULTIPLE_CHOICE' || q.type === 'MULTIPLE_RESPONSE';
  return {
    type: q.type,
    prompt: q.prompt.trim(),
    points: q.points,
    isRequired: q.isRequired,
    difficulty: q.difficulty,
    correctAnswer:
      q.type === 'IDENTIFICATION' || q.type === 'ENUMERATION'
        ? JSON.stringify(answers)
        : q.type === 'FILL_IN_THE_BLANK'
          ? JSON.stringify(
              q.blankAnswers.slice(0, countBlanks(q.prompt)).map(splitAlternatives)
            )
          : undefined,
    rubric: q.type === 'ESSAY' ? q.rubric : undefined,
    options: hasOptions ? q.options : undefined,
    allowTypos: q.allowTypos,
    partialCredit: q.partialCredit,
    sourceReference: q.sourceReference,
  };
}

/** First problem with a question, as a message for the teacher, or null. */
export function questionProblem(q: Question, index: number): string | null {
  const name = `Question ${index + 1}`;
  if (!q.prompt.trim()) return `${name} needs a prompt.`;
  if (!Number.isInteger(q.points) || q.points < 1)
    return `${name} must be worth at least 1 point.`;
  if (q.type === 'MULTIPLE_CHOICE' || q.type === 'MULTIPLE_RESPONSE') {
    if (q.options.length < 2 || q.options.some((option) => !option.label.trim()))
      return `${name} needs at least two filled-in choices.`;
    const correct = q.options.filter((option) => option.isCorrect).length;
    if (q.type === 'MULTIPLE_CHOICE' && correct !== 1)
      return `${name} needs exactly one correct choice.`;
    if (q.type === 'MULTIPLE_RESPONSE' && correct < 1)
      return `${name} needs at least one correct choice.`;
  }
  if ((q.type === 'IDENTIFICATION' || q.type === 'ENUMERATION') && !q.answers.some((a) => a.trim()))
    return `${name} needs at least one correct answer.`;
  if (q.type === 'FILL_IN_THE_BLANK') {
    const blanks = countBlanks(q.prompt);
    if (!blanks) return `${name}: mark each blank with ___ (three underscores).`;
    if (
      q.blankAnswers.length < blanks ||
      q.blankAnswers.slice(0, blanks).some((value) => !splitAlternatives(value).length)
    )
      return `${name} needs an accepted answer for each blank.`;
  }
  return null;
}
