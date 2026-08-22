import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Subject = {
  id: string;
  code: string;
  subjectCode: string;
  name: string;
  schedule: string;
  _count: { enrollments: number; exams: number };
};
type Request = {
  id: string;
  subject: { name: string };
  student: {
    fullName: string;
    email?: string;
    studentProfile?: { studentId?: string };
  };
};
type Enrollment = { enrolledAt:string; student:{ id:string; fullName:string; email?:string; studentProfile?:{studentId?:string;yearLevel?:string;program?:string} } };
type QType = 'MULTIPLE_CHOICE' | 'ENUMERATION' | 'IDENTIFICATION' | 'ESSAY';
type Question = {
  type: QType;
  prompt: string;
  points: number;
  isRequired: boolean;
  answers: string[];
  rubric: string;
  options: { label: string; isCorrect: boolean }[];
};
const input =
  'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand';
const blank = (type: QType = 'MULTIPLE_CHOICE'): Question => ({
  type,
  prompt: '',
  points: 1,
  isRequired: true,
  answers: [''],
  rubric: '',
  options: [
    { label: '', isCorrect: true },
    { label: '', isCorrect: false },
  ],
});
const displayName = (fullName:string) => { const parts=fullName.trim().split(/\s+/); const last=parts.pop() ?? ''; return parts.length ? `${last}, ${parts.join(' ')}` : last; };
const enrollmentDate = (value:string) => new Intl.DateTimeFormat('en-US',{month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(value)).replace(/^(.*?,\s\d{4}),\s/, '$1 - ');

export default function Classes() {
  const qc = useQueryClient(),
    [subjectForm, setSubjectForm] = useState({ subjectCode: '', name: '', schedule: '' }),
    [editing, setEditing] = useState<Subject>(),
    [deleting, setDeleting] = useState<Subject>(),
    [rosterSubject, setRosterSubject] = useState<Subject>(),
    [notice, setNotice] = useState(''),
    [active, setActive] = useState<{
      subject: Subject;
      kind: 'EXAM' | 'QUIZ';
    }>(),
    [mode, setMode] = useState<'manual' | 'file' | 'google'>('manual'),
    [source, setSource] = useState(''),
    [sourceFile, setSourceFile] = useState<File>(),
    [draftGenerated, setDraftGenerated] = useState(false),
    [counts, setCounts] = useState<Record<QType, number>>({
      MULTIPLE_CHOICE: 0,
      ENUMERATION: 0,
      IDENTIFICATION: 0,
      ESSAY: 0,
    }),
    [form, setForm] = useState({
      title: '',
      instructions: '',
      durationMinutes: 60,
      scheduledAt: '',
      endsAt: '',
      requireCamera: false,
      requireMicrophone: false,
      blockThirdPartyApps: true,
    }),
    [questions, setQuestions] = useState<Question[]>([blank()]);
  const noticeIsError = /could not|cannot|check|enter|choose|set at least|complete the|need|invalid|required|declined|failed|error|unsupported|exceed|unavailable|rate limit/i.test(notice);
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Subject[]>('/subjects/mine')).data,
  });
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const requests = useQuery({
    queryKey: ['join-requests'],
    queryFn: async () =>
      (await api.get<Request[]>('/subjects/join-requests/pending')).data,
  });
  const roster = useQuery({ queryKey:['subject-roster',rosterSubject?.id], enabled:!!rosterSubject, queryFn:async()=>(await api.get<Enrollment[]>(`/subjects/${rosterSubject!.id}/students`)).data });
  const createSubject = useMutation({
    mutationFn: () => api.post<Subject>('/subjects', subjectForm),
    onSuccess: ({ data }) => {
      setSubjectForm({ subjectCode: '', name: '', schedule: '' });
      setNotice(`Subject created. Share join code ${data.code}.`);
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () => setNotice('Could not create subject.'),
  });
  const updateSubject = useMutation({
    mutationFn: (value: Subject) => api.patch(`/subjects/${value.id}`, { subjectCode: value.subjectCode, name: value.name, schedule: value.schedule }),
    onSuccess: () => { setEditing(undefined); setNotice('Subject updated successfully.'); void qc.invalidateQueries({ queryKey: ['subjects'] }); },
    onError: () => setNotice('Could not update the subject. Check that the subject code is unique.'),
  });
  const deleteSubject = useMutation({
    mutationFn: (id: string) => api.delete(`/subjects/${id}`),
    onSuccess: () => { setDeleting(undefined); setNotice('Subject deleted successfully.'); void qc.invalidateQueries({ queryKey: ['subjects'] }); },
    onError: () => setNotice('Could not delete the subject.'),
  });
  const review = useMutation({
    mutationFn: (v: { id: string; status: 'APPROVED' | 'DECLINED' }) =>
      api.post(`/subjects/join-requests/${v.id}/review`, { status: v.status }),
    onSuccess: (_data, variables) => {
      setNotice(`Student request ${variables.status === 'APPROVED' ? 'approved' : 'declined'} successfully.`);
      void qc.invalidateQueries({ queryKey: ['join-requests'] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () => setNotice('Could not review request.'),
  });
  const close = () => {
    setActive(undefined);
    setMode('manual');
    setSource('');
    setSourceFile(undefined);
    setDraftGenerated(false);
    setForm({
      title: '',
      instructions: '',
      durationMinutes: 60,
      scheduledAt: '',
      endsAt: '',
      requireCamera: false,
      requireMicrophone: false,
      blockThirdPartyApps: true,
    });
    setQuestions([blank()]);
  };
  const save = useMutation({
    mutationFn: () =>
      api.post(`/subjects/${active!.subject.id}/exams`, {
        assessmentType: active!.kind,
        title: mode === 'google' ? `${active!.kind === 'QUIZ' ? 'Quiz' : 'Exam'} Google Form` : form.title.trim(),
        instructions: form.instructions.trim(),
        durationMinutes: form.scheduledAt && form.endsAt ? Math.max(1, Math.round((new Date(form.endsAt).getTime() - new Date(form.scheduledAt).getTime()) / 60000)) : form.durationMinutes,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        sourceType: mode === 'google' ? 'GOOGLE_FORMS_IMPORT' : mode === 'file' ? 'AI_GENERATED' : 'MANUAL',
        externalFormUrl: mode === 'google' ? source.trim() : undefined,
        requireCamera: form.requireCamera,
        requireMicrophone: form.requireMicrophone,
        appPolicyMode: 'BLACKLIST',
        appPolicyList: form.blockThirdPartyApps ? ['*'] : [],
        questions: mode === 'google' ? undefined : questions.map((q) => ({
          type: q.type,
          prompt: q.prompt.trim(),
          points: q.points,
          isRequired: q.isRequired,
          correctAnswer:
            q.type === 'ENUMERATION'
              ? JSON.stringify(q.answers.filter(Boolean))
              : q.type === 'IDENTIFICATION'
                ? q.answers[0]
                : undefined,
          rubric: q.type === 'ESSAY' ? q.rubric : undefined,
          options: q.type === 'MULTIPLE_CHOICE' ? q.options : undefined,
        })),
      }),
    onSuccess: () => {
      setNotice(`${active?.kind === 'QUIZ' ? 'Quiz' : 'Exam'} saved and published.`);
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      close();
    },
    onError: () =>
      setNotice('Could not save. Check every question and answer.'),
  });
  const patchQ = (i: number, p: Partial<Question>) =>
    setQuestions((v) => v.map((q, n) => (n === i ? { ...q, ...p } : q)));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'google') { if (!source.trim()) return setNotice('Enter the Google Form link.'); return save.mutate(); }
    if (!form.scheduledAt || !form.endsAt || new Date(form.endsAt) <= new Date(form.scheduledAt)) return setNotice('Choose a valid start and end date/time.');
    if (mode === 'file' && !draftGenerated) return setNotice('Generate the review draft first.');
    if (
      !form.title.trim() ||
      form.durationMinutes < 1 ||
      questions.some((q) => !q.prompt.trim())
    )
      return setNotice('Complete the title, duration, and every question.');
    if (
      questions.some(
        (q) =>
          q.type === 'MULTIPLE_CHOICE' &&
          (q.options.length < 2 ||
            q.options.some((o) => !o.label.trim()) ||
            !q.options.some((o) => o.isCorrect))
      )
    )
      return setNotice(
        'Multiple-choice items need two choices and a correct answer.'
      );
    if (
      questions.some(
        (q) =>
          (q.type === 'ENUMERATION' || q.type === 'IDENTIFICATION') &&
          !q.answers.some(Boolean)
      )
    )
      return setNotice(
        'Add correct answers for enumeration and identification items.'
      );
    save.mutate();
  };
  const generateDraft = useMutation({
    mutationFn: async () => {
      if (!sourceFile) throw new Error('Choose a PPT/PDF file first.');
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      if (!total) throw new Error('Set at least one question count.');
      const data = new FormData();
      data.append('file', sourceFile);
      data.append('counts', JSON.stringify(counts));
      return (await api.post<{ questions: Question[] }>(`/subjects/${active!.subject.id}/questions/generate`, data)).data;
    },
    onSuccess: ({ questions: generated }) => {
      setQuestions(generated.map((q) => ({ ...q, answers: q.answers ?? [], options: q.options ?? [], rubric: q.rubric ?? '' })));
      setDraftGenerated(true);
      setNotice('Draft generated. Review and edit all AI-suggested questions and answers before saving.');
    },
    onError: (error: any) => {
      setDraftGenerated(false);
      setNotice(error?.response?.data?.message || error?.message || 'Could not generate questions from this document.');
    },
  });
  return (
    <DashboardLayout role="teacher" pageTitle="Subjects & Exam Builder">
      {notice && (
        <div
          role="status"
          className={`fixed right-5 top-5 z-[80] flex max-w-md gap-5 rounded-xl border p-4 text-sm font-medium shadow-raised ${noticeIsError ? 'border-risk-high/30 bg-red-50 text-risk-high' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}
        >
          {notice}
          <button onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader
            title="Create Subject"
            subtitle="A student join code is generated automatically."
          />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              subjectForm.subjectCode.trim() && subjectForm.name.trim() && subjectForm.schedule.trim()
                ? createSubject.mutate()
                : setNotice('Enter the subject code, name, and schedule.');
            }}
          >
            <input
              className={input}
              maxLength={30}
              value={subjectForm.subjectCode}
              onChange={(e) => setSubjectForm({ ...subjectForm, subjectCode: e.target.value.toUpperCase() })}
              placeholder="Subject code (e.g. CS101)"
            />
            <input
              className={input}
              maxLength={150}
              value={subjectForm.name}
              onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
              placeholder="Subject name"
            />
            <input className={input} maxLength={150} value={subjectForm.schedule} onChange={(e) => setSubjectForm({ ...subjectForm, schedule: e.target.value })} placeholder="Schedule (e.g. MWF 9:00–10:00 AM)" />
            <Button
              className="w-full"
              icon={Plus}
              disabled={createSubject.isPending}
            >
              Create subject
            </Button>
          </form>
        </Card>
        <Card padded={false}>
          <div className="p-6">
            <CardHeader
              title="My Subjects"
              subtitle="Create an assessment directly from any subject."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
                <tr>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Join code</th>
                  <th className="p-4">Students</th>
                  <th className="p-4">Assessments</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.data?.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-4 font-semibold">
                      {s.subjectCode} - {s.name} | {s.schedule}
                    </td>
                    <td className="p-4">
                      <span className="rounded bg-brand-soft px-2 py-1 font-mono font-bold text-brand">
                        {s.code}
                      </span>
                      <button
                        className="ml-2"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.code);
                          setNotice('Join code copied.');
                        }}
                      >
                        <Copy size={14} />
                      </button>
                    </td>
                    <td className="p-4"><Button variant="ghost" onClick={()=>setRosterSubject(s)}>{s._count.enrollments} {s._count.enrollments === 1 ? 'student' : 'students'}</Button></td>
                    <td className="p-4">{s._count.exams}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          onClick={() =>
                            setActive({ subject: s, kind: 'EXAM' })
                          }
                        >
                          Create Exam/Quiz
                        </Button>
                        <Button variant="ghost" icon={Pencil} aria-label={`Edit ${s.name}`} title="Edit subject" onClick={() => setEditing({ ...s })} />
                        <Button variant="danger" icon={Trash2} aria-label={`Delete ${s.name}`} title="Delete subject" onClick={() => setDeleting(s)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!subjects.isLoading && !subjects.data?.length && (
            <p className="p-6 text-sm text-text-2">No subjects created yet.</p>
          )}
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader
          title={`Join Requests${requests.data?.length ? ` (${requests.data.length})` : ''}`}
          subtitle="Approve only verified, officially registered students."
        />
        {!requests.data?.length ? (
          <p className="text-sm text-text-2">No pending requests.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {requests.data.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-border p-4"
              >
                <div className="min-w-0 flex-1">
                  <b>{r.student.fullName}</b>
                  <div className="truncate text-xs text-text-2">
                    {r.student.studentProfile?.studentId ||
                      r.student.email ||
                      'No student ID'}{' '}
                    · {r.subject.name}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  icon={X}
                  onClick={() =>
                    review.mutate({ id: r.id, status: 'DECLINED' })
                  }
                >
                  Decline
                </Button>
                <Button
                  icon={Check}
                  onClick={() =>
                    review.mutate({ id: r.id, status: 'APPROVED' })
                  }
                >
                  Approve
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {active && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 sm:p-8">
          <div className="mx-auto max-w-5xl rounded-[18px] bg-surface p-6 shadow-2xl">
            <div className="mb-5 flex justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  Create {active.kind === 'QUIZ' ? 'Quiz' : 'Exam'}
                </h2>
                <p className="text-sm text-text-2">
                  {active.subject.name} · {questions.length} items
                </p>
              </div>
              <button onClick={close}>
                <X />
              </button>
            </div>
            <div className="mb-5 flex flex-wrap gap-2">
              {(['manual', 'file', 'google'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mode === m ? 'primary' : 'ghost'}
                  onClick={() => setMode(m)}
                >
                  {m === 'manual'
                    ? 'Manual'
                    : m === 'file'
                      ? 'Generate from PPT/PDF'
                      : 'Import / Embed Google Form'}
                </Button>
              ))}
            </div>
            {mode === 'file' && (
              <div className="mb-5 rounded-xl border border-brand/20 bg-brand-soft p-4">
                  <input
                    type="file"
                    accept=".ppt,.pptx,.pdf"
                    onChange={(e) => {
                      setSourceFile(e.target.files?.[0]);
                      setDraftGenerated(false);
                    }}
                  />
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {(Object.keys(counts) as QType[]).map((t) => (
                    <label className="text-xs font-semibold" key={t}>
                      {t.replace('_', ' ')}
                      <input
                        className={`${input} mt-1`}
                        type="number"
                        min="0"
                        placeholder="0"
                        value={counts[t] || ''}
                        onChange={(e) =>
                          { setCounts({ ...counts, [t]: Math.max(0, +e.target.value) }); setDraftGenerated(false); }
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="my-3 text-xs">
                  AI will suggest its best answers from the source. Review and
                  edit everything before saving.
                </p>
                <Button type="button" disabled={generateDraft.isPending} onClick={() => generateDraft.mutate()}>
                  {generateDraft.isPending ? 'Reading file and generating…' : 'Generate review draft'}
                </Button>
              </div>
            )}
            {mode === 'google' ? <form className="space-y-4 rounded-xl border border-border p-5" onSubmit={submit}><label className="block text-sm font-semibold">Google Form link<input className={`${input} mt-2`} type="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://docs.google.com/forms/..." /></label><div className="flex justify-end"><Button disabled={save.isPending}>Save</Button></div></form> : <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  className={`${input} md:col-span-2`}
                  maxLength={200}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Title"
                />
                <label className="text-xs font-semibold">
                  Start date and time
                  <input
                    className={`${input} mt-1`}
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-xs font-semibold">End date and time<input className={`${input} mt-1`} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
              <textarea
                className={input}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
                placeholder="Instructions"
              />
              {mode === 'manual' && <div className="flex flex-wrap gap-5 text-sm">
                {(
                  [
                    ['requireCamera', 'Require camera'],
                    ['requireMicrophone', 'Require microphone'],
                    ['blockThirdPartyApps', 'Block third-party apps'],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k}>
                    <input
                      className="mr-2"
                      type="checkbox"
                      checked={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.checked })
                      }
                    />
                    {l}
                  </label>
                ))}
              </div>}
              {(mode === 'manual' || draftGenerated) && questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <b>{i + 1}.</b>
                    <select
                      className="rounded border border-border p-2"
                      value={q.type}
                      onChange={(e) =>
                        patchQ(i, {
                          type: e.target.value as QType,
                          answers: [''],
                          options: blank().options,
                        })
                      }
                    >
                      {(
                        [
                          'MULTIPLE_CHOICE',
                          'ENUMERATION',
                          'IDENTIFICATION',
                          'ESSAY',
                        ] as QType[]
                      ).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      className="w-16 rounded border p-2"
                      type="number"
                      min="1"
                      value={q.points}
                      onChange={(e) => patchQ(i, { points: +e.target.value })}
                    />
                    <label className="ml-auto text-sm">
                      <input
                        className="mr-2"
                        type="checkbox"
                        checked={q.isRequired}
                        onChange={(e) =>
                          patchQ(i, { isRequired: e.target.checked })
                        }
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      disabled={questions.length === 1}
                      onClick={() =>
                        setQuestions((v) => v.filter((_, n) => n !== i))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <textarea
                    className={input}
                    value={q.prompt}
                    onChange={(e) => patchQ(i, { prompt: e.target.value })}
                    placeholder="Question"
                  />
                  {q.type === 'MULTIPLE_CHOICE' && (
                    <div className="mt-3 space-y-2">
                      {q.options.map((o, n) => (
                        <div className="flex gap-2" key={n}>
                          <input
                            type="radio"
                            name={`correct-${i}`}
                            checked={o.isCorrect}
                            onChange={() =>
                              patchQ(i, {
                                options: q.options.map((x, j) => ({
                                  ...x,
                                  isCorrect: j === n,
                                })),
                              })
                            }
                          />
                          <input
                            className={input}
                            value={o.label}
                            onChange={(e) =>
                              patchQ(i, {
                                options: q.options.map((x, j) =>
                                  j === n ? { ...x, label: e.target.value } : x
                                ),
                              })
                            }
                            placeholder={`Choice ${n + 1}`}
                          />
                          <button
                            type="button"
                            disabled={q.options.length <= 2}
                            onClick={() =>
                              patchQ(i, {
                                options: q.options.filter((_, j) => j !== n),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Plus}
                        onClick={() =>
                          patchQ(i, {
                            options: [
                              ...q.options,
                              { label: '', isCorrect: false },
                            ],
                          })
                        }
                      >
                        Add choice
                      </Button>
                    </div>
                  )}
                  {q.type === 'ENUMERATION' && (
                    <div className="mt-3 space-y-2">
                      {q.answers.map((a, n) => (
                        <div className="flex gap-2" key={n}>
                          <input
                            className={input}
                            value={a}
                            onChange={(e) =>
                              patchQ(i, {
                                answers: q.answers.map((x, j) =>
                                  j === n ? e.target.value : x
                                ),
                              })
                            }
                            placeholder={`Accepted answer ${n + 1}`}
                          />
                          <button
                            type="button"
                            disabled={q.answers.length === 1}
                            onClick={() =>
                              patchQ(i, {
                                answers: q.answers.filter((_, j) => j !== n),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Plus}
                        onClick={() =>
                          patchQ(i, { answers: [...q.answers, ''] })
                        }
                      >
                        Add answer blank
                      </Button>
                    </div>
                  )}
                  {q.type === 'IDENTIFICATION' && (
                    <input
                      className={`${input} mt-3`}
                      value={q.answers[0]}
                      onChange={(e) => patchQ(i, { answers: [e.target.value] })}
                      placeholder="Correct answer"
                    />
                  )}
                  {q.type === 'ESSAY' && (
                    <textarea
                      className={`${input} mt-3`}
                      value={q.rubric}
                      onChange={(e) => patchQ(i, { rubric: e.target.value })}
                      placeholder="Rubric / guidance"
                    />
                  )}
                </div>
              ))}
              <div className="flex justify-between">
                {mode === 'manual' || draftGenerated ?
                <Button
                  type="button"
                  variant="ghost"
                  icon={Plus}
                  onClick={() => setQuestions((v) => [...v, blank()])}
                >
                  Add question
                </Button> : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button disabled={save.isPending}>
                  Save and publish {active.kind.toLowerCase()}
                  </Button>
                </div>
              </div>
            </form>}
          </div>
        </div>
      )}
      {editing && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><Card className="w-full max-w-md"><CardHeader title="Edit Subject" subtitle="Update the subject details shown to students."/><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); updateSubject.mutate(editing); }}><input className={input} value={editing.subjectCode} onChange={(e) => setEditing({ ...editing, subjectCode: e.target.value.toUpperCase() })} placeholder="Subject code"/><input className={input} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Subject name"/><input className={input} value={editing.schedule} onChange={(e) => setEditing({ ...editing, schedule: e.target.value })} placeholder="Schedule"/><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button><Button disabled={updateSubject.isPending}>Save changes</Button></div></form></Card></div>}
      {deleting && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><Card className="w-full max-w-md"><CardHeader title="Delete Subject" subtitle="This also deletes its exams, enrollments, requests, sessions, and submissions."/><p className="mb-5 text-sm">Are you sure you want to delete <b>{deleting.subjectCode} — {deleting.name}</b>? This cannot be undone.</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(undefined)}>Cancel</Button><Button variant="danger" disabled={deleteSubject.isPending} onClick={() => deleteSubject.mutate(deleting.id)}>{deleteSubject.isPending ? 'Deleting…' : 'Delete subject'}</Button></div></Card></div>}
      {rosterSubject && <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4"><Card className="w-full max-w-5xl"><CardHeader title={`Enrolled Students — ${rosterSubject.subjectCode}`} subtitle={`${rosterSubject.name} | ${rosterSubject.schedule}`}/><div className="max-h-[65vh] overflow-auto rounded-xl border border-border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-surface-2 text-xs uppercase text-text-3"><tr><th className="p-3">Student ID</th><th className="p-3">Full name</th><th className="p-3">Year level</th><th className="p-3">Program</th><th className="p-3">Enrolled at</th></tr></thead><tbody>{roster.data?.map(row=><tr key={row.student.id} className="border-t border-border"><td className="p-3">{row.student.studentProfile?.studentId || '—'}</td><td className="p-3 font-medium">{displayName(row.student.fullName)}</td><td className="p-3">{row.student.studentProfile?.yearLevel?.replace('YEAR_','Year ') || '—'}</td><td className="p-3">{row.student.studentProfile?.program || '—'}</td><td className="p-3 whitespace-nowrap">{enrollmentDate(row.enrolledAt)}</td></tr>)}</tbody></table>{roster.isLoading&&<p className="p-5 text-sm text-text-2">Loading students…</p>}{!roster.isLoading&&!roster.data?.length&&<p className="p-5 text-sm text-text-2">No students are enrolled in this subject.</p>}</div><div className="mt-5 flex justify-end"><Button onClick={()=>setRosterSubject(undefined)}>Close</Button></div></Card></div>}
    </DashboardLayout>
  );
}
