/**
 * Classical item analysis of a finished exam, comparing the teacher's chosen
 * difficulty and the AI's predicted difficulty with how students actually
 * performed.
 *
 * - Difficulty index p: mean share of the question's points students earned.
 *   p > 0.70 = Easy, 0.30-0.70 = Medium, p < 0.30 = Hard.
 * - Discrimination index D: mean share earned by the top 27% of students
 *   (by total score) minus the bottom 27%. Ebel's guide: >= 0.40 very good,
 *   0.30-0.39 good, 0.20-0.29 fair, < 0.20 poor; negative D usually means a
 *   wrong answer key or a misleading question.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export const MIN_STUDENTS = 5;
const GROUP_FRACTION = 0.27;

export type AnalysisQuestion = {
  id: string;
  order: number;
  type: string;
  prompt: string;
  points: number;
  difficulty: Difficulty;
};

export type AnalysisSubmission = {
  totalScore: number | null;
  answers: { questionId: string; awardedPoints: number | null }[];
};

export type AiPrediction = { questionId: string; estimatedDifficulty: Difficulty };

export function difficultyFromP(p: number): Difficulty {
  if (p > 0.7) return 'EASY';
  if (p >= 0.3) return 'MEDIUM';
  return 'HARD';
}

export function discriminationLabel(d: number) {
  if (d < 0) return 'NEGATIVE';
  if (d >= 0.4) return 'VERY_GOOD';
  if (d >= 0.3) return 'GOOD';
  if (d >= 0.2) return 'FAIR';
  return 'POOR';
}

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function analyzeItems(
  questions: AnalysisQuestion[],
  submissions: AnalysisSubmission[],
  predictions: AiPrediction[] = []
) {
  const graded = submissions.filter((submission) => submission.totalScore !== null);
  const ranked = [...graded].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
  const groupSize = Math.max(1, Math.round(ranked.length * GROUP_FRACTION));
  const upper = ranked.slice(0, groupSize);
  const lower = ranked.slice(-groupSize);
  const predicted = new Map(predictions.map((item) => [item.questionId, item.estimatedDifficulty]));
  const enough = graded.length >= MIN_STUDENTS;

  const shareFor = (submission: AnalysisSubmission, question: AnalysisQuestion) => {
    const answer = submission.answers.find((item) => item.questionId === question.id);
    // Unanswered = 0 points; essays not yet graded are left out.
    if (answer && answer.awardedPoints === null) return null;
    return Math.max(0, Math.min(1, (answer?.awardedPoints ?? 0) / question.points));
  };

  const items = questions.map((question) => {
    const shares = graded
      .map((submission) => shareFor(submission, question))
      .filter((share): share is number => share !== null);
    const p = mean(shares);
    const groupMean = (group: AnalysisSubmission[]) =>
      mean(
        group
          .map((submission) => shareFor(submission, question))
          .filter((share): share is number => share !== null)
      );
    const d = groupMean(upper) - groupMean(lower);
    const actual = difficultyFromP(p);
    const ai = predicted.get(question.id) ?? null;
    return {
      questionId: question.id,
      order: question.order,
      type: question.type,
      prompt: question.prompt.slice(0, 200),
      responses: shares.length,
      difficultyIndex: round(p),
      actualDifficulty: actual,
      teacherDifficulty: question.difficulty,
      aiDifficulty: ai,
      teacherMatches: question.difficulty === actual,
      aiMatches: ai === null ? null : ai === actual,
      discrimination: round(d),
      discriminationLabel: discriminationLabel(round(d)),
    };
  });

  const withAi = items.filter((item) => item.aiMatches !== null);
  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
  const totals = graded.map((submission) => submission.totalScore ?? 0);
  const maxTotal = questions.reduce((sum, question) => sum + question.points, 0);
  return {
    students: graded.length,
    enoughStudents: enough,
    minimumStudents: MIN_STUDENTS,
    meanScorePercent: maxTotal ? Math.round((mean(totals) / maxTotal) * 100) : 0,
    teacherAgreementPercent: percent(items.filter((item) => item.teacherMatches).length, items.length),
    aiAgreementPercent: percent(withAi.filter((item) => item.aiMatches).length, withAi.length),
    aiPredictionsAvailable: withAi.length > 0,
    items,
  };
}
