import { Flag } from 'lucide-react';

export type NavigatorQuestion = { id: string; isRequired: boolean };

type Props = {
  questions: NavigatorQuestion[];
  isAnswered: (id: string) => boolean;
  flagged: Set<string>;
  currentPage: number;
  perPage: number;
  onGo: (index: number) => void;
};

/** Clickable question numbers: answered, unanswered and flagged at a glance. */
export function QuestionNavigator({ questions, isAnswered, flagged, currentPage, perPage, onGo }: Props) {
  const answered = questions.filter((question) => isAnswered(question.id)).length;
  return (
    <nav
      aria-label="Question navigator"
      className="mx-auto mb-4 max-w-5xl rounded-2xl border border-white/80 bg-white/90 p-3 shadow-md"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          <b className="text-slate-900">{answered}</b> of {questions.length} answered
          {flagged.size > 0 && (
            <>
              {' · '}
              <b className="text-amber-700">{flagged.size}</b> flagged
            </>
          )}
        </span>
        <span className="flex flex-wrap gap-3">
          <Legend className="bg-emerald-500" label="Answered" />
          <Legend className="border border-slate-300 bg-white" label="Not answered" />
          <Legend className="bg-amber-400" label="Flagged" />
        </span>
      </div>
      <ol className="flex flex-wrap gap-1.5">
        {questions.map((question, index) => {
          const done = isAnswered(question.id);
          const isFlagged = flagged.has(question.id);
          const onPage = Math.floor(index / perPage) === currentPage;
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onGo(index)}
                aria-label={`Question ${index + 1}: ${done ? 'answered' : 'not answered'}${isFlagged ? ', flagged' : ''}${question.isRequired ? ', required' : ''}`}
                className={`relative grid h-8 w-8 place-items-center rounded-lg text-xs font-bold transition focus:outline-none focus:ring-4 focus:ring-violet-300 ${
                  isFlagged
                    ? 'bg-amber-400 text-amber-950'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'border border-slate-300 bg-white text-slate-700'
                } ${onPage ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
              >
                {index + 1}
                {isFlagged && <Flag size={9} className="absolute right-0.5 top-0.5" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
