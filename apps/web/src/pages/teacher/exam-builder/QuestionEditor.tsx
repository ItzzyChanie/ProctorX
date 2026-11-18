import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import {
  AVAILABLE_TYPES,
  blankQuestion,
  countBlanks,
  DIFFICULTY_LABELS,
  TYPE_LABELS,
  type Difficulty,
  type QType,
  type Question,
} from './questions';

const input =
  'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand';

type Props = {
  question: Question;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
};

/** Editor for one exam question (every supported type). */
export function QuestionEditor({ question: q, index: i, canRemove, onChange, onRemove }: Props) {
  const blanks = countBlanks(q.prompt);
  const setOption = (n: number, patch: Partial<Question['options'][number]>) =>
    onChange({ options: q.options.map((option, j) => (j === n ? { ...option, ...patch } : option)) });
  const setAnswer = (n: number, value: string) =>
    onChange({ answers: q.answers.map((answer, j) => (j === n ? value : answer)) });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-4 grid items-end gap-3 sm:grid-cols-[auto_minmax(0,16rem)_8rem_6rem_1fr_auto]">
        <b className="self-center text-text-2">{i + 1}.</b>
        <label className="block min-w-0 text-xs font-semibold">
          Question type
          <select
            className={`${input} mt-1`}
            value={q.type}
            onChange={(e) => {
              const type = e.target.value as QType;
              const fresh = blankQuestion(type);
              onChange({ type, answers: fresh.answers, options: fresh.options, blankAnswers: [] });
            }}
          >
            {[...new Set([...AVAILABLE_TYPES, q.type])].map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold">
          Difficulty
          <select
            className={`${input} mt-1`}
            value={q.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
          >
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold">
          Points
          <input
            className={`${input} mt-1`}
            type="number"
            min="1"
            value={q.points}
            onChange={(e) => onChange({ points: +e.target.value })}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 self-end text-sm sm:justify-self-end">
          <input
            type="checkbox"
            checked={q.isRequired}
            onChange={(e) => onChange({ isRequired: e.target.checked })}
          />
          Required
        </label>
        <button
          type="button"
          aria-label={`Remove question ${i + 1}`}
          className="grid min-h-10 min-w-10 place-items-center self-end rounded-lg text-text-3 hover:bg-red-50 hover:text-risk-high disabled:opacity-40"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <label className="block text-xs font-semibold">
        Question prompt
        <textarea
          className={`${input} mt-1 min-h-20 resize-y`}
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder={
            q.type === 'FILL_IN_THE_BLANK'
              ? 'Type the sentence and use ___ (three underscores) for each blank, e.g. The ___ executes instructions.'
              : 'Enter the question'
          }
        />
      </label>
      {q.sourceReference && (
        <p className="mt-1 text-xs text-text-3">Source: {q.sourceReference}</p>
      )}

      {(q.type === 'MULTIPLE_CHOICE' || q.type === 'MULTIPLE_RESPONSE') && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-text-3">
            {q.type === 'MULTIPLE_CHOICE'
              ? 'Mark the one correct choice.'
              : 'Tick every correct choice. Students tick all that apply.'}
          </p>
          {q.options.map((option, n) => (
            <div className="flex items-center gap-2" key={n}>
              <input
                type={q.type === 'MULTIPLE_CHOICE' ? 'radio' : 'checkbox'}
                name={`correct-${i}`}
                aria-label={`Choice ${n + 1} is correct`}
                checked={option.isCorrect}
                onChange={(e) =>
                  q.type === 'MULTIPLE_CHOICE'
                    ? onChange({ options: q.options.map((x, j) => ({ ...x, isCorrect: j === n })) })
                    : setOption(n, { isCorrect: e.target.checked })
                }
              />
              <input
                className={input}
                value={option.label}
                onChange={(e) => setOption(n, { label: e.target.value })}
                placeholder={`Choice ${n + 1}`}
              />
              <button
                type="button"
                aria-label={`Remove choice ${n + 1}`}
                disabled={q.options.length <= 2}
                onClick={() => onChange({ options: q.options.filter((_, j) => j !== n) })}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            icon={Plus}
            onClick={() => onChange({ options: [...q.options, { label: '', isCorrect: false }] })}
          >
            Add choice
          </Button>
          {q.type === 'MULTIPLE_RESPONSE' && (
            <PartialCredit q={q} onChange={onChange} hint="each wrong tick cancels one right tick" />
          )}
        </div>
      )}

      {(q.type === 'IDENTIFICATION' || q.type === 'ENUMERATION') && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-text-3">
            {q.type === 'IDENTIFICATION'
              ? 'Add every answer you will accept (e.g. "CPU" and "Central Processing Unit"). Capital letters, spaces and hyphens are ignored.'
              : 'List every expected item. Order does not matter.'}
          </p>
          {q.answers.map((answer, n) => (
            <div className="flex gap-2" key={n}>
              <input
                className={input}
                value={answer}
                onChange={(e) => setAnswer(n, e.target.value)}
                placeholder={q.type === 'IDENTIFICATION' ? `Accepted answer ${n + 1}` : `Expected item ${n + 1}`}
              />
              <button
                type="button"
                aria-label={`Remove answer ${n + 1}`}
                disabled={q.answers.length === 1}
                onClick={() => onChange({ answers: q.answers.filter((_, j) => j !== n) })}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" icon={Plus} onClick={() => onChange({ answers: [...q.answers, ''] })}>
            {q.type === 'IDENTIFICATION' ? 'Add accepted answer' : 'Add expected item'}
          </Button>
          {q.type === 'IDENTIFICATION' ? (
            <AllowTypos q={q} onChange={onChange} />
          ) : (
            <PartialCredit q={q} onChange={onChange} hint="credit for each correct item" />
          )}
        </div>
      )}

      {q.type === 'FILL_IN_THE_BLANK' && (
        <div className="mt-3 space-y-2">
          {!blanks && (
            <p className="text-xs text-risk-high">Add at least one ___ blank to the sentence above.</p>
          )}
          {Array.from({ length: blanks }, (_, n) => (
            <label className="block text-xs font-semibold" key={n}>
              Blank {n + 1}: accepted answers (separate alternatives with |)
              <input
                className={`${input} mt-1`}
                value={q.blankAnswers[n] ?? ''}
                onChange={(e) => {
                  const next = [...q.blankAnswers];
                  while (next.length < blanks) next.push('');
                  next[n] = e.target.value;
                  onChange({ blankAnswers: next });
                }}
                placeholder="e.g. CPU | processor"
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-x-5">
            <AllowTypos q={q} onChange={onChange} />
            <PartialCredit q={q} onChange={onChange} hint="credit for each correct blank" />
          </div>
        </div>
      )}

      {q.type === 'ESSAY' && (
        <textarea
          className={`${input} mt-3`}
          value={q.rubric}
          onChange={(e) => onChange({ rubric: e.target.value })}
          placeholder="Rubric / guidance"
        />
      )}
    </div>
  );
}

function AllowTypos({ q, onChange }: { q: Question; onChange: Props['onChange'] }) {
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-text-2">
      <input type="checkbox" checked={q.allowTypos} onChange={(e) => onChange({ allowTypos: e.target.checked })} />
      Accept one small typo (for answers of 5+ letters)
    </label>
  );
}

function PartialCredit({ q, onChange, hint }: { q: Question; onChange: Props['onChange']; hint: string }) {
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-text-2">
      <input
        type="checkbox"
        checked={q.partialCredit}
        onChange={(e) => onChange({ partialCredit: e.target.checked })}
      />
      Partial credit ({hint})
    </label>
  );
}
