import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, RotateCcw, Search, Trash2, X, XCircle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Period = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
};
type Profile = {  
  studentId?: string;
  yearLevel?: string;
  program?: string;
  section?: { name: string };
};
type SubmissionRow = {
  id: string;
  submittedAt: string;
  deletedAt: string | null;
  totalScore: number | null;
  maxScore: number;
  gradeStatus: string;
  mode: 'MANUAL' | 'AUTO_TIMEOUT';
  session: {
    endedAt?: string;
    student: {
      id: string;
      fullName: string;
      profilePicture?: string;
      studentProfile?: Profile;
    };
    exam: {
      id: string;
      title: string;
      assessmentType: 'EXAM' | 'QUIZ';
      term: string;
      subject: { code: string; name: string };
      academicPeriod: Period;
    };
  };
};
type AnswerDetail = {
  id: string;
  responseText?: string;
  selectedOptionIds: string[];
  awardedPoints: number | null;
  gradeStatus: string;
  question: {
    id: string;
    order: number;
    prompt: string;
    type: string;
    points: number;
    correctAnswer: unknown;
    rubric?: string;
    options: { id: string; label: string; isCorrect: boolean }[];
  };
};
type SubmissionDetail = SubmissionRow & { teacherFeedback?: string; answers: AnswerDetail[]; session: SubmissionRow['session'] & { exam: SubmissionRow['session']['exam'] & { showCorrectAnswers: boolean } } };

const terms = [
  ['PRELIMINARY', 'Preliminary'],
  ['MIDTERM', 'Midterm'],
  ['SEMI_FINAL', 'Semi-final'],
  ['FINAL', 'Final'],
] as const;
const formatFinished = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
const academicProfile = (profile?: Profile) => {
  const rawYear = profile?.yearLevel?.trim();
  const year = rawYear
    ? /yr/i.test(rawYear)
      ? rawYear
      : `${rawYear}${rawYear === '1' ? 'st' : rawYear === '2' ? 'nd' : rawYear === '3' ? 'rd' : 'th'} Yr`
    : 'Year unavailable';
  return `${year} ${profile?.program ?? 'Program unavailable'} - ${profile?.section?.name ?? 'Unassigned'}`;
};
const parseEnumeration = (value?: string) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return value.split(/\r?\n/u);
  }
};

