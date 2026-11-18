import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Download,
  Eye,
  FileUp,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { api } from '../../lib/api';

type QType = 'MULTIPLE_CHOICE' | 'ENUMERATION' | 'IDENTIFICATION' | 'ESSAY';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
type Tab = 'questions' | 'imports' | 'archived';
type Subject = { id: string; subjectCode: string; name: string };
type BankItem = {
  id: string;
  subjectId: string | null;
  type: QType;
  prompt: string;
  points: number;
  isRequired: boolean;
  correctAnswer: unknown;
  rubric: string | null;
  options: { label: string; isCorrect: boolean }[] | null;
  topics: string[];
  difficulty: Difficulty;
  subject?: Subject | null;
};
type Exam = {
  id: string;
  title: string;
  version?: number;
  subject: { code: string; name: string };
};
type ExamGroup = {
  examId: string;
  title: string;
  version: number;
  status: string;
  subject: { code: string; name: string };
  questionCount: number;
  importedAt: string;
};
type Form = {
  id?: string;
  subjectId: string;
  type: QType;
  prompt: string;
  points: number;
  isRequired: boolean;
  answer: string;
  rubric: string;
  options: string;
  topics: string;
  difficulty: Difficulty;
};
type Counts = Record<QType, number>;

const blank = (): Form => ({
  subjectId: '',
  type: 'MULTIPLE_CHOICE',
  prompt: '',
  points: 1,
  isRequired: true,
  answer: '',
  rubric: '',
  options: '*Correct answer\nAlternative answer',
  topics: '',
  difficulty: 'MEDIUM',
});
const blankCounts = (): Counts => ({
  MULTIPLE_CHOICE: 0,
  ENUMERATION: 0,
  IDENTIFICATION: 0,
  ESSAY: 0,
});
const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-1 outline-none focus:border-brand';

function answerFor(item: BankItem) {
  if (item.type === 'MULTIPLE_CHOICE')
    return (item.options ?? [])
      .filter((option) => option.isCorrect)
      .map((option) => option.label)
      .join(', ');
  if (item.type === 'ESSAY') return item.rubric || 'No rubric';
  return Array.isArray(item.correctAnswer)
    ? item.correctAnswer.join(', ')
    : String(item.correctAnswer ?? '');
}

