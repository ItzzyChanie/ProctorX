import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { QuestionEditor } from './exam-builder/QuestionEditor';
import { AiReviewPanel, type ReviewReport } from './exam-builder/AiReviewPanel';
import {
  blankQuestion as blank,
  fromGenerated,
  fromStored,
  questionProblem,
  toPayload,
  type Difficulty,
  type Question,
} from './exam-builder/questions';

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
/** Question types the AI generator can produce. */
type GenType = 'MULTIPLE_CHOICE' | 'ENUMERATION' | 'IDENTIFICATION' | 'ESSAY';
const input =
  'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand';
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
  const canCreateExam = useAuthStore(
    (state) => state.user?.permissions?.CREATE_EXAM !== false
  );
  const canViewRosters = useAuthStore(
    (state) => state.user?.permissions?.VIEW_STUDENT_ROSTERS !== false
  );
  const canFlagStudent = useAuthStore(
    (state) => state.user?.permissions?.FLAG_STUDENT !== false
  );
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
    [notice, setNoticeText] = useState(''),
    // Success messages are marked explicitly; others fall back to a keyword check.
    [noticeIsSuccess, setNoticeIsSuccess] = useState(false),
    [academicPeriodId, setAcademicPeriodId] = useState(''),
    [term, setTerm] = useState(''),
    [active, setActive] = useState<{
      subject: Subject;
      kind: 'EXAM' | 'QUIZ';
    }>(),
    [mode, setMode] = useState<'manual' | 'file' | 'google'>('manual'),
    [source, setSource] = useState(''),
    [sourceFiles, setSourceFiles] = useState<File[]>([]),
    [draftGenerated, setDraftGenerated] = useState(false),
    [sourceExamId, setSourceExamId] = useState(''),
    [previousExamId, setPreviousExamId] = useState(''),
    // Draft being edited (saved, not yet visible to students).
    [draftId, setDraftId] = useState(''),
    [openDraftId, setOpenDraftId] = useState(''),
    // Text extracted from the generation documents (used by the AI review).
    [sourceText, setSourceText] = useState(''),
    // AI difficulty review of the current draft (advisory).
    [aiReport, setAiReport] = useState<ReviewReport | null>(null),
    [reviewStale, setReviewStale] = useState(false),
    [rewritingIndex, setRewritingIndex] = useState<number | null>(null),
    [targetDifficulty, setTargetDifficulty] = useState<
      'MIXED' | 'EASY' | 'MEDIUM' | 'HARD'
    >('MIXED'),
    [selectedBankIds, setSelectedBankIds] = useState<string[]>([]),
    [counts, setCounts] = useState<Record<GenType, number>>({
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
  const setNotice = (message: string) => {
    setNoticeText(message);
    setNoticeIsSuccess(false);
  };
  /** Green toast regardless of wording (e.g. "Students cannot see it yet"). */
  const notifySuccess = (message: string) => {
    setNoticeText(message);
    setNoticeIsSuccess(true);
  };
  const noticeIsError =
    !noticeIsSuccess &&
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
      notifySuccess(
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
    setSourceFiles([]);
    setDraftGenerated(false);
    setSourceExamId('');
    setPreviousExamId('');
    setDraftId('');
    setOpenDraftId('');
    setSourceText('');
    setAiReport(null);
    setReviewStale(false);
    setRewritingIndex(null);
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
    mutationFn: async (publish: boolean) => {
      const base = `/subjects/${active!.subject.id}/exams`;
      const body = {
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
        questions: mode === 'google' ? undefined : questions.map(toPayload),
        sourceText: sourceText || undefined,
        publish,
      };
      if (!draftId) return (await api.post(base, body)).data;
      const saved = (await api.patch(`${base}/${draftId}/draft`, body)).data;
      if (publish) await api.post(`${base}/${draftId}/publish`);
      return saved;
    },
    onSuccess: (saved: { id: string }, publish) => {
      const kind = active?.kind === 'QUIZ' ? 'Quiz' : 'Exam';
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      void qc.invalidateQueries({ queryKey: ['previous-exams'] });
      if (publish) {
        notifySuccess(`${kind} published. Students can now see it.`);
        close();
        return;
      }
      setDraftId(saved.id);
      notifySuccess(
        `${kind} saved as a draft. Students cannot see it until you publish.`
      );
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
  const patchQ = (i: number, p: Partial<Question>) => {
    setQuestions((v) => v.map((q, n) => (n === i ? { ...q, ...p } : q)));
    if (aiReport) setReviewStale(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return setNotice(problem);
    save.mutate(true);
  };
  const saveDraft = () => {
    const problem = validate();
    if (problem) return setNotice(problem);
    save.mutate(false);
  };
  const validate = (): string | null => {
    if (!academicPeriodId || !term)
      return 'Choose an active semester and examination term.';
    if (
      !form.scheduledAt ||
      !form.endsAt ||
      new Date(form.endsAt) <= new Date(form.scheduledAt)
    )
      return 'Choose a valid start and end date/time.';
    if (mode === 'google')
      return source.trim() ? null : 'Enter the Google Form link.';
    if (mode === 'file' && !draftGenerated)
      return 'Generate the review draft first.';
    if (!form.title.trim() || form.durationMinutes < 1)
      return 'Complete the title and duration.';
    for (const [index, question] of questions.entries()) {
      const problem = questionProblem(question, index);
      if (problem) return problem;
    }
    return null;
  };
  const generateDraft = useMutation({
    mutationFn: async () => {
      if (!sourceFiles.length)
        throw new Error('Choose at least one PPT, PDF, or DOCX file first.');
      const total = Object.values(counts).reduce(
        (sum, value) => sum + value,
        0
      );
      if (!total) throw new Error('Set at least one question count.');
      const data = new FormData();
      sourceFiles.forEach((file) => data.append('files', file));
      data.append('counts', JSON.stringify(counts));
      data.append('difficulty', targetDifficulty);
      return (
        await api.post<{ questions: unknown[]; sourceText?: string }>(
          `/subjects/${active!.subject.id}/questions/generate`,
          data
        )
      ).data;
    },
    onSuccess: ({ questions: generated, sourceText: text }) => {
      setQuestions(generated.map(fromGenerated));
      setSourceText(text ?? '');
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
      setQuestions(exam.questions.map(fromStored));
      setMode('manual');
      setNotice(
        'Previous exam loaded as a new immutable version. Review it before publishing.'
      );
    },
    onError: () => setNotice('Could not load the previous exam.'),
  });
  const drafts = (previousExams.data ?? []).filter(
    (exam) => exam.status === 'DRAFT'
  );
  const openDraft = useMutation({
    mutationFn: async (id: string) =>
      (
        await api.get<any>(`/subjects/${active!.subject.id}/exams/${id}/copy`)
      ).data,
    onSuccess: (exam) => {
      setDraftId(exam.id);
      setSourceExamId('');
      setAcademicPeriodId(exam.academicPeriodId);
      setTerm(exam.term);
      setSourceText(exam.sourceText ?? '');
      setForm((current) => ({
        ...current,
        title: exam.title,
        instructions: exam.instructions ?? '',
        durationMinutes: exam.durationMinutes,
        scheduledAt: localDateTimeValue(exam.scheduledAt),
        endsAt: localDateTimeValue(exam.endsAt),
        requireCamera: exam.requireCamera,
        requireMicrophone: exam.requireMicrophone,
        blockThirdPartyApps: (exam.appPolicyList ?? []).includes('*'),
        randomizeQuestions: exam.randomizeQuestions,
        randomizeOptions: exam.randomizeOptions,
      }));
      if (exam.sourceType === 'GOOGLE_FORMS_IMPORT') {
        setMode('google');
        setSource(exam.externalFormUrl ?? '');
      } else {
        setMode(exam.sourceType === 'AI_GENERATED' ? 'file' : 'manual');
        setDraftGenerated(exam.sourceType === 'AI_GENERATED');
        setQuestions(exam.questions.map(fromStored));
      }
      setAiReport(exam.aiReview ?? null);
      setReviewStale(false);
      notifySuccess('Draft opened. Save or publish when you are ready.');
    },
    onError: () => setNotice('Could not open the draft.'),
  });
  const deleteDraft = useMutation({
    mutationFn: () =>
      api.delete(`/subjects/${active!.subject.id}/exams/${draftId}/draft`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['previous-exams'] });
      close();
      notifySuccess('Draft deleted.');
    },
    onError: () => setNotice('Could not delete the draft.'),
  });
  const runReview = useMutation({
    mutationFn: async () => {
      const problem = validate();
      if (problem) throw new Error(problem);
      // Save first so the review always matches what is stored.
      const saved = await save.mutateAsync(false);
      return (
        await api.post<ReviewReport>(
          `/subjects/${active!.subject.id}/exams/${saved.id}/ai-review`
        )
      ).data;
    },
    onSuccess: (report) => {
      setAiReport(report);
      setReviewStale(false);
      notifySuccess(
        report.summary.mismatches || report.summary.issues
          ? 'AI review ready. Check the flagged questions before publishing.'
          : 'AI review ready. No difficulty mismatches or issues found.'
      );
    },
    onError: (error: any) =>
      setNotice(
        error?.response?.data?.message ||
          error?.message ||
          'Could not run the AI review.'
      ),
  });
  const rewrite = useMutation({
    mutationFn: async ({ index, reason }: { index: number; reason: string }) => {
      setRewritingIndex(index);
      const question = questions[index]!;
      return (
        await api.post(
          `/subjects/${active!.subject.id}/exams/${draftId}/questions/rewrite`,
          {
            question: toPayload(question),
            targetDifficulty: question.difficulty,
            reason,
          }
        )
      ).data;
    },
    onSuccess: (rewritten, { index }) => {
      patchQ(index, {
        ...fromGenerated(rewritten),
        points: questions[index]!.points,
      });
      notifySuccess(
        `Question ${index + 1} rewritten. Review it, then save and run the AI review again.`
      );
    },
    onError: (error: any) =>
      setNotice(
        error?.response?.data?.message || 'Could not rewrite the question.'
      ),
    onSettled: () => setRewritingIndex(null),
  });
  const jumpToQuestion = (index: number) =>
    document
      .getElementById(`question-${index}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const addBankQuestions = () => {
    const selected = (bankItems.data ?? []).filter((item) =>
      selectedBankIds.includes(item.id)
    );
    if (!selected.length)
      return setNotice('Select at least one bank question.');
    const mapped: Question[] = selected.map(fromStored);
    setQuestions((current) => {
      const useful = current.filter((question) => question.prompt.trim());
      return [...useful, ...mapped];
    });
    setSelectedBankIds([]);
    setNotice(
      String(mapped.length) + ' reusable question(s) added to this exam.'
    );
  };
  const subjectStatus = (s: Subject) => (
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
  );
  /** Assessment + edit/delete buttons, shared by the table and phone cards. */
  const subjectActions = (s: Subject) => (
    <>
      {currentExamFor(s) ? (
        <>
          <Button
            variant="ghost"
            icon={Pencil}
            disabled={!canCreateExam}
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
            disabled={!canCreateExam}
            onClick={() => setStopping(s)}
          >
            {assessmentStateFor(s) === 'PENDING'
              ? 'Cancel'
              : 'Stop'}
          </Button>
        </>
      ) : (
        <Button
          disabled={!canCreateExam || !activePeriods.length}
          title={
            !canCreateExam
              ? 'Creation restricted by your dean'
              : !activePeriods.length
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
        disabled={!canCreateExam}
        aria-label={`Edit ${s.name}`}
        title="Edit subject"
        onClick={() => setEditing({ ...s })}
      />
      <Button
        variant="danger"
        icon={Trash2}
        disabled={!canCreateExam}
        aria-label={`Delete ${s.name}`}
        title="Delete subject"
        onClick={() => setDeleting(s)}
      />
    </>
  );
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
          {!canCreateExam && (
            <p className="mb-3 text-xs font-semibold text-amber-600">
              Creation restricted by your dean.
            </p>
          )}
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
              disabled={!canCreateExam}
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
              disabled={!canCreateExam}
              className={input}
              maxLength={150}
              value={subjectForm.name}
              onChange={(e) =>
                setSubjectForm({ ...subjectForm, name: e.target.value })
              }
              placeholder="Subject name"
            />
            <input
              disabled={!canCreateExam}
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
              disabled={!canCreateExam || createSubject.isPending}
            >
              Create subject
            </Button>
          </form>
        </Card>
        <Card padded={false}>
          <div className="p-4 sm:p-6">
            <CardHeader
              title="My Subjects"
              subtitle="Create an assessment directly from any subject."
            />
          </div>
          {/* Phones: one card per subject so every action stays visible. */}
          <ul className="divide-y divide-border border-t border-border md:hidden">
            {subjects.data?.map((s) => (
              <li key={s.id} className="space-y-3 p-4">
                <div>
                  <div className="font-semibold text-text-1">
                    {s.subjectCode} - {s.name}
                  </div>
                  <div className="mt-0.5 text-xs text-text-2">{s.schedule}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded bg-brand-soft px-2 py-1 font-mono font-bold text-brand">
                    {s.code}
                    <button
                      type="button"
                      aria-label={`Copy join code ${s.code}`}
                      onClick={() => {
                        void navigator.clipboard.writeText(s.code);
                        setNotice('Join code copied.');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </span>
                  <button
                    type="button"
                    disabled={!canViewRosters}
                    onClick={() => setRosterSubject(s)}
                    className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-2 disabled:opacity-50"
                  >
                    {s._count.enrollments}{' '}
                    {s._count.enrollments === 1 ? 'student' : 'students'}
                  </button>
                  <span className="rounded-full border border-border px-2.5 py-1 font-semibold text-text-2">
                    {s._count.exams}{' '}
                    {s._count.exams === 1 ? 'assessment' : 'assessments'}
                  </span>
                  {subjectStatus(s)}
                </div>
                <div className="flex items-center gap-2 [&>button:first-child]:flex-1 [&>button:first-child]:justify-center">
                  {subjectActions(s)}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
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
                        disabled={!canViewRosters}
                        title={
                          canViewRosters
                            ? undefined
                            : 'Roster access restricted by your dean'
                        }
                        onClick={() => setRosterSubject(s)}
                      >
                        {s._count.enrollments}{' '}
                        {s._count.enrollments === 1 ? 'student' : 'students'}
                      </Button>
                    </td>
                    <td className="p-4">{s._count.exams}</td>
                    <td className="p-4">{subjectStatus(s)}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {subjectActions(s)}
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
                  disabled={!canFlagStudent}
                  onClick={() =>
                    review.mutate({ id: r.id, status: 'DECLINED' })
                  }
                >
                  Decline
                </Button>
                <Button
                  icon={Check}
                  disabled={!canFlagStudent}
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
              <button type="button" aria-label="Close" onClick={close}>
                <X />
              </button>
            </div>
            <div className="mb-5 grid gap-2 sm:flex sm:flex-wrap">
              {(['manual', 'file', 'google'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mode === m ? 'primary' : 'ghost'}
                  onClick={() => setMode(m)}
                  // Labels may wrap on phones; give wrapped lines room.
                  className="w-full text-center leading-tight sm:w-auto"
                >
                  {m === 'manual'
                    ? 'Manual'
                    : m === 'file'
                      ? 'Generate from PPT/PDF/DOCX'
                      : 'Import / Embed Google Form'}
                </Button>
              ))}
            </div>
            {drafts.length > 0 && !draftId && (
              <div className="mb-5 flex flex-col gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center">
                <p className="text-sm font-bold sm:mr-auto">
                  You have {drafts.length} unpublished draft
                  {drafts.length === 1 ? '' : 's'} for this subject.
                </p>
                <select
                  aria-label="Choose a draft"
                  value={openDraftId}
                  onChange={(e) => setOpenDraftId(e.target.value)}
                  className={`${input} sm:max-w-xs`}
                >
                  <option value="">Choose a draft</option>
                  {drafts.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={!openDraftId || openDraft.isPending}
                  onClick={() => openDraft.mutate(openDraftId)}
                >
                  Open draft
                </Button>
              </div>
            )}
            {draftId && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Editing a draft — students cannot see it until you publish.
              </p>
            )}
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
                      {previousExams.data
                        ?.filter((exam) => exam.status !== 'DRAFT')
                        .map((exam) => (
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
              <div className="mb-5 min-w-0 rounded-xl border border-brand/20 bg-brand-soft p-4">
                {/* Styled picker: the native file input has a fixed minimum
                    width that overflows this panel on phones. */}
                <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand/30 bg-surface px-4 py-5 text-center transition hover:border-brand/60 focus-within:ring-4 focus-within:ring-brand/15 sm:flex-row sm:gap-3 sm:py-4 sm:text-left">
                  <Upload size={18} className="shrink-0 text-brand" aria-hidden="true" />
                  <span className="text-sm font-semibold text-text-1">
                    Choose files
                  </span>
                  <span className="text-xs text-text-3">
                    PPT, PPTX, PDF or DOCX · up to 20 files
                  </span>
                <input
                  type="file"
                  multiple
                  accept=".ppt,.pptx,.pdf,.docx"
                  className="sr-only"
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files ?? []);
                    setSourceFiles((current) => {
                      const unique = new Map(
                        [...current, ...incoming].map((file) => [
                          `${file.name}:${file.size}:${file.lastModified}`,
                          file,
                        ])
                      );
                      return [...unique.values()].slice(0, 20);
                    });
                    setDraftGenerated(false);
                    e.currentTarget.value = '';
                  }}
                />
                </label>
                {!!sourceFiles.length && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-text-2">
                      <span>
                        {sourceFiles.length} document
                        {sourceFiles.length === 1 ? '' : 's'} selected
                      </span>
                      <span>
                        {(
                          sourceFiles.reduce((sum, file) => sum + file.size, 0) /
                          1_000_000
                        ).toFixed(1)}{' '}
                        MB total
                      </span>
                    </div>
                    {sourceFiles.map((file) => (
                      <div
                        key={`${file.name}:${file.size}:${file.lastModified}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate pr-3">
                          {file.name} · {(file.size / 1_000_000).toFixed(1)} MB
                        </span>
                        <button
                          type="button"
                          className="shrink-0 font-semibold text-risk-high"
                          onClick={() => {
                            setSourceFiles((current) =>
                              current.filter((item) => item !== file)
                            );
                            setDraftGenerated(false);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(counts) as GenType[]).map((t) => (
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
                <label className="mt-3 block text-xs font-semibold sm:max-w-xs">
                  Target difficulty
                  <select
                    className={`${input} mt-1`}
                    value={targetDifficulty}
                    onChange={(e) => {
                      setTargetDifficulty(e.target.value as typeof targetDifficulty);
                      setDraftGenerated(false);
                    }}
                  >
                    <option value="MIXED">Mixed (about 30% easy, 50% medium, 20% hard)</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </label>
                <p className="my-3 text-xs">
                  Upload up to 20 mixed PDF, PowerPoint, or Word documents. AI
                  will read them together and suggest answers with source
                  references. Review and edit everything before saving.
                </p>
                <Button
                  type="button"
                  className="w-full leading-tight sm:w-auto"
                  disabled={!sourceFiles.length || generateDraft.isPending}
                  onClick={() => generateDraft.mutate()}
                >
                  {generateDraft.isPending
                    ? 'Reading documents and generating…'
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
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={saveDraft}
                  >
                    {draftId ? 'Save draft' : 'Save as draft'}
                  </Button>
                  <Button disabled={save.isPending}>
                    {save.isPending ? 'Saving…' : 'Publish'}
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
                {(mode === 'manual' || draftGenerated) && (
                  <AiReviewPanel
                    report={aiReport}
                    stale={reviewStale}
                    running={runReview.isPending}
                    rewritingIndex={rewritingIndex}
                    onRun={() => runReview.mutate()}
                    onUseAiLevel={(index: number, level: Difficulty) =>
                      patchQ(index, { difficulty: level })
                    }
                    onRewrite={(index: number, reason: string) =>
                      rewrite.mutate({ index, reason })
                    }
                    onJump={jumpToQuestion}
                  />
                )}
                {(mode === 'manual' || draftGenerated) &&
                  questions.map((q, i) => (
                    <div key={i} id={`question-${i}`} className="scroll-mt-24">
                    <QuestionEditor
                      question={q}
                      index={i}
                      canRemove={questions.length > 1}
                      onChange={(patch) => patchQ(i, patch)}
                      onRemove={() => {
                        setQuestions((v) => v.filter((_, n) => n !== i));
                        if (aiReport) setReviewStale(true);
                      }}
                    />
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
                    {draftId && (
                      <Button
                        type="button"
                        variant="danger"
                        disabled={deleteDraft.isPending}
                        onClick={() => deleteDraft.mutate()}
                      >
                        Delete draft
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={saveDraft}
                    >
                      {draftId ? 'Save draft' : 'Save as draft'}
                    </Button>
                    <Button disabled={save.isPending}>
                      Publish {active.kind.toLowerCase()}
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
