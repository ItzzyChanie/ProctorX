import { AlertTriangle, CheckCircle2, Clock3, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { DIFFICULTY_LABELS, type Difficulty } from './questions';

export type ReviewItem = {
  questionId: string;
  order: number;
  prompt: string;
  teacherDifficulty: Difficulty;
  estimatedDifficulty: Difficulty;
  confidence: number;
  bloomLevel: string;
  estimatedSeconds: number;
  reasons: string[];
  issues: { code: string; message: string }[];
  suggestion: string;
  matches: boolean;
};

export type ReviewReport = {
  generatedAt: string;
  questions: ReviewItem[];
  summary: {
    total: number;
    mismatches: number;
    agreementPercent: number;
    issues: number;
    teacherMix: Record<Difficulty, number>;
    aiMix: Record<Difficulty, number>;
    estimatedMinutes: number;
    durationMinutes: number;
    timeFits: boolean;
    overall: string;
    coverage: string;
  };
};

const ISSUE_LABELS: Record<string, string> = {
  AMBIGUOUS_WORDING: 'Ambiguous wording',
  MULTIPLE_DEFENSIBLE_ANSWERS: 'More than one defensible answer',
  ANSWER_NOT_IN_SOURCE: 'Answer not found in the source',
  WEAK_DISTRACTORS: 'Weak wrong choices',
  ANSWER_CUEING: 'Correct choice stands out',
  NEGATIVE_WORDING: 'Negative wording (NOT/EXCEPT)',
  ANSWER_LEAK: 'Another question gives the answer away',
  KEY_MAY_BE_WRONG: 'Answer key may be wrong',
  DEPENDS_ON_SOURCE_CONTEXT: 'Needs the slides to make sense',
};

const BLOOM_LABELS: Record<string, string> = {
  REMEMBER: 'Remember',
  UNDERSTAND: 'Understand',
  APPLY: 'Apply',
  ANALYZE: 'Analyze',
  EVALUATE: 'Evaluate',
  CREATE: 'Create',
};

const LEVELS: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

type Props = {
  report: ReviewReport | null;
  stale: boolean;
  running: boolean;
  rewritingIndex: number | null;
  onRun: () => void;
  onUseAiLevel: (index: number, level: Difficulty) => void;
  onRewrite: (index: number, suggestion: string) => void;
  onJump: (index: number) => void;
};

/**
 * Advisory AI difficulty review shown before publishing. The teacher keeps
 * every decision: accept the AI's level, keep their own, edit, or rewrite.
 */
export function AiReviewPanel({
  report,
  stale,
  running,
  rewritingIndex,
  onRun,
  onUseAiLevel,
  onRewrite,
  onJump,
}: Props) {
  return (
    <section className="mb-5 rounded-xl border border-brand/25 bg-brand-soft/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-text-1">
            <Sparkles size={17} className="text-brand" aria-hidden="true" /> AI difficulty review
          </h3>
          <p className="mt-1 text-xs text-text-2">
            Checks whether each question matches the difficulty you chose and flags wording or
            answer-key problems. Advisory only — you decide what to change before publishing.
          </p>
        </div>
        <Button type="button" disabled={running} onClick={onRun} className="w-full leading-tight sm:w-auto">
          {running ? 'Reviewing…' : report ? 'Save draft & review again' : 'Save draft & run AI review'}
        </Button>
      </div>

      {report && stale && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
          You changed questions since this review. Run it again before publishing.
        </p>
      )}

      {report && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Agrees with your difficulty"
              value={`${report.summary.agreementPercent}%`}
              detail={`${report.summary.mismatches} of ${report.summary.total} questions differ`}
              good={report.summary.mismatches === 0}
            />
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-semibold text-text-3">Difficulty mix (you → AI)</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {LEVELS.map((level) => (
                  <li key={level} className="flex justify-between gap-2">
                    <span>{DIFFICULTY_LABELS[level]}</span>
                    <span className="font-semibold">
                      {report.summary.teacherMix[level]} → {report.summary.aiMix[level]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Stat
              label="Estimated answering time"
              value={`${report.summary.estimatedMinutes} min`}
              detail={`Exam duration: ${report.summary.durationMinutes} min`}
              good={report.summary.timeFits}
            />
            <Stat
              label="Quality issues"
              value={String(report.summary.issues)}
              detail="See the flags below"
              good={report.summary.issues === 0}
            />
          </div>
          {(report.summary.overall || report.summary.coverage) && (
            <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-2">
              {report.summary.overall && <p>{report.summary.overall}</p>}
              {report.summary.coverage && (
                <p className="mt-1 text-xs text-text-3">Coverage: {report.summary.coverage}</p>
              )}
            </div>
          )}

          <ol className="mt-4 space-y-2">
            {report.questions.map((item) => {
              const index = item.order - 1;
              const flagged = !item.matches || item.issues.length > 0;
              return (
                <li
                  key={item.questionId}
                  className={`rounded-lg border p-3 text-sm ${flagged ? 'border-amber-300 bg-amber-50/70' : 'border-border bg-surface'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {flagged ? (
                      <AlertTriangle size={15} className="text-amber-600" aria-label="Needs attention" />
                    ) : (
                      <CheckCircle2 size={15} className="text-emerald-600" aria-label="Looks fine" />
                    )}
                    <button type="button" className="font-semibold text-brand underline-offset-2 hover:underline" onClick={() => onJump(index)}>
                      Question {item.order}
                    </button>
                    <span className="text-text-2">
                      You: <b>{DIFFICULTY_LABELS[item.teacherDifficulty]}</b> · AI:{' '}
                      <b>{DIFFICULTY_LABELS[item.estimatedDifficulty]}</b> ({Math.round(item.confidence * 100)}%)
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-3">
                      {BLOOM_LABELS[item.bloomLevel] ?? item.bloomLevel}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-3">
                      <Clock3 size={12} aria-hidden="true" /> ~{Math.max(1, Math.round(item.estimatedSeconds / 60))} min
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-3">{item.prompt}</p>
                  {item.reasons.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-text-2">
                      {item.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {item.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {item.issues.map((issue) => (
                        <li key={issue.code + issue.message} className="text-amber-900">
                          <b>{ISSUE_LABELS[issue.code] ?? issue.code}:</b> {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.suggestion && <p className="mt-2 text-xs italic text-text-2">Suggestion: {item.suggestion}</p>}
                  {!item.matches && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" onClick={() => onUseAiLevel(index, item.estimatedDifficulty)}>
                        Use AI level ({DIFFICULTY_LABELS[item.estimatedDifficulty]})
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={rewritingIndex !== null}
                        onClick={() => onRewrite(index, item.suggestion)}
                      >
                        {rewritingIndex === index
                          ? 'Rewriting…'
                          : `Rewrite as ${DIFFICULTY_LABELS[item.teacherDifficulty]}`}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-text-3">
            Reviewed {new Date(report.generatedAt).toLocaleString()}. After the exam, compare these
            predictions with how students actually did in Submitted Exams → Item analysis.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, detail, good }: { label: string; value: string; detail: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs font-semibold text-text-3">{label}</p>
      <p className={`mt-1 text-xl font-black ${good ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</p>
      <p className="text-xs text-text-3">{detail}</p>
    </div>
  );
}
