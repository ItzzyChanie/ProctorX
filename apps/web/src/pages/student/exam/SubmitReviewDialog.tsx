import { useEffect, useRef } from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { NavigatorQuestion } from './QuestionNavigator';

type Props = {
  open: boolean;
  kind: 'exam' | 'quiz';
  questions: NavigatorQuestion[];
  isAnswered: (id: string) => boolean;
  flagged: Set<string>;
  submitting: boolean;
  onGo: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Last check before the final, irreversible submit: unanswered and flagged
 * questions with links back to them. Required blanks block submitting.
 */
export function SubmitReviewDialog({
  open,
  kind,
  questions,
  isAnswered,
  flagged,
  submitting,
  onGo,
  onCancel,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus "Keep answering" so Enter does not submit by accident.
    dialogRef.current?.querySelector<HTMLButtonElement>('button[data-autofocus]')?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;

  const indexed = questions.map((question, index) => ({ ...question, index }));
  const unanswered = indexed.filter((question) => !isAnswered(question.id));
  const requiredBlank = unanswered.filter((question) => question.isRequired);
  const flaggedList = indexed.filter((question) => flagged.has(question.id));
  const go = (index: number) => {
    onCancel();
    onGo(index);
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        aria-labelledby="submit-review-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="submit-review-title" className="text-xl font-black text-slate-900">
          Submit your {kind}?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {questions.length - unanswered.length} of {questions.length} questions answered. After you
          submit you cannot change your answers.
        </p>

        {requiredBlank.length > 0 && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} aria-hidden="true" /> Answer the required questions first:
            </p>
            <QuestionLinks items={requiredBlank} onGo={go} />
          </div>
        )}
        {unanswered.length > requiredBlank.length && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">Optional questions left blank:</p>
            <QuestionLinks items={unanswered.filter((question) => !question.isRequired)} onGo={go} />
          </div>
        )}
        {flaggedList.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <Flag size={15} aria-hidden="true" /> You flagged these to review:
            </p>
            <QuestionLinks items={flaggedList} onGo={go} />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button data-autofocus type="button" variant="ghost" onClick={onCancel}>
            Keep answering
          </Button>
          <Button type="button" disabled={submitting || requiredBlank.length > 0} onClick={onConfirm}>
            {submitting ? 'Submitting…' : `Submit ${kind}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionLinks({ items, onGo }: { items: { index: number }[]; onGo: (index: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map(({ index }) => (
        <button
          key={index}
          type="button"
          onClick={() => onGo(index)}
          className="rounded-lg border border-current px-2 py-0.5 text-xs font-bold hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          Q{index + 1}
        </button>
      ))}
    </div>
  );
}
