/**
 * Automatic answer checking for every objective question type.
 *
 * Scores are rounded to two decimals so partial credit stays fair on
 * 1-2 point questions (e.g. 2 of 3 blanks on a 2-point item = 1.33).
 * Essays return null: they are graded by the teacher.
 */

export type ScorableQuestion = {
  type: string;
  points: number;
  correctAnswer: unknown;
  options: { id: string; isCorrect: boolean }[];
  /** Credit per correct part (enumeration, checkboxes, fill in the blank). */
  partialCredit?: boolean;
  /** Accept one small typo (identification, enumeration, fill in the blank). */
  allowTypos?: boolean;
};

export type SubmittedAnswer = {
  questionId: string;
  responseText?: string;
  selectedOptionIds?: string[];
};

const superscriptDigits: Record<number, string> = {
  0x2070: '0',
  0x00b9: '1',
  0x00b2: '2',
  0x00b3: '3',
  0x2074: '4',
  0x2075: '5',
  0x2076: '6',
  0x2077: '7',
  0x2078: '8',
  0x2079: '9',
};

/** Case, spacing, hyphen and unicode-variant insensitive comparison text. */
export const normalizeObjectiveText = (input: unknown) =>
  String(input ?? '')
    .replace(
      /[⁰¹²³⁴-⁹]+/gu,
      (digits) =>
        `^${[...digits].map((digit) => superscriptDigits[digit.codePointAt(0)!]).join('')}`
    )
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/[‐-―]/gu, '-')
    .replace(/\s*([/\\*^#!+=<>%])\s*/gu, '$1')
    .replace(/([\p{L}])\s*-\s*(?=\p{L})/gu, '$1')
    .replace(/([\p{L}])\s+(?=\p{L})/gu, '$1')
    .replace(/\s+/gu, ' ');

/** A list answer (enumeration / fill in the blank) sent as JSON or lines. */
export const listValues = (responseText?: string, keepEmpty = false): string[] => {
  if (!responseText?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (Array.isArray(parsed)) {
      const values = parsed.map((value) => String(value ?? ''));
      return keepEmpty ? values : values.filter((value) => value.trim());
    }
  } catch {
    // Older enumeration answers were newline-separated text.
  }
  const lines = responseText.split(/\r?\n/gu);
  return keepEmpty ? lines : lines.filter((value) => value.trim());
};

/** True when a and b differ by at most one edit (incl. swapping two letters). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let i = 0; i < a.length && diffs.length <= 2; i++) if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length === 1) return true;
    return (
      diffs.length === 2 &&
      diffs[1] === diffs[0]! + 1 &&
      a[diffs[0]!] === b[diffs[1]!] &&
      a[diffs[1]!] === b[diffs[0]!]
    );
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}

/** Typos are only forgiven for answers long enough that one edit is not a different word. */
const TYPO_MIN_LENGTH = 5;

export function matchesAccepted(actual: string, accepted: unknown[], allowTypos = false) {
  const value = normalizeObjectiveText(actual);
  if (!value) return false;
  return accepted.some((candidate) => {
    const expected = normalizeObjectiveText(candidate);
    if (!expected) return false;
    if (expected === value) return true;
    return allowTypos && expected.length >= TYPO_MIN_LENGTH && withinOneEdit(expected, value);
  });
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];

/** Points earned for one answer, or null when a teacher must grade it. */
export function scoreAnswer(question: ScorableQuestion, answer: SubmittedAnswer): number | null {
  const { points } = question;
  const partial = question.partialCredit ?? false;
  const typos = question.allowTypos ?? false;
  const fraction = (earned: number, possible: number) =>
    possible ? round2(points * Math.max(0, Math.min(1, earned / possible))) : 0;

  switch (question.type) {
    case 'ESSAY':
      return null;

    case 'MULTIPLE_CHOICE': {
      const correct = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const selected = [...new Set(answer.selectedOptionIds ?? [])];
      return selected.length === 1 && correct.includes(selected[0]!) ? points : 0;
    }

    case 'MULTIPLE_RESPONSE': {
      const correct = new Set(question.options.filter((option) => option.isCorrect).map((option) => option.id));
      const valid = new Set(question.options.map((option) => option.id));
      const selected = [...new Set(answer.selectedOptionIds ?? [])].filter((id) => valid.has(id));
      const right = selected.filter((id) => correct.has(id)).length;
      const wrong = selected.length - right;
      if (!partial) return right === correct.size && wrong === 0 ? points : 0;
      // Each wrong tick cancels one right tick, so ticking everything earns nothing.
      return fraction(right - wrong, correct.size);
    }

    case 'IDENTIFICATION':
      return matchesAccepted(answer.responseText ?? '', asList(question.correctAnswer), typos) ? points : 0;

    case 'ENUMERATION': {
      const expected = asList(question.correctAnswer).map(String);
      // Only as many entries as expected items count, so listing extras cannot help.
      const given = listValues(answer.responseText).slice(0, expected.length);
      const unmatched = [...expected];
      let right = 0;
      for (const value of given) {
        const index = unmatched.findIndex((item) => matchesAccepted(value, [item], typos));
        if (index >= 0) {
          unmatched.splice(index, 1);
          right++;
        }
      }
      if (!partial) return right === expected.length ? points : 0;
      return fraction(right, expected.length);
    }

    case 'FILL_IN_THE_BLANK': {
      const blanks = asList(question.correctAnswer).map(asList);
      const given = listValues(answer.responseText, true);
      const right = blanks.filter((accepted, index) => matchesAccepted(given[index] ?? '', accepted, typos)).length;
      if (!partial) return right === blanks.length ? points : 0;
      return fraction(right, blanks.length);
    }

    default:
      return 0;
  }
}
