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
  exams: {
    id: string;
    title: string;
    version: number;
    assessmentType: 'EXAM' | 'QUIZ';
    term: 'UNSPECIFIED' | 'PRELIMINARY' | 'MIDTERM' | 'SEMI_FINAL' | 'FINAL';
    academicPeriod: { academicYear: string; semester: 'FIRST' | 'SECOND' };
    scheduledAt: string | null;
    endsAt: string | null;
  }[];
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
type Enrollment = {
  enrolledAt: string;
  assessmentStatus: 'TAKEN' | 'NOT_TAKEN';
  student: {
    id: string;
    fullName: string;
    email?: string;
    studentProfile?: {
      studentId?: string;
      yearLevel?: string;
      program?: string;
      section?: { id: string; name: string };
    };
  };
};
type AcademicPeriod = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
  status: 'ACTIVE' | 'CLOSED';
};
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
const localDateTimeValue = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const displayName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  const last = parts.pop() ?? '';
  return parts.length ? `${last}, ${parts.join(' ')}` : last;
};
const enrollmentDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
    .format(new Date(value))
    .replace(/^(.*?,\s\d{4}),\s/, '$1 - ');

export default function Classes() {
  const qc = useQueryClient(),
    [subjectForm, setSubjectForm] = useState({
      subjectCode: '',
      name: '',
      schedule: '',
    }),
    [editing, setEditing] = useState<Subject>(),
    [deleting, setDeleting] = useState<Subject>(),
    [stopping, setStopping] = useState<Subject>(),
    [rosterSubject, setRosterSubject] = useState<Subject>(),
    [removingStudent, setRemovingStudent] = useState<Enrollment>(),
    [notice, setNotice] = useState(''),
    [academicPeriodId, setAcademicPeriodId] = useState(''),
    [term, setTerm] = useState(''),
    [active, setActive] = useState<{
      subject: Subject;
      kind: 'EXAM' | 'QUIZ';
    }>(),
    [mode, setMode] = useState<'manual' | 'file' | 'google'>('manual'),
    [source, setSource] = useState(''),
    [sourceFile, setSourceFile] = useState<File>(),
    [draftGenerated, setDraftGenerated] = useState(false),
    [sourceExamId, setSourceExamId] = useState(''),
    [previousExamId, setPreviousExamId] = useState(''),
    [selectedBankIds, setSelectedBankIds] = useState<string[]>([]),
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
      randomizeQuestions: false,
      randomizeOptions: false,
    }),
    [questions, setQuestions] = useState<Question[]>([blank()]);
  const [assessmentClock, setAssessmentClock] = useState(() => Date.now());
  const [rescheduling, setRescheduling] = useState<{
    subject: Subject;
    exam: Subject['exams'][number];
    scheduledAt: string;
    endsAt: string;
  }>();
  const noticeIsError =
    /could not|cannot|check|enter|choose|set at least|complete the|need|invalid|required|declined|failed|error|unsupported|exceed|unavailable|rate limit/i.test(
      notice
    );
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Subject[]>('/subjects/mine')).data,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });
  const currentExamFor = (subject: Subject) =>
    subject.exams.find(
      (exam) =>
        !exam.endsAt || new Date(exam.endsAt).getTime() > assessmentClock
    );
  const assessmentStateFor = (subject: Subject) => {
    const exam = currentExamFor(subject);
    if (!exam) return 'INACTIVE' as const;
    if (
      exam.scheduledAt &&
      new Date(exam.scheduledAt).getTime() > assessmentClock
    )
      return 'PENDING' as const;
    return 'ACTIVE' as const;
  };
  useEffect(() => {
    const transitions =
      subjects.data
        ?.flatMap((subject) => subject.exams)
        .flatMap((exam) => [exam.scheduledAt, exam.endsAt])
        .map((value) => (value ? new Date(value).getTime() : NaN))
        .filter(
          (transition) => Number.isFinite(transition) && transition > Date.now()
        ) ?? [];
    if (!transitions.length) return;
    const nextTransition = Math.min(...transitions);
    const timer = window.setTimeout(
      () => {
        setAssessmentClock(Date.now());
        setStopping(undefined);
        void qc.invalidateQueries({ queryKey: ['subjects'] });
      },
      Math.max(0, nextTransition - Date.now() + 100)
    );
    return () => window.clearTimeout(timer);
  }, [subjects.data, qc, assessmentClock]);

  const periods = useQuery({
    queryKey: ['academic-periods'],
    queryFn: async () =>
      (await api.get<AcademicPeriod[]>('/academic-periods')).data,
  });
  const activePeriods =
    periods.data?.filter((period) => period.status === 'ACTIVE') ?? [];
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
  const roster = useQuery({
    queryKey: ['classes-subject-roster', rosterSubject?.id],
    enabled: !!rosterSubject,
    queryFn: async () => {
      const rows = (
        await api.get<Enrollment[]>(`/subjects/${rosterSubject!.id}/students`)
      ).data;
      return rows.filter((row): row is Enrollment => Boolean(row?.student?.id));
    },
  });
  const bankItems = useQuery({
    queryKey: ['question-bank-builder', active?.subject.id],
    enabled: Boolean(active),
    queryFn: async () =>
      (
        await api.get<any[]>('/subjects/question-bank', {
          params: { includeGrouped: 'true' },
        })
      ).data,
  });
  const previousExams = useQuery({
    queryKey: ['previous-exams', active?.subject.id],
    enabled: Boolean(active),
    queryFn: async () =>
      (await api.get<any[]>('/subjects/' + active!.subject.id + '/exams')).data,
  });
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
    mutationFn: (value: Subject) =>
      api.patch(`/subjects/${value.id}`, {
        subjectCode: value.subjectCode,
        name: value.name,
        schedule: value.schedule,
      }),
    onSuccess: () => {
      setEditing(undefined);
      setNotice('Subject updated successfully.');
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () =>
      setNotice(
        'Could not update the subject. Check that the subject code is unique.'
      ),
  });
  const deleteSubject = useMutation({
    mutationFn: (id: string) => api.delete(`/subjects/${id}`),
    onSuccess: () => {
      setDeleting(undefined);
      setNotice('Subject deleted successfully.');
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () => setNotice('Could not delete the subject.'),
  });
  const removeStudent = useMutation({
    mutationFn: ({
      subjectId,
      studentId,
    }: {
      subjectId: string;
      studentId: string;
    }) => api.delete(`/subjects/${subjectId}/students/${studentId}`),
    onSuccess: () => {
      setRemovingStudent(undefined);
      setNotice('Student removed from the subject successfully.');
      void qc.invalidateQueries({
        queryKey: ['classes-subject-roster', rosterSubject?.id],
      });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () => setNotice('Could not remove the student from the subject.'),
  });
  const stopExam = useMutation({
    mutationFn: (subject: Subject) =>
      api.post(
        `/subjects/${subject.id}/exams/${currentExamFor(subject)!.id}/stop`
      ),
    onSuccess: (_response, subject) => {
      const wasPending = assessmentStateFor(subject) === 'PENDING';
      setStopping(undefined);
      setNotice(
        wasPending
          ? 'Scheduled exam/quiz cancelled. You can now create a new one.'
          : 'Exam/Quiz stopped successfully. You can now create a new one.'
      );
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: () => setNotice('Could not stop the exam/quiz.'),
  });
  const updateSchedule = useMutation({
    mutationFn: () =>
      api.patch(
        `/subjects/${rescheduling!.subject.id}/exams/${rescheduling!.exam.id}/schedule`,
        {
          scheduledAt: new Date(rescheduling!.scheduledAt).toISOString(),
          endsAt: new Date(rescheduling!.endsAt).toISOString(),
        }
      ),
    onSuccess: () => {
      setAssessmentClock(Date.now());
      setNotice(
        'Assessment schedule updated. Enrolled students were notified.'
      );
      setRescheduling(undefined);
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
    onError: (error: any) =>
      setNotice(
        error?.response?.data?.message ??
          'Could not update the assessment schedule.'
      ),
  });
  const review = useMutation({
    mutationFn: (v: { id: string; status: 'APPROVED' | 'DECLINED' }) =>
      api.post(`/subjects/join-requests/${v.id}/review`, { status: v.status }),
    onSuccess: (_data, variables) => {
      setNotice(
        `Student request ${variables.status === 'APPROVED' ? 'approved' : 'declined'} successfully.`
      );
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
    setSourceExamId('');
    setPreviousExamId('');
    setSelectedBankIds([]);
    setAcademicPeriodId('');
    setTerm('');
    setForm({
      title: '',
      instructions: '',
      durationMinutes: 60,
      scheduledAt: '',
      endsAt: '',
      requireCamera: false,
      requireMicrophone: false,
      blockThirdPartyApps: true,
      randomizeQuestions: false,
      randomizeOptions: false,
    });
    setQuestions([blank()]);
  };
  const save = useMutation({
    mutationFn: () =>
      api.post(`/subjects/${active!.subject.id}/exams`, {
        academicPeriodId,
        term,
        assessmentType: active!.kind,
        title:
          mode === 'google'
            ? `${active!.kind === 'QUIZ' ? 'Quiz' : 'Exam'} Google Form`
            : form.title.trim(),
        instructions: form.instructions.trim(),
        durationMinutes:
          form.scheduledAt && form.endsAt
            ? Math.max(
                1,
                Math.round(
                  (new Date(form.endsAt).getTime() -
                    new Date(form.scheduledAt).getTime()) /
                    60000
                )
              )
            : form.durationMinutes,
        scheduledAt: form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        sourceType:
          mode === 'google'
            ? 'GOOGLE_FORMS_IMPORT'
            : mode === 'file'
              ? 'AI_GENERATED'
              : 'MANUAL',
        externalFormUrl: mode === 'google' ? source.trim() : undefined,
        sourceExamId: sourceExamId || undefined,
        randomizeQuestions: form.randomizeQuestions,
        randomizeOptions: form.randomizeOptions,
        requireCamera: form.requireCamera,
        requireMicrophone: form.requireMicrophone,
        appPolicyMode: 'BLACKLIST',
        appPolicyList: form.blockThirdPartyApps ? ['*'] : [],
        questions:
          mode === 'google'
            ? undefined
            : questions.map((q) => ({
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
      setNotice(
        `${active?.kind === 'QUIZ' ? 'Quiz' : 'Exam'} saved and published.`
      );
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      close();
    },
    onError: (error: any) => {
      const responseMessage = error?.response?.data?.message;
      const detail = Array.isArray(responseMessage)
        ? responseMessage.join(' ')
        : responseMessage;
      setNotice(
        typeof detail === 'string' && detail
          ? `Could not save: ${detail}`
          : 'Could not save. Check every question and answer.'
      );
    },
  });
  const patchQ = (i: number, p: Partial<Question>) =>
    setQuestions((v) => v.map((q, n) => (n === i ? { ...q, ...p } : q)));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicPeriodId || !term)
      return setNotice('Choose an active semester and examination term.');
    if (
      !form.scheduledAt ||
      !form.endsAt ||
      new Date(form.endsAt) <= new Date(form.scheduledAt)
    )
      return setNotice('Choose a valid start and end date/time.');
    if (mode === 'google') {
      if (!source.trim()) return setNotice('Enter the Google Form link.');
      return save.mutate();
    }
    if (mode === 'file' && !draftGenerated)
      return setNotice('Generate the review draft first.');
    if (
      !form.title.trim() ||
      form.durationMinutes < 1 ||
      questions.some(
        (q) => !q.prompt.trim() || !Number.isInteger(q.points) || q.points < 1
      )
    )
      return setNotice(
        'Complete the title and every question, using at least 1 point per item.'
      );
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
      const total = Object.values(counts).reduce(
        (sum, value) => sum + value,
        0
      );
      if (!total) throw new Error('Set at least one question count.');
      const data = new FormData();
      data.append('file', sourceFile);
      data.append('counts', JSON.stringify(counts));
      return (
        await api.post<{ questions: Question[] }>(
          `/subjects/${active!.subject.id}/questions/generate`,
          data
        )
      ).data;
    },
    onSuccess: ({ questions: generated }) => {
      setQuestions(
        generated.map((q) => ({
          ...q,
          answers: q.answers ?? [],
          options: q.options ?? [],
          rubric: q.rubric ?? '',
        }))
      );
      setDraftGenerated(true);
      setNotice(
        'Draft generated. Review and edit all AI-suggested questions and answers before saving.'
      );
    },
    onError: (error: any) => {
      setDraftGenerated(false);
      setNotice(
        error?.response?.data?.message ||
          error?.message ||
          'Could not generate questions from this document.'
      );
    },
  });
  const loadPreviousExam = useMutation({
    mutationFn: async () =>
      (
        await api.get<any>(
          '/subjects/' +
            active!.subject.id +
            '/exams/' +
            previousExamId +
            '/copy'
        )
      ).data,
    onSuccess: (exam) => {
      setSourceExamId(exam.id);
      setForm((current) => ({
        ...current,
        title: exam.title + ' (Revised)',
        instructions: exam.instructions ?? '',
        durationMinutes: exam.durationMinutes,
        requireCamera: exam.requireCamera,
        requireMicrophone: exam.requireMicrophone,
        randomizeQuestions: exam.randomizeQuestions,
        randomizeOptions: exam.randomizeOptions,
      }));
      setQuestions(
        exam.questions.map((question: any) => ({
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          isRequired: question.isRequired,
          answers: Array.isArray(question.correctAnswer)
            ? question.correctAnswer.map(String)
            : [String(question.correctAnswer ?? '')],
          rubric: question.rubric ?? '',
          options: question.options.map((option: any) => ({
            label: option.label,
            isCorrect: option.isCorrect,
          })),
        }))
      );
      setMode('manual');
      setNotice(
        'Previous exam loaded as a new immutable version. Review it before publishing.'
      );
    },
    onError: () => setNotice('Could not load the previous exam.'),
  });
  const addBankQuestions = () => {
    const selected = (bankItems.data ?? []).filter((item) =>
      selectedBankIds.includes(item.id)
    );
    if (!selected.length)
      return setNotice('Select at least one bank question.');
    const mapped = selected.map((item) => ({
      type: item.type as QType,
      prompt: item.prompt,
      points: item.points,
      isRequired: item.isRequired,
      answers: Array.isArray(item.correctAnswer)
        ? item.correctAnswer.map(String)
        : [String(item.correctAnswer ?? '')],
      rubric: item.rubric ?? '',
      options: (item.options ?? []).map((option: any) => ({
        label: option.label,
        isCorrect: option.isCorrect,
      })),
    }));
    setQuestions((current) => {
      const useful = current.filter((question) => question.prompt.trim());
      return [...useful, ...mapped];
    });
    setSelectedBankIds([]);
    setNotice(
      String(mapped.length) + ' reusable question(s) added to this exam.'
    );
  };
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
              subjectForm.subjectCode.trim() &&
              subjectForm.name.trim() &&
              subjectForm.schedule.trim()
                ? createSubject.mutate()
                : setNotice('Enter the subject code, name, and schedule.');
            }}
          >
            <input
              className={input}
              maxLength={30}
              value={subjectForm.subjectCode}
              onChange={(e) =>
                setSubjectForm({
                  ...subjectForm,
                  subjectCode: e.target.value.toUpperCase(),
                })
              }
              placeholder="Subject code (e.g. CS101)"
            />
            <input
              className={input}
              maxLength={150}
              value={subjectForm.name}
              onChange={(e) =>
                setSubjectForm({ ...subjectForm, name: e.target.value })
              }
              placeholder="Subject name"
            />
            <input
              className={input}
              maxLength={150}
              value={subjectForm.schedule}
              onChange={(e) =>
                setSubjectForm({ ...subjectForm, schedule: e.target.value })
              }
              placeholder="Schedule (e.g. MWF 9:00–10:00 AM)"
            />
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
                  <th className="p-4">Status</th>
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
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        onClick={() => setRosterSubject(s)}
                      >
                        {s._count.enrollments}{' '}
                        {s._count.enrollments === 1 ? 'student' : 'students'}
                      </Button>
                    </td>
                    <td className="p-4">{s._count.exams}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          assessmentStateFor(s) === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : assessmentStateFor(s) === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {currentExamFor(s)
                          ? `${assessmentStateFor(s) === 'PENDING' ? 'Pending' : 'Active'} · ${currentExamFor(s)!.term.replace('_', ' ')} · v${currentExamFor(s)!.version}`
                          : 'Not Active'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {currentExamFor(s) ? (
                          <>
                            <Button
                              variant="ghost"
                              icon={Pencil}
                              onClick={() => {
                                const exam = currentExamFor(s)!;
                                setRescheduling({
                                  subject: s,
                                  exam,
                                  scheduledAt: localDateTimeValue(
                                    exam.scheduledAt
                                  ),
                                  endsAt: localDateTimeValue(exam.endsAt),
                                });
                              }}
                            >
                              Reschedule
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => setStopping(s)}
                            >
                              {assessmentStateFor(s) === 'PENDING'
                                ? 'Cancel'
                                : 'Stop'}
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled={!activePeriods.length}
                            title={
                              !activePeriods.length
                                ? 'The Dean must create an active semester first'
                                : undefined
                            }
                            onClick={() => {
                              setAcademicPeriodId(activePeriods[0]?.id ?? '');
                              setActive({ subject: s, kind: 'EXAM' });
                            }}
                          >
                            Create Exam/Quiz
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          icon={Pencil}
                          aria-label={`Edit ${s.name}`}
                          title="Edit subject"
                          onClick={() => setEditing({ ...s })}
                        />
                        <Button
                          variant="danger"
                          icon={Trash2}
                          aria-label={`Delete ${s.name}`}
                          title="Delete subject"
                          onClick={() => setDeleting(s)}
                        />
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 sm:p-8">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[18px] bg-surface p-6 shadow-2xl sm:max-h-[calc(100dvh-4rem)]">
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
                      ? 'Generate from PPT/PDF/DOCX'
                      : 'Import / Embed Google Form'}
                </Button>
              ))}
            </div>
            {mode === 'manual' && (
              <div className="mb-5 grid items-start gap-5 rounded-xl border border-border bg-canvas p-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-bold">
                    Start from a previous exam
                  </p>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <select
                      value={previousExamId}
                      onChange={(e) => setPreviousExamId(e.target.value)}
                      className={input}
                    >
                      <option value="">Select a previous exam</option>
                      {previousExams.data?.map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title} · version {exam.version ?? 1}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      disabled={!previousExamId || loadPreviousExam.isPending}
                      onClick={() => loadPreviousExam.mutate()}
                    >
                      Load
                    </Button>
                  </div>
                  {sourceExamId && (
                    <p className="mt-2 text-xs text-brand">
                      Publishing will create the next immutable version.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-bold">
                    Add reusable bank questions
                  </p>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                    {!bankItems.data?.length && (
                      <p className="text-xs text-text-3">
                        No questions saved for this subject yet.
                      </p>
                    )}
                    {bankItems.data?.map((item) => (
                      <label
                        key={item.id}
                        className="flex gap-2 text-xs text-text-2"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBankIds.includes(item.id)}
                          onChange={(e) =>
                            setSelectedBankIds((current) =>
                              e.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id)
                            )
                          }
                        />
                        <span>
                          <b>{item.difficulty}</b> · {item.prompt}
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button
                    className="mt-2"
                    type="button"
                    variant="ghost"
                    disabled={!selectedBankIds.length}
                    onClick={addBankQuestions}
                  >
                    Add selected questions
                  </Button>
                </div>
              </div>
            )}
            {mode === 'file' && (
              <div className="mb-5 rounded-xl border border-brand/20 bg-brand-soft p-4">
                <input
                  type="file"
                  accept=".ppt,.pptx,.pdf,.docx"
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
                        onChange={(e) => {
                          setCounts({
                            ...counts,
                            [t]: Math.max(0, +e.target.value),
                          });
                          setDraftGenerated(false);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="my-3 text-xs">
                  AI will suggest its best answers from the PDF, PowerPoint, or
                  Word source. Review and edit everything before saving.
                </p>
                <Button
                  type="button"
                  disabled={generateDraft.isPending}
                  onClick={() => generateDraft.mutate()}
                >
                  {generateDraft.isPending
                    ? 'Reading file and generating…'
                    : 'Generate review draft'}
                </Button>
              </div>
            )}
            {mode === 'google' ? (
              <form
                className="space-y-4 rounded-xl border border-border p-5"
                onSubmit={submit}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Academic semester
                    <select
                      className={`${input} mt-1`}
                      value={academicPeriodId}
                      onChange={(e) => setAcademicPeriodId(e.target.value)}
                      required
                    >
                      <option value="">Select semester</option>
                      {activePeriods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.academicYear} ·{' '}
                          {period.semester === 'FIRST'
                            ? 'First Semester'
                            : 'Second Semester'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold">
                    Term
                    <select
                      className={`${input} mt-1`}
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      required
                    >
                      <option value="">Select term</option>
                      <option value="PRELIMINARY">Preliminary</option>
                      <option value="MIDTERM">Midterm</option>
                      <option value="SEMI_FINAL">Semi-final</option>
                      <option value="FINAL">Final</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-semibold">
                  Google Form link
                  <input
                    className={`${input} mt-2`}
                    type="url"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="https://docs.google.com/forms/..."
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Start date and time
                    <input
                      className={`${input} mt-1`}
                      type="datetime-local"
                      value={form.scheduledAt}
                      onChange={(e) =>
                        setForm({ ...form, scheduledAt: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    End date and time
                    <input
                      className={`${input} mt-1`}
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(e) =>
                        setForm({ ...form, endsAt: e.target.value })
                      }
                      required
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button disabled={save.isPending}>
                    {save.isPending ? 'Publishing…' : 'Save and Publish Exam'}
                  </Button>
                </div>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={submit}>
                <section className="rounded-xl border border-border p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="font-semibold text-text-1">Exam details</h3>
                    <p className="text-xs text-text-3">
                      Set the exam identity, semester, and availability period.
                    </p>
                  </div>
                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <label className="block min-w-0 text-xs font-semibold">
                      Academic semester
                      <select
                        className={`${input} mt-1`}
                        value={academicPeriodId}
                        onChange={(e) => setAcademicPeriodId(e.target.value)}
                        required
                      >
                        <option value="">Select semester</option>
                        {activePeriods.map((period) => (
                          <option key={period.id} value={period.id}>
                            {period.academicYear} ·{' '}
                            {period.semester === 'FIRST'
                              ? 'First Semester'
                              : 'Second Semester'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block min-w-0 text-xs font-semibold">
                      Term
                      <select
                        className={`${input} mt-1`}
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        required
                      >
                        <option value="">Select term</option>
                        <option value="PRELIMINARY">Preliminary</option>
                        <option value="MIDTERM">Midterm</option>
                        <option value="SEMI_FINAL">Semi-final</option>
                        <option value="FINAL">Final</option>
                      </select>
                    </label>
                    <label className="block min-w-0 text-xs font-semibold md:col-span-2">
                      Exam title
                      <input
                        className={`${input} mt-1`}
                        maxLength={200}
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        placeholder="Enter exam title"
                      />
                    </label>
                    <label className="block min-w-0 text-xs font-semibold">
                      Start date and time
                      <input
                        className={`${input} mt-1`}
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={(e) =>
                          setForm({ ...form, scheduledAt: e.target.value })
                        }
                      />
                    </label>
                    <label className="block min-w-0 text-xs font-semibold">
                      End date and time
                      <input
                        className={`${input} mt-1`}
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(e) =>
                          setForm({ ...form, endsAt: e.target.value })
                        }
                      />
                    </label>
                    <label className="block min-w-0 text-xs font-semibold md:col-span-2">
                      Instructions
                      <textarea
                        className={`${input} mt-1 min-h-24 resize-y`}
                        value={form.instructions}
                        onChange={(e) =>
                          setForm({ ...form, instructions: e.target.value })
                        }
                        placeholder="Enter instructions for students"
                      />
                    </label>
                  </div>
                </section>
                {(mode === 'manual' || mode === 'file') && (
                  <section className="rounded-xl border border-border p-4 sm:p-5">
                    <div className="mb-4">
                      <h3 className="font-semibold text-text-1">
                        Exam settings
                      </h3>
                      <p className="text-xs text-text-3">
                        Choose the monitoring and randomization rules.
                      </p>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {(
                        [
                          ['requireCamera', 'Require camera'],
                          ['requireMicrophone', 'Require microphone'],
                          ['blockThirdPartyApps', 'Block third-party apps'],
                          ['randomizeQuestions', 'Randomize question order'],
                          ['randomizeOptions', 'Randomize answer order'],
                        ] as const
                      ).map(([k, l]) => (
                        <label
                          key={k}
                          className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-canvas/40 px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={form[k]}
                            onChange={(e) =>
                              setForm({ ...form, [k]: e.target.checked })
                            }
                          />
                          {l}
                        </label>
                      ))}
                    </div>
                  </section>
                )}
                {(mode === 'manual' || draftGenerated) &&
                  questions.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="mb-4 grid items-end gap-3 sm:grid-cols-[auto_minmax(0,14rem)_6rem_1fr_auto]">
                        <b className="self-center text-text-2">{i + 1}.</b>
                        <label className="block min-w-0 text-xs font-semibold">
                          Question type
                          <select
                            className={`${input} mt-1`}
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
                              <option key={t}>{t.replace(/_/g, ' ')}</option>
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
                            onChange={(e) =>
                              patchQ(i, { points: +e.target.value })
                            }
                          />
                        </label>
                        <label className="flex min-h-10 items-center gap-2 self-end text-sm sm:justify-self-end">
                          <input
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
                          className="grid min-h-10 min-w-10 place-items-center self-end rounded-lg text-text-3 hover:bg-red-50 hover:text-risk-high disabled:opacity-40"
                          disabled={questions.length === 1}
                          onClick={() =>
                            setQuestions((v) => v.filter((_, n) => n !== i))
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <label className="block text-xs font-semibold">
                        Question prompt
                        <textarea
                          className={`${input} mt-1 min-h-20 resize-y`}
                          value={q.prompt}
                          onChange={(e) =>
                            patchQ(i, { prompt: e.target.value })
                          }
                          placeholder="Enter the question"
                        />
                      </label>
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
                                      j === n
                                        ? { ...x, label: e.target.value }
                                        : x
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
                                    options: q.options.filter(
                                      (_, j) => j !== n
                                    ),
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
                                    answers: q.answers.filter(
                                      (_, j) => j !== n
                                    ),
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
                          onChange={(e) =>
                            patchQ(i, { answers: [e.target.value] })
                          }
                          placeholder="Correct answer"
                        />
                      )}
                      {q.type === 'ESSAY' && (
                        <textarea
                          className={`${input} mt-3`}
                          value={q.rubric}
                          onChange={(e) =>
                            patchQ(i, { rubric: e.target.value })
                          }
                          placeholder="Rubric / guidance"
                        />
                      )}
                    </div>
                  ))}
                <div className="flex justify-between">
                  {mode === 'manual' || draftGenerated ? (
                    <Button
                      type="button"
                      variant="ghost"
                      icon={Plus}
                      onClick={() => setQuestions((v) => [...v, blank()])}
                    >
                      Add question
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={close}>
                      Cancel
                    </Button>
                    <Button disabled={save.isPending}>
                      Save and publish {active.kind.toLowerCase()}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Edit Subject"
              subtitle="Update the subject details shown to students."
            />
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                updateSubject.mutate(editing);
              }}
            >
              <input
                className={input}
                value={editing.subjectCode}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    subjectCode: e.target.value.toUpperCase(),
                  })
                }
                placeholder="Subject code"
              />
              <input
                className={input}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                placeholder="Subject name"
              />
              <input
                className={input}
                value={editing.schedule}
                onChange={(e) =>
                  setEditing({ ...editing, schedule: e.target.value })
                }
                placeholder="Schedule"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </Button>
                <Button disabled={updateSubject.isPending}>Save changes</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {deleting && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Delete Subject"
              subtitle="This also deletes its exams, enrollments, requests, sessions, and submissions."
            />
            <p className="mb-5 text-sm">
              Are you sure you want to delete{' '}
              <b>
                {deleting.subjectCode} — {deleting.name}
              </b>
              ? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(undefined)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteSubject.isPending}
                onClick={() => deleteSubject.mutate(deleting.id)}
              >
                {deleteSubject.isPending ? 'Deleting…' : 'Delete subject'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {rescheduling && (
        <div className="fixed inset-0 z-[65] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Reschedule assessment"
              subtitle={`${rescheduling.exam.title} · enrolled students will be notified`}
            />
            <label className="mb-3 block text-sm font-semibold">
              New start
              <input
                type="datetime-local"
                value={rescheduling.scheduledAt}
                onChange={(event) =>
                  setRescheduling({
                    ...rescheduling,
                    scheduledAt: event.target.value,
                  })
                }
                className={`${input} mt-1`}
              />
            </label>
            <label className="mb-5 block text-sm font-semibold">
              New deadline
              <input
                type="datetime-local"
                value={rescheduling.endsAt}
                onChange={(event) =>
                  setRescheduling({
                    ...rescheduling,
                    endsAt: event.target.value,
                  })
                }
                className={`${input} mt-1`}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setRescheduling(undefined)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  updateSchedule.isPending ||
                  !rescheduling.scheduledAt ||
                  !rescheduling.endsAt ||
                  new Date(rescheduling.endsAt) <=
                    new Date(rescheduling.scheduledAt)
                }
                onClick={() => updateSchedule.mutate()}
              >
                {updateSchedule.isPending ? 'Saving…' : 'Save schedule'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {stopping && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title={
                assessmentStateFor(stopping) === 'PENDING'
                  ? 'Cancel Scheduled Exam/Quiz'
                  : 'Stop Exam/Quiz'
              }
              subtitle={
                assessmentStateFor(stopping) === 'PENDING'
                  ? 'The scheduled assessment will be cancelled before it starts.'
                  : 'Students will no longer be able to join this assessment.'
              }
            />
            <p className="mb-5 text-sm">
              Are you sure you want to{' '}
              {assessmentStateFor(stopping) === 'PENDING' ? 'cancel' : 'stop'}{' '}
              <b>{currentExamFor(stopping)?.title}</b>
              {assessmentStateFor(stopping) === 'PENDING'
                ? ' before it starts'
                : ' early'}
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStopping(undefined)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={stopExam.isPending}
                onClick={() => stopExam.mutate(stopping)}
              >
                {stopExam.isPending
                  ? assessmentStateFor(stopping) === 'PENDING'
                    ? 'Cancelling…'
                    : 'Stopping…'
                  : assessmentStateFor(stopping) === 'PENDING'
                    ? 'Cancel exam/quiz'
                    : 'Stop exam/quiz'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {rosterSubject && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-6xl overflow-y-auto">
            <CardHeader
              title={`Enrolled Students — ${rosterSubject.subjectCode}`}
              subtitle={`${rosterSubject.name} | ${rosterSubject.schedule}`}
            />
            <div className="max-h-[65vh] overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-text-3">
                  <tr>
                    <th className="p-3">Student ID</th>
                    <th className="p-3">Full name</th>
                    <th className="p-3">Year level</th>
                    <th className="p-3">Program</th>
                    <th className="p-3">Section</th>
                    <th className="p-3">Assessment status</th>
                    <th className="p-3">Enrolled at</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.data?.map((row) => (
                    <tr key={row.student.id} className="border-t border-border">
                      <td className="p-3">
                        {row.student.studentProfile?.studentId || '—'}
                      </td>
                      <td className="p-3 font-medium">
                        {displayName(row.student.fullName)}
                      </td>
                      <td className="p-3">
                        {row.student.studentProfile?.yearLevel?.replace(
                          'YEAR_',
                          'Year '
                        ) || '—'}
                      </td>
                      <td className="p-3">
                        {row.student.studentProfile?.program || '—'}
                      </td>
                      <td className="p-3">
                        {row.student.studentProfile?.section?.name ||
                          'Unassigned'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.assessmentStatus === 'TAKEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                        >
                          {row.assessmentStatus === 'TAKEN'
                            ? 'Exam/Quiz Taken'
                            : 'Exam/Quiz Not yet taken'}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {enrollmentDate(row.enrolledAt)}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="danger"
                          icon={Trash2}
                          aria-label={`Remove ${row.student.fullName}`}
                          title="Remove student"
                          onClick={() => setRemovingStudent(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {roster.isLoading && (
                <p className="p-5 text-sm text-text-2">Loading students…</p>
              )}
              {!roster.isLoading && !roster.data?.length && (
                <p className="p-5 text-sm text-text-2">
                  No students are enrolled in this subject.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={() => {
                  setRemovingStudent(undefined);
                  setRosterSubject(undefined);
                }}
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
      {rosterSubject && removingStudent && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title="Remove Student"
              subtitle={`Remove this student from ${rosterSubject.subjectCode}?`}
            />
            <p className="mb-5 text-sm">
              Are you sure you want to remove{' '}
              <b>{displayName(removingStudent.student.fullName)}</b> from this
              subject? The student will no longer have access to it.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={removeStudent.isPending}
                onClick={() => setRemovingStudent(undefined)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={removeStudent.isPending}
                onClick={() =>
                  removeStudent.mutate({
                    subjectId: rosterSubject.id,
                    studentId: removingStudent.student.id,
                  })
                }
              >
                {removeStudent.isPending ? 'Removing…' : 'Remove student'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
