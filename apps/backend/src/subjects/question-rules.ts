import { BadRequestException } from '@nestjs/common';
import { Prisma, QuestionDifficulty, QuestionType } from '@prisma/client';
import type { QuestionDto } from './dto/subjects.dto';

/** A blank in a fill-in-the-blank prompt: three or more underscores. */
export const BLANK_PATTERN = /_{3,}/g;

export function countBlanks(prompt: string) {
  return prompt.match(BLANK_PATTERN)?.length ?? 0;
}

const describe = (question: QuestionDto, index: number) =>
  `Question ${index + 1}${question.prompt?.trim() ? ` ("${question.prompt.trim().slice(0, 50)}")` : ''}`;

function parseJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value; // a plain string (e.g. a single identification answer)
  }
}

const cleanList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

/**
 * Validates one question and converts it into the stored shape.
 *
 * Answer keys (correctAnswer) per type:
 * - MULTIPLE_CHOICE:    options, exactly one correct
 * - MULTIPLE_RESPONSE:  options, one or more correct
 * - IDENTIFICATION:     list of accepted answers (a plain string is one answer)
 * - ENUMERATION:        list of expected items
 * - FILL_IN_THE_BLANK:  one list of accepted answers per ___ blank in the prompt
 * - ESSAY:              no key; optional rubric
 */
export function normalizeQuestion(
  question: QuestionDto,
  index: number
): Omit<Prisma.QuestionCreateWithoutExamInput, 'order'> {
  const label = describe(question, index);
  const prompt = question.prompt?.trim();
  if (!prompt) throw new BadRequestException(`${label} needs a question prompt`);
  if (!Number.isInteger(question.points) || question.points < 1 || question.points > 1000)
    throw new BadRequestException(`${label} must be worth 1 to 1000 points`);

  const type = question.type as QuestionType;
  const base = {
    type,
    prompt,
    points: question.points,
    isRequired: question.isRequired,
    rubric: question.rubric?.trim() || null,
    difficulty: (question.difficulty as QuestionDifficulty | undefined) ?? QuestionDifficulty.MEDIUM,
    sourceReference: question.sourceReference?.trim() || null,
    allowTypos: Boolean(question.allowTypos),
    partialCredit: question.partialCredit ?? true,
  };

  if (type === QuestionType.MULTIPLE_CHOICE || type === QuestionType.MULTIPLE_RESPONSE) {
    const options = (question.options ?? []).map((option) => ({
      label: option.label.trim(),
      isCorrect: option.isCorrect,
    }));
    if (options.length < 2 || options.some((option) => !option.label))
      throw new BadRequestException(`${label} needs at least two filled-in choices`);
    const labels = new Set(options.map((option) => option.label.toLowerCase()));
    if (labels.size !== options.length)
      throw new BadRequestException(`${label} has duplicate choices`);
    const correct = options.filter((option) => option.isCorrect).length;
    if (type === QuestionType.MULTIPLE_CHOICE && correct !== 1)
      throw new BadRequestException(
        `${label}: multiple choice needs exactly one correct answer (use "Checkboxes" for more than one)`
      );
    if (type === QuestionType.MULTIPLE_RESPONSE && correct < 1)
      throw new BadRequestException(`${label} needs at least one correct choice`);
    return { ...base, correctAnswer: Prisma.DbNull, options: { create: options } };
  }

  if (type === QuestionType.ESSAY) return { ...base, correctAnswer: Prisma.DbNull };

  const key = parseJson(question.correctAnswer);
  if (type === QuestionType.IDENTIFICATION) {
    const accepted = typeof key === 'string' ? cleanList([key]) : cleanList(key);
    if (!accepted.length) throw new BadRequestException(`${label} needs at least one accepted answer`);
    return { ...base, correctAnswer: accepted };
  }
  if (type === QuestionType.ENUMERATION) {
    const items = cleanList(key);
    if (!items.length) throw new BadRequestException(`${label} needs a list of expected answers`);
    return { ...base, correctAnswer: items };
  }
  if (type === QuestionType.FILL_IN_THE_BLANK) {
    const blanks = countBlanks(prompt);
    if (!blanks)
      throw new BadRequestException(`${label}: mark each blank in the sentence with ___ (three underscores)`);
    const perBlank = Array.isArray(key) ? key.map(cleanList) : [];
    if (perBlank.length !== blanks || perBlank.some((answers) => !answers.length))
      throw new BadRequestException(
        `${label} has ${blanks} blank${blanks === 1 ? '' : 's'}; give at least one accepted answer for each`
      );
    return { ...base, correctAnswer: perBlank };
  }
  throw new BadRequestException(`${label} has an unsupported question type`);
}

export function normalizeQuestions(questions: QuestionDto[]) {
  const data = questions.map((question, index) => ({
    ...normalizeQuestion(question, index),
    order: index + 1,
  }));
  return {
    create: data,
    totalPoints: data.reduce((sum, question) => sum + question.points, 0),
  };
}
