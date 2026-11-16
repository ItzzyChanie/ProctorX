/**
 * AI difficulty review report.
 *
 * The AI service only judges individual questions. Everything numeric that
 * the teacher (and the defense) relies on — difficulty mix, agreement rate,
 * time estimate vs. duration — is computed here from the stored questions.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
const LEVELS: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export type AiQuestionReview = {
  index: number;
  estimatedDifficulty: Difficulty;
  confidence: number;
  bloomLevel: string;
  estimatedSeconds: number;
  reasons: string[];
  issues: { code: string; message: string }[];
  suggestion: string;
};

export type AiReviewResponse = {
  questions: AiQuestionReview[];
  overall: string;
  coverage: string;
};

export type ReviewedQuestion = {
  id: string;
  order: number;
  type: string;
  prompt: string;
  points: number;
  difficulty: Difficulty;
  correctAnswer: unknown;
  rubric: string | null;
  options: { label: string; isCorrect: boolean }[];
};

/** Answer key flattened to text for the reviewer. */
function answerText(question: ReviewedQuestion): string[] {
  const key = question.correctAnswer;
  if (!Array.isArray(key)) return key ? [String(key)] : [];
  if (question.type === 'FILL_IN_THE_BLANK')
    return key.map(
      (accepted, index) =>
        `Blank ${index + 1}: ${(Array.isArray(accepted) ? accepted : [accepted]).join(' | ')}`
    );
  return key.map(String);
}

/** Request body for the AI service. Index = position in the exam. */
export function reviewPayload(
  exam: {
    title: string;
    assessmentType: string;
    durationMinutes: number;
    sourceText: string | null;
  },
  questions: ReviewedQuestion[]
) {
  return {
    title: exam.title,
    assessment_type: exam.assessmentType,
    duration_minutes: exam.durationMinutes,
    source_text: exam.sourceText ?? '',
    questions: questions.map((question, index) => ({
      index,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      difficulty: question.difficulty,
      answers: answerText(question),
      options: question.options.map(({ label, isCorrect }) => ({ label, isCorrect })),
      rubric: question.rubric ?? '',
    })),
  };
}

const mix = (values: Difficulty[]) =>
  Object.fromEntries(
    LEVELS.map((level) => [level, values.filter((value) => value === level).length])
  ) as Record<Difficulty, number>;

export function buildReviewReport(
  questions: ReviewedQuestion[],
  ai: AiReviewResponse,
  durationMinutes: number,
  generatedAt = new Date()
) {
  const byIndex = new Map(ai.questions.map((item) => [item.index, item]));
  const items = questions.map((question, index) => {
    const review = byIndex.get(index);
    if (!review) throw new Error(`The AI review is missing question ${index + 1}`);
    return {
      questionId: question.id,
      order: question.order,
      prompt: question.prompt.slice(0, 160),
      teacherDifficulty: question.difficulty,
      ...review,
      matches: review.estimatedDifficulty === question.difficulty,
    };
  });
  const estimatedMinutes = Math.ceil(
    items.reduce((sum, item) => sum + item.estimatedSeconds, 0) / 60
  );
  const agreed = items.filter((item) => item.matches).length;
  return {
    generatedAt: generatedAt.toISOString(),
    questions: items,
    summary: {
      total: items.length,
      mismatches: items.length - agreed,
      agreementPercent: items.length ? Math.round((agreed / items.length) * 100) : 100,
      issues: items.reduce((sum, item) => sum + item.issues.length, 0),
      teacherMix: mix(items.map((item) => item.teacherDifficulty)),
      aiMix: mix(items.map((item) => item.estimatedDifficulty)),
      estimatedMinutes,
      durationMinutes,
      timeFits: estimatedMinutes <= durationMinutes,
      overall: ai.overall,
      coverage: ai.coverage,
    },
  };
}

export type ReviewReport = ReturnType<typeof buildReviewReport>;