export default function QuestionBank() {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('questions');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [editor, setEditor] = useState<Form>();
  const [documentFile, setDocumentFile] = useState<File>();
  const [documentSubjectId, setDocumentSubjectId] = useState('');
  const [counts, setCounts] = useState<Counts>(blankCounts);
  const [previousExamId, setPreviousExamId] = useState('');
  const [expandedExamId, setExpandedExamId] = useState('');
  const [message, setMessage] = useState('');

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Subject[]>('/subjects/mine')).data,
  });
  const exams = useQuery({
    queryKey: ['teacher-exams'],
    queryFn: async () => (await api.get<Exam[]>('/teacher/exams')).data,
  });
  const bank = useQuery({
    queryKey: ['question-bank', search, subjectId, difficulty],
    queryFn: async () =>
      (
        await api.get<BankItem[]>('/subjects/question-bank', {
          params: {
            search: search || undefined,
            subjectId: subjectId || undefined,
            difficulty: difficulty || undefined,
          },
        })
      ).data,
  });
  const activeGroups = useQuery({
    queryKey: ['question-bank-exam-groups', 'active'],
    queryFn: async () =>
      (await api.get<ExamGroup[]>('/subjects/question-bank/exam-groups')).data,
  });
  const archivedGroups = useQuery({
    queryKey: ['question-bank-exam-groups', 'archived'],
    queryFn: async () =>
      (
        await api.get<ExamGroup[]>('/subjects/question-bank/exam-groups', {
          params: { archive: 'archived' },
        })
      ).data,
  });
  const expandedItems = useQuery({
    queryKey: ['question-bank-exam-items', expandedExamId, tab],
    enabled: Boolean(expandedExamId) && tab !== 'questions',
    queryFn: async () =>
      (
        await api.get<BankItem[]>(
          '/subjects/question-bank/exam-groups/' + expandedExamId,
          { params: tab === 'archived' ? { archive: 'archived' } : undefined }
        )
      ).data,
  });

  const topics = useMemo(
    () => [...new Set((bank.data ?? []).flatMap((item) => item.topics))].sort(),
    [bank.data]
  );
  const importedExamIds = useMemo(
    () =>
      new Set(
        [...(activeGroups.data ?? []), ...(archivedGroups.data ?? [])].map(
          (group) => group.examId
        )
      ),
    [activeGroups.data, archivedGroups.data]
  );
  const shown = (bank.data ?? []).filter(
    (item) => !topic || item.topics.includes(topic)
  );
  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 3500);
  };
  const refreshBank = () => {
    void client.invalidateQueries({ queryKey: ['question-bank'] });
    void client.invalidateQueries({ queryKey: ['question-bank-builder'] });
    void client.invalidateQueries({ queryKey: ['question-bank-exam-groups'] });
    void client.invalidateQueries({ queryKey: ['question-bank-exam-items'] });
  };
  const payload = (form: Form) => ({
    subjectId: form.subjectId || undefined,
    type: form.type,
    prompt: form.prompt.trim(),
    points: form.points,
    isRequired: form.isRequired,
    correctAnswer:
      form.type === 'ENUMERATION'
        ? form.answer
            .split(/\r?\n|\|/)
            .map((value) => value.trim())
            .filter(Boolean)
        : form.type === 'IDENTIFICATION'
          ? form.answer.trim()
          : undefined,
    rubric: form.type === 'ESSAY' ? form.rubric.trim() : undefined,
    options:
      form.type === 'MULTIPLE_CHOICE'
        ? form.options
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => ({
              label: line.replace(/^\*/, '').trim(),
              isCorrect: line.startsWith('*'),
            }))
        : undefined,
    topics: form.topics
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    difficulty: form.difficulty,
  });
  const save = useMutation({
    mutationFn: (form: Form) =>
      form.id
        ? api.patch('/subjects/question-bank/' + form.id, payload(form))
        : api.post('/subjects/question-bank', payload(form)),
    onSuccess: () => {
      setEditor(undefined);
      notify('Question saved to the reusable bank.');
      refreshBank();
    },
    onError: () =>
      notify('Question could not be saved. Check its answer fields.'),
  });
  const archiveItem = useMutation({
    mutationFn: (id: string) => api.delete('/subjects/question-bank/' + id),
    onSuccess: () => {
      notify('Question archived.');
      refreshBank();
    },
  });
  const importDocument = useMutation({
    mutationFn: async () => {
      if (!documentFile || !documentSubjectId) throw new Error();
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      if (!total) throw new Error('Set at least one question count.');
      const data = new FormData();
      data.append('file', documentFile);
      data.append('subjectId', documentSubjectId);
      data.append('counts', JSON.stringify(counts));
      return api.post('/subjects/question-bank/import-document', data);
    },
    onSuccess: ({ data }) => {
      setDocumentFile(undefined);
      setCounts(blankCounts());
      notify(String(data.imported) + ' questions generated and imported.');
      refreshBank();
    },
    onError: (error: any) =>
      notify(
        error?.response?.data?.message ??
          error?.message ??
          'Document import failed.'
      ),
  });
  const importExam = useMutation({
    mutationFn: () =>
      api.post('/subjects/question-bank/import-exam/' + previousExamId),
    onSuccess: ({ data }) => {
      setPreviousExamId('');
      setTab('imports');
      notify(
        String(data.imported) + ' questions copied as one exam questionnaire.'
      );
      refreshBank();
    },
    onError: (error: any) =>
      notify(
        error?.response?.data?.message ??
          'Previous exam could not be imported.'
      ),
  });
  const archiveExam = useMutation({
    mutationFn: (examId: string) =>
      api.delete('/subjects/question-bank/exam-groups/' + examId),
    onSuccess: () => {
      setExpandedExamId('');
      notify('Exam questionnaire archived.');
      refreshBank();
    },
  });
  const restoreExam = useMutation({
    mutationFn: (examId: string) =>
      api.patch('/subjects/question-bank/exam-groups/' + examId + '/restore'),
    onSuccess: () => {
      setExpandedExamId('');
      notify('Exam questionnaire restored.');
      refreshBank();
    },
  });
  const edit = (item: BankItem) =>
    setEditor({
      id: item.id,
      subjectId: item.subjectId ?? '',
      type: item.type,
      prompt: item.prompt,
      points: item.points,
      isRequired: item.isRequired,
      answer: Array.isArray(item.correctAnswer)
        ? item.correctAnswer.join('\n')
        : String(item.correctAnswer ?? ''),
      rubric: item.rubric ?? '',
      options: (item.options ?? [])
        .map((option) => (option.isCorrect ? '*' : '') + option.label)
        .join('\n'),
      topics: item.topics.join(', '),
      difficulty: item.difficulty,
    });
  const chooseTab = (next: Tab) => {
    setTab(next);
    setExpandedExamId('');
  };
  const groups = tab === 'archived' ? archivedGroups : activeGroups;

  return (
    <DashboardLayout role="teacher" pageTitle="Question Bank">
      {message && (
        <div
          role="status"
          className="fixed right-5 top-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
        >
          {message}
        </div>
      )}
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Reusable question bank"
            subtitle="Build, tag, import, and reuse questions without changing published exams."
          />
          <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-4">
            {(
              [
                ['questions', 'Individual questions'],
                ['imports', 'Imported exam questionnaires'],
                ['archived', 'Archived exam questionnaires'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={tab === value ? 'primary' : 'ghost'}
                onClick={() => chooseTab(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {tab === 'questions' && (
            <div className="grid gap-2 md:grid-cols-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions"
                className={field}
              />
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={field}
              >
                <option value="">All subjects</option>
                {subjects.data?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subjectCode} · {subject.name}
                  </option>
                ))}
              </select>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className={field}
              >
                <option value="">All difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className={field}
              >
                <option value="">All topics</option>
                {topics.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <Button icon={Plus} onClick={() => setEditor(blank())}>
                New question
              </Button>
            </div>
          )}
        </Card>

        {tab === 'questions' ? (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Import from document"
                  subtitle="Generate editable bank questions from a DOCX, PPT, PPTX, or PDF file."
                />
                <select
                  value={documentSubjectId}
                  onChange={(event) => setDocumentSubjectId(event.target.value)}
                  className={field + ' mb-3'}
                >
                  <option value="">Choose subject</option>
                  {subjects.data?.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.subjectCode} · {subject.name}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  accept=".docx,.ppt,.pptx,.pdf"
                  onChange={(event) =>
                    setDocumentFile(event.target.files?.[0])
                  }
                  className="mb-3 block text-sm"
                />
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {(Object.keys(counts) as QType[]).map((type) => (
                    <label key={type} className="text-xs text-text-2">
                      {type.replace(/_/g, ' ')}
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={counts[type] || ''}
                        onChange={(event) =>
                          setCounts({
                            ...counts,
                            [type]: Math.max(0, Number(event.target.value)),
                          })
                        }
                        className={field + ' mt-1'}
                      />
                    </label>
                  ))}
                </div>
                <p className="mb-3 text-xs text-text-3">
                  AI-generated answers are editable and should be reviewed by
                  the teacher before use.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={FileUp}
                    disabled={
                      !documentFile ||
                      !documentSubjectId ||
                      importDocument.isPending
                    }
                    onClick={() => importDocument.mutate()}
                  >
                    {importDocument.isPending
                      ? 'Generating…'
                      : 'Generate and import'}
                  </Button>
                  <a
                    href="/templates/proctorx-question-bank-template.docx"
                    download
                  >
                    <Button variant="ghost" icon={Download}>
                      DOCX template
                    </Button>
                  </a>
                </div>
              </Card>
              <Card>
                <CardHeader
                  title="Import previous exam"
                  subtitle="The exam stays as one grouped questionnaire instead of flooding the main list."
                />
                <select
                  value={previousExamId}
                  onChange={(e) => setPreviousExamId(e.target.value)}
                  className={field + ' mb-3'}
                >
                  <option value="">Select previous exam</option>
                  {exams.data
                    ?.filter((exam) => !importedExamIds.has(exam.id))
                    .map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.subject.code} · {exam.title}
                      {exam.version ? ' · v' + exam.version : ''}
                    </option>
                    ))}
                </select>
                <Button
                  disabled={!previousExamId || importExam.isPending}
                  onClick={() => importExam.mutate()}
                >
                  Copy exam questionnaire
                </Button>
              </Card>
            </div>
            <Card padded={false}>
              {bank.isLoading && (
                <p className="p-5 text-sm text-text-2">
                  Loading question bank…
                </p>
              )}
              {!bank.isLoading && !shown.length && (
                <p className="p-5 text-sm text-text-2">
                  No reusable questions match these filters.
                </p>
              )}
              {shown.map((item) => (
                <QuestionRow
                  key={item.id}
                  item={item}
                  onEdit={() => edit(item)}
                  onArchive={() => archiveItem.mutate(item.id)}
                />
              ))}
            </Card>
          </>
        ) : (
          <Card padded={false}>
            {groups.isLoading && (
              <p className="p-5 text-sm text-text-2">
                Loading exam questionnaires…
              </p>
            )}
            {!groups.isLoading && !groups.data?.length && (
              <p className="p-5 text-sm text-text-2">
                {tab === 'archived'
                  ? 'No archived exam questionnaires.'
                  : 'No previous exams have been imported.'}
              </p>
            )}
            {groups.data?.map((group) => {
              const expanded = expandedExamId === group.examId;
              return (
                <section key={group.examId} className="border-b border-border last:border-0">
                  <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-text-1">
                        {group.subject.code} · {group.title}
                      </h3>
                      <p className="mt-1 text-xs text-text-3">
                        Version {group.version} · {group.questionCount}{' '}
                        question{group.questionCount === 1 ? '' : 's'} ·
                        Imported {new Date(group.importedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      icon={Eye}
                      onClick={() =>
                        setExpandedExamId(expanded ? '' : group.examId)
                      }
                    >
                      {expanded ? 'Hide questions' : 'View questions'}
                    </Button>
                    {tab === 'archived' ? (
                      <Button
                        variant="ghost"
                        icon={RotateCcw}
                        disabled={restoreExam.isPending}
                        onClick={() => restoreExam.mutate(group.examId)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        icon={Archive}
                        disabled={archiveExam.isPending}
                        onClick={() => archiveExam.mutate(group.examId)}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="border-t border-border bg-canvas/40">
                      {expandedItems.isLoading && (
                        <p className="p-5 text-sm text-text-2">
                          Loading questions and answers…
                        </p>
                      )}
                      {expandedItems.data?.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-4 border-b border-border p-5 last:border-0"
                        >
                          <span className="font-bold text-text-3">
                            {index + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-text-1">
                              {item.prompt}
                            </p>
                            <p className="mt-1 text-xs text-text-3">
                              {item.type.replace(/_/g, ' ')} · {item.points}{' '}
                              point{item.points === 1 ? '' : 's'} ·{' '}
                              {item.difficulty}
                            </p>
                            <p className="mt-2 text-sm text-text-2">
                              <b>Answer:</b> {answerFor(item)}
                            </p>
                          </div>
                          {tab !== 'archived' && (
                            <Button
                              variant="ghost"
                              icon={Pencil}
                              aria-label="Edit imported question"
                              onClick={() => edit(item)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </Card>
        )}
      </div>
      {editor && (
        <QuestionEditor
          editor={editor}
          subjects={subjects.data ?? []}
          pending={save.isPending}
          onChange={setEditor}
          onCancel={() => setEditor(undefined)}
          onSave={() => save.mutate(editor)}
        />
      )}
    </DashboardLayout>
  );
}

function QuestionRow({
  item,
  onEdit,
  onArchive,
}: {
  item: BankItem;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border p-5 last:border-b-0">
      <span className="mt-1 rounded-full bg-brand-soft px-2 py-1 text-[10px] font-bold text-brand">
        {item.difficulty}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text-1">{item.prompt}</p>
        <p className="mt-1 text-xs text-text-3">
          {item.type.replace(/_/g, ' ')} · {item.points} point
          {item.points === 1 ? '' : 's'}
          {item.subject ? ' · ' + item.subject.subjectCode : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {item.topics.map((value) => (
            <span
              key={value}
              className="rounded-full bg-brand-soft px-2 py-1 text-[10px] text-brand"
            >
              {value}
            </span>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        icon={Pencil}
        aria-label="Edit question"
        onClick={onEdit}
      />
      <Button
        variant="ghost"
        icon={Archive}
        aria-label="Archive question"
        onClick={onArchive}
      />
    </div>
  );
}

function QuestionEditor({
  editor,
  subjects,
  pending,
  onChange,
  onCancel,
  onSave,
}: {
  editor: Form;
  subjects: Subject[];
  pending: boolean;
  onChange: (form: Form) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4">
      <form
        className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl bg-surface p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {editor.id ? 'Edit bank question' : 'New bank question'}
          </h2>
          <button type="button" aria-label="Close" onClick={onCancel}>
            <X />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={editor.type}
            onChange={(event) =>
              onChange({ ...editor, type: event.target.value as QType })
            }
            className={field}
          >
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="ENUMERATION">Enumeration</option>
            <option value="IDENTIFICATION">Identification</option>
            <option value="ESSAY">Essay</option>
          </select>
          <select
            value={editor.difficulty}
            onChange={(event) =>
              onChange({
                ...editor,
                difficulty: event.target.value as Difficulty,
              })
            }
            className={field}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
          <input
            type="number"
            min={1}
            value={editor.points}
            onChange={(event) =>
              onChange({
                ...editor,
                points: Math.max(1, Number(event.target.value)),
              })
            }
            className={field}
          />
        </div>
        <select
          value={editor.subjectId}
          onChange={(event) =>
            onChange({ ...editor, subjectId: event.target.value })
          }
          className={field}
        >
          <option value="">No specific subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.subjectCode} · {subject.name}
            </option>
          ))}
        </select>
        <textarea
          required
          rows={4}
          value={editor.prompt}
          onChange={(event) =>
            onChange({ ...editor, prompt: event.target.value })
          }
          placeholder="Question prompt"
          className={field}
        />
        {editor.type === 'MULTIPLE_CHOICE' && (
          <textarea
            required
            rows={5}
            value={editor.options}
            onChange={(event) =>
              onChange({ ...editor, options: event.target.value })
            }
            placeholder={'One option per line\n*Prefix the correct option'}
            className={field}
          />
        )}
        {(editor.type === 'ENUMERATION' ||
          editor.type === 'IDENTIFICATION') && (
          <textarea
            required
            rows={3}
            value={editor.answer}
            onChange={(event) =>
              onChange({ ...editor, answer: event.target.value })
            }
            placeholder="Correct answer(s)"
            className={field}
          />
        )}
        {editor.type === 'ESSAY' && (
          <textarea
            required
            rows={4}
            value={editor.rubric}
            onChange={(event) =>
              onChange({ ...editor, rubric: event.target.value })
            }
            placeholder="Rubric / guidance"
            className={field}
          />
        )}
        <input
          value={editor.topics}
          onChange={(event) =>
            onChange({ ...editor, topics: event.target.value })
          }
          placeholder="Topics separated by commas"
          className={field}
        />
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={editor.isRequired}
            onChange={(event) =>
              onChange({ ...editor, isRequired: event.target.checked })
            }
            className="mr-2"
          />
          Required
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button icon={Save} disabled={pending}>
            Save question
          </Button>
        </div>
      </form>
    </div>
  );
}