export default function SubmittedExams() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [archive, setArchive] = useState<'active' | 'archived'>('active');
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SubmissionRow>();
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), 3500);
  };
  const periods = useQuery({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get<Period[]>('/academic-periods')).data,
  });
  const results = useQuery({
    queryKey: [
      'submitted-exams',
      archive,
      debouncedSearch,
      periodId,
      term,
      sort,
      page,
      pageSize,
    ],
    queryFn: async () =>
      (
        await api.get<{
          items: SubmissionRow[];
          total: number;
          page: number;
          pageSize: number;
        }>('/sessions/submissions', {
          params: {
            archive,
            search: debouncedSearch || undefined,
            academicPeriodId: periodId || undefined,
            term: term || undefined,
            sort,
            page,
            pageSize,
          },
        })
      ).data,
  });
  const detail = useQuery({
    queryKey: ['submission-detail', selectedId],
    enabled: !!selectedId,
    queryFn: async () =>
      (await api.get<SubmissionDetail>(`/sessions/submissions/${selectedId}`))
        .data,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sessions/submissions/${id}`),
    onSuccess: async () => {
      setPendingDelete(undefined);
      setSelectedId(undefined);
      await client.invalidateQueries({ queryKey: ['submitted-exams'] });
      notify('Submitted exam archived successfully.');
    },
    onError: () => notify('Could not archive the submitted exam.', true),
  });
  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/sessions/submissions/${id}/restore`),
    onSuccess: async () => {
      setSelectedId(undefined);
      await client.invalidateQueries({ queryKey: ['submitted-exams'] });
      notify('Submitted exam restored successfully.');
    },
    onError: () => notify('Could not restore the submitted exam.', true),
  });  const total = results.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  return (
    <DashboardLayout role="teacher" pageTitle="Submitted Exams">
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[120] rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-xl ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}
        >
          {toast.message}
        </div>
      )}
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Submitted Exams"
            subtitle="Review manually and automatically submitted examinations, verify answers, and confirm scoring."
          />
        </Card>
        <Card padded={false}>
          <div className="flex gap-2 border-b border-border p-4">
            {(['active', 'archived'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setArchive(value);
                  setPage(1);
                  setSelectedId(undefined);
                  setPendingDelete(undefined);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${archive === value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {value === 'active' ? 'Active Submissions' : 'Archived Submissions'}
              </button>
            ))}
          </div>          <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(240px,1fr)_repeat(4,auto)]">
            <label className="relative">
              <Search size={17} className="absolute left-3 top-3 text-text-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, ID, subject, or exam?"
                className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
            <select
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <option value="">All semesters</option>
              {periods.data?.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.academicYear} ?{' '}
                  {period.semester === 'FIRST' ? 'First' : 'Second'} Semester
                </option>
              ))}
            </select>
            <select
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <option value="">All terms</option>
              {terms.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as 'asc' | 'desc');
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3"
            >
              <option value="asc">Name A-Z</option>
              <option value="desc">Name Z-A</option>
            </select>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3"
            >
              {[15, 25, 35, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </div>
          {results.isLoading && (
            <p className="p-6 text-sm text-text-2">Loading submitted exams...</p>
          )}
          {results.isError && (
            <p className="p-6 text-sm text-red-600">
              Submitted exams could not be loaded.
            </p>
          )}
          {!results.isLoading && !results.data?.items.length && (
            <p className="p-8 text-center text-sm text-text-3">
              No {archive === 'archived' ? 'archived' : 'active'} submissions match the selected filters.
            </p>
          )}
          {!!results.data?.items.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs uppercase text-text-3">
                  <tr>
                    {[
                      'Profile',
                      'Student ID',
                      'Full name',
                      'Academic Profile',
                      'Subject',
                      'Exam / Quiz',
                      'Status',
                      'Finished At',
                      'Actions',
                    ].map((label) => (
                      <th key={label} className="px-3 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.data.items.map((row) => {
                    const student = row.session.student,
                      profile = student.studentProfile,
                      exam = row.session.exam;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border hover:bg-brand-soft/20"
                      >
                        <td className="px-3 py-3">
                          {student.profilePicture ? (
                            <img
                              src={student.profilePicture}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft font-bold text-brand">
                              {student.fullName[0]}
                            </span>
                          )}
                        </td>
                        <td className="px-3">{profile?.studentId ?? 'N/A'}</td>
                        <td className="px-3 font-semibold">
                          {student.fullName}
                        </td>
                        <td className="px-3">{academicProfile(profile)}</td>
                        <td className="px-3">
                          <b>{exam.subject.code}</b>
                          <div className="text-xs text-text-3">
                            {exam.subject.name}
                          </div>
                        </td>
                        <td className="px-3">
                          {exam.title}
                          <div className="text-xs text-text-3">
                            {exam.assessmentType === 'QUIZ' ? 'Quiz' : 'Exam'}{' '}
                            <span aria-hidden="true" className="text-slate-400">&bull;</span>{' '}
                            {exam.term.replace(/_/g, ' ')}
                          </div>
                        </td>

                        <td className="px-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.deletedAt ? 'bg-slate-200 text-slate-700' : row.gradeStatus === 'TEACHER_CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          >
                            {row.deletedAt
                              ? 'Archived'
                              : row.gradeStatus === 'TEACHER_CONFIRMED'
                                ? 'Confirmed'
                                : 'Needs review'}
                          </span>
                          <div className="mt-1 text-[10px] text-text-3">
                            {row.deletedAt
                              ? `Archived ${formatFinished(row.deletedAt)}`
                              : row.mode === 'AUTO_TIMEOUT'
                                ? 'Auto-submitted'
                                : 'Submitted'}
                          </div>
                        </td>
                        <td className="px-3">
                          {formatFinished(
                            row.submittedAt ?? row.session.endedAt!
                          )}
                        </td>
                        <td className="px-3">
                          <div className="flex items-center gap-2">
                            <Button
                              icon={Eye}
                              onClick={() => setSelectedId(row.id)}
                            >
                              View Exam
                            </Button>
                            {row.deletedAt ? (
                              <Button
                                variant="ghost"
                                icon={RotateCcw}
                                disabled={restore.isPending}
                                onClick={() => restore.mutate(row.id)}
                              >
                                {restore.isPending ? 'Restoring...' : 'Restore'}
                              </Button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDelete(row)}
                                className="rounded-lg border border-red-200 p-2.5 text-red-600 hover:bg-red-50"
                                aria-label={`Archive ${student.fullName}'s submission`}
                              >
                                <Trash2 size={17} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-text-2">
            <span>
              Showing {total ? (page - 1) * pageSize + 1 : 0}?
              {Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {selectedId && (
        <ReviewModal
          detail={detail.data}
          loading={detail.isLoading}
          onClose={() => setSelectedId(undefined)}
          onUpdated={async () => {
            await client.invalidateQueries({
              queryKey: ['submission-detail', selectedId],
            });
            await client.invalidateQueries({ queryKey: ['submitted-exams'] });
            notify('Exam score updated successfully.');
          }}
          onError={() =>
            notify('The awarded points could not be updated.', true)
          }
        />
      )}
      {pendingDelete && (
        <DeleteModal
          row={pendingDelete}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={() => remove.mutate(pendingDelete.id)}
        />
      )}
    </DashboardLayout>
  );
}

function ReviewModal({
  detail,
  loading,
  onClose,
  onUpdated,
  onError,
}: {
  detail?: SubmissionDetail;
  loading: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onError: () => void;
}) {
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  useEffect(() => {
    setTeacherFeedback(detail?.teacherFeedback ?? '');
    setShowCorrectAnswers(detail?.session.exam.showCorrectAnswers ?? false);
  }, [detail?.id, detail?.teacherFeedback, detail?.session.exam.showCorrectAnswers]);
  const saveRelease = useMutation({
    mutationFn: () => api.patch(`/sessions/submissions/${detail!.id}/release-settings`, { teacherFeedback, showCorrectAnswers }),
    onSuccess: onUpdated,
    onError,
  });
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  if (loading || !detail)
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
        <div className="rounded-2xl bg-white p-8">Loading exam review...</div>
      </div>
    );
  const exam = detail.session.exam,
    student = detail.session.student,
    score = detail.totalScore ?? 0,
    passed = detail.maxScore > 0 && score >= detail.maxScore / 2;
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/80 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="sticky top-3 z-10 mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-slate-100/95 p-5 shadow-2xl backdrop-blur">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.18em] text-slate-600">
              Teacher examination review
            </div>
            <h2 className="mt-1 text-2xl font-black">{exam.title}</h2>
            <p className="text-sm text-text-2">
              {student.fullName}{' '}
              <span aria-hidden="true" className="mx-1 text-slate-400">&bull;</span>{' '}
              {exam.subject.code}{' '}
              <span aria-hidden="true" className="mx-1 text-slate-400">&bull;</span>{' '}
              Finished {formatFinished(detail.submittedAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`rounded-xl px-5 py-3 text-center ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              <div className="text-xs font-bold uppercase">Current score</div>
              <div className="text-2xl font-black">
                {score} / {detail.maxScore}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-3 hover:bg-slate-100"
              aria-label="Close"
            >
              <X />
            </button>
          </div>
        </header>
        <main className="space-y-5">
          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-xl">
            <h3 className="font-bold">Student result release</h3>
            <p className="mt-1 text-sm text-slate-600">Feedback is visible after the score is confirmed. Correct-answer visibility applies to this entire assessment.</p>
            <textarea value={teacherFeedback} onChange={event => setTeacherFeedback(event.target.value)} maxLength={5000} rows={3} placeholder="Optional feedback for this student" className="mt-4 w-full rounded-xl border border-slate-300 p-3 text-sm" />
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showCorrectAnswers} onChange={event => setShowCorrectAnswers(event.target.checked)} />Allow students to review correct answers after grading is confirmed</label>
            <Button className="mt-4" disabled={saveRelease.isPending} onClick={() => saveRelease.mutate()}>{saveRelease.isPending ? 'Saving…' : 'Save result settings'}</Button>
          </section>
          {detail.answers.map((answer) => (
            <AnswerCard
              key={answer.id}
              answer={answer}
              onUpdated={onUpdated}
              onError={onError}
            />
          ))}
        </main>
        <div className="py-6 text-center">
          <Button onClick={onClose}>Close review</Button>
        </div>
      </div>
    </div>
  );
}

function AnswerCard({
  answer,
  onUpdated,
  onError,
}: {
  answer: AnswerDetail;
  onUpdated: () => void;
  onError: () => void;
}) {
  const [points, setPoints] = useState(answer.awardedPoints ?? 0);
  useEffect(() => setPoints(answer.awardedPoints ?? 0), [answer.awardedPoints]);
  const save = useMutation({
    mutationFn: () =>
      api.post('/sessions/grades/confirm', { answerId: answer.id, points }),
    onSuccess: onUpdated,
    onError,
  });
  const q = answer.question,
    correct = (answer.awardedPoints ?? 0) === q.points;
  const expected = Array.isArray(q.correctAnswer)
    ? q.correctAnswer.map(String)
    : q.correctAnswer == null
      ? []
      : [String(q.correctAnswer)];
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white p-5 shadow-xl sm:p-6">
      <div className="flex items-start gap-4 border-b border-slate-100 pb-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-700 font-black text-white">
          {q.order}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
              {q.type.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              {q.points} points
            </span>
            {correct ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                <CheckCircle2 size={12} /> Correct
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                <XCircle size={12} /> Review
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-bold">{q.prompt}</h3>
        </div>
      </div>
      <div className="mt-5">
        {q.type === 'MULTIPLE_CHOICE' && (
          <div className="grid gap-2">
            {q.options.map((option) => {
              const selected = answer.selectedOptionIds.includes(option.id);
              return (
                <div
                  key={option.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${option.isCorrect ? 'border-emerald-300 bg-emerald-50' : selected ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                >
                  <span>{option.label}</span>
                  <span className="text-xs font-bold">
                    {option.isCorrect
                      ? 'Correct answer'
                      : selected
                        ? 'Student selected'
                        : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {q.type === 'ENUMERATION' && (
          <div className="grid gap-4 md:grid-cols-2">
            <AnswerList
              title="Student answers"
              values={parseEnumeration(answer.responseText)}
            />
            <AnswerList title="Correct answers" values={expected} />
          </div>
        )}
        {q.type === 'IDENTIFICATION' && (
          <div className="grid gap-4 md:grid-cols-2">
            <AnswerList
              title="Student answer"
              values={[answer.responseText ?? 'No answer']}
            />
            <AnswerList title="Correct answer" values={expected} />
          </div>
        )}
        {q.type === 'ESSAY' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap">
              {answer.responseText || 'No answer submitted.'}
            </div>
            {q.rubric && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <b>Rubric:</b> {q.rubric}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-end gap-2 border-t border-slate-100 pt-4">
        <label className="text-xs font-bold text-text-2">
          Awarded points
          <input
            type="number"
            min={0}
            max={q.points}
            step={1}
            value={points}
            onChange={(event) =>
              setPoints(
                Math.max(0, Math.min(q.points, Number(event.target.value)))
              )
            }
            className="ml-2 w-20 rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <Button
          disabled={save.isPending || points === answer.awardedPoints}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving...' : 'Confirm points'}
        </Button>
      </div>
    </article>
  );
}
function AnswerList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-3">
        {title}
      </h4>
      <div className="space-y-2">
        {values.length ? (
          values.map((value, index) => (
            <div
              key={`${value}-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              {index + 1}. {value}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 p-4 text-text-3">
            No answer
          </div>
        )}
      </div>
    </div>
  );
}
function DeleteModal({
  row,
  pending,
  onCancel,
  onConfirm,
}: {
  row: SubmissionRow;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600">
            <Trash2 size={21} />
          </span>
          <div>
            <h2 className="text-lg font-bold">Archive submitted exam?</h2>
            <p className="mt-2 text-sm leading-6 text-text-2">
              Remove <b>{row.session.student.fullName}'s</b> submission for{' '}
              <b>{row.session.exam.title}</b> from this page? The record remains
              protected for audit and the student cannot retake the completed
              exam.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Archiving...' : 'Archive submission'}
          </Button>
        </div>
      </section>
    </div>
  );
}
