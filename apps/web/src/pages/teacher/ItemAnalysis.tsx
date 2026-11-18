import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
type Item = {
  questionId: string;
  order: number;
  type: string;
  prompt: string;
  responses: number;
  difficultyIndex: number;
  actualDifficulty: Difficulty;
  teacherDifficulty: Difficulty;
  aiDifficulty: Difficulty | null;
  teacherMatches: boolean;
  aiMatches: boolean | null;
  discrimination: number;
  discriminationLabel: 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR' | 'NEGATIVE';
};
type Analysis = {
  exam: { id: string; title: string; status: string; aiReviewedAt: string | null };
  students: number;
  enoughStudents: boolean;
  minimumStudents: number;
  meanScorePercent: number;
  teacherAgreementPercent: number | null;
  aiAgreementPercent: number | null;
  aiPredictionsAvailable: boolean;
  items: Item[];
};
type ExamOption = {
  id: string;
  title: string;
  status: string;
  sessionCount: number;
  subject: { code: string; name: string };
};

const LEVEL: Record<Difficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const DISCRIMINATION: Record<Item['discriminationLabel'], { label: string; tone: string }> = {
  VERY_GOOD: { label: 'Very good', tone: 'text-emerald-700' },
  GOOD: { label: 'Good', tone: 'text-emerald-700' },
  FAIR: { label: 'Fair', tone: 'text-amber-700' },
  POOR: { label: 'Poor', tone: 'text-rose-700' },
  NEGATIVE: { label: 'Negative — check the answer key', tone: 'text-rose-700 font-bold' },
};

function toCsv(analysis: Analysis) {
  const header = [
    'Question',
    'Type',
    'Responses',
    'Difficulty index (p)',
    'Actual difficulty',
    'Teacher difficulty',
    'AI predicted difficulty',
    'Teacher matched',
    'AI matched',
    'Discrimination (D)',
    'Discrimination quality',
    'Prompt',
  ];
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = analysis.items.map((item) =>
    [
      item.order,
      item.type,
      item.responses,
      item.difficultyIndex,
      LEVEL[item.actualDifficulty],
      LEVEL[item.teacherDifficulty],
      item.aiDifficulty ? LEVEL[item.aiDifficulty] : '',
      item.teacherMatches ? 'yes' : 'no',
      item.aiMatches === null ? '' : item.aiMatches ? 'yes' : 'no',
      item.discrimination,
      DISCRIMINATION[item.discriminationLabel].label,
      item.prompt,
    ]
      .map(quote)
      .join(',')
  );
  return [header.map(quote).join(','), ...rows].join('\r\n');
}

export default function ItemAnalysis() {
  const [params, setParams] = useSearchParams();
  const examId = params.get('examId') ?? '';
  const [error, setError] = useState('');
  const exams = useQuery({
    queryKey: ['item-analysis-exams'],
    queryFn: async () => (await api.get<ExamOption[]>('/sessions/monitorable-exams')).data,
  });
  const analysis = useQuery({
    queryKey: ['item-analysis', examId],
    enabled: Boolean(examId),
    queryFn: async () => (await api.get<Analysis>(`/sessions/exam/${examId}/item-analysis`)).data,
  });
  const options = useMemo(
    () => (exams.data ?? []).filter((exam) => exam.sessionCount > 0),
    [exams.data]
  );
  const data = analysis.data;

  const download = () => {
    if (!data) return;
    try {
      const blob = new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `item-analysis-${data.exam.title.replace(/[^\w-]+/g, '_')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not create the CSV file.');
    }
  };

  return (
    <DashboardLayout role="teacher" pageTitle="Item Analysis">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="How did students actually find each question?"
            subtitle="After an exam, compare the difficulty you chose and the AI's prediction with real results."
          />
          <label className="block max-w-xl text-sm font-semibold">
            Assessment
            <select
              className="mt-1 w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm"
              value={examId}
              onChange={(event) => setParams(event.target.value ? { examId: event.target.value } : {})}
            >
              <option value="">Choose an assessment with submissions</option>
              {options.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subject.code} · {exam.title} ({exam.sessionCount} attempt
                  {exam.sessionCount === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </label>
          {exams.isSuccess && !options.length && (
            <p className="mt-3 text-sm text-text-3">No assessments have been taken yet.</p>
          )}
        </Card>

        {analysis.isError && (
          <Card>
            <p className="text-sm text-risk-high">The analysis could not be loaded.</p>
          </Card>
        )}
        {error && <p className="text-sm text-risk-high">{error}</p>}

        {data && (
          <>
            {!data.enoughStudents && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Only {data.students} graded attempt{data.students === 1 ? '' : 's'}. Item analysis is
                reliable from about {data.minimumStudents} students; treat these numbers as indicative.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Students analysed" value={String(data.students)} />
              <Summary label="Average score" value={`${data.meanScorePercent}%`} />
              <Summary
                label="Your difficulty matched reality"
                value={data.teacherAgreementPercent === null ? '—' : `${data.teacherAgreementPercent}%`}
              />
              <Summary
                label="AI prediction matched reality"
                value={data.aiAgreementPercent === null ? '—' : `${data.aiAgreementPercent}%`}
                note={data.aiPredictionsAvailable ? undefined : 'No AI review was run before publishing'}
              />
            </div>

            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <CardHeader title={data.exam.title} subtitle="One row per question" />
                <Button type="button" variant="ghost" icon={Download} onClick={download}>
                  Download CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-text-3">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Question</th>
                      <th className="px-4 py-3">p</th>
                      <th className="px-4 py-3">Actual</th>
                      <th className="px-4 py-3">You</th>
                      <th className="px-4 py-3">AI</th>
                      <th className="px-4 py-3">D (discrimination)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.questionId} className="border-t border-border align-top">
                        <td className="px-4 py-3 font-semibold">{item.order}</td>
                        <td className="max-w-xs px-4 py-3">
                          <span className="block truncate">{item.prompt}</span>
                          <span className="text-xs text-text-3">
                            {item.type.replace(/_/g, ' ').toLowerCase()} · {item.responses} responses
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.difficultyIndex.toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold">{LEVEL[item.actualDifficulty]}</td>
                        <td className={`px-4 py-3 ${item.teacherMatches ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {LEVEL[item.teacherDifficulty]} {item.teacherMatches ? '✓' : '✗'}
                        </td>
                        <td
                          className={`px-4 py-3 ${item.aiMatches === null ? 'text-text-3' : item.aiMatches ? 'text-emerald-700' : 'text-amber-700'}`}
                        >
                          {item.aiDifficulty ? `${LEVEL[item.aiDifficulty]} ${item.aiMatches ? '✓' : '✗'}` : '—'}
                        </td>
                        <td className={`px-4 py-3 ${DISCRIMINATION[item.discriminationLabel].tone}`}>
                          {item.discrimination.toFixed(2)} · {DISCRIMINATION[item.discriminationLabel].label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader title="How these numbers are computed" />
              <ul className="list-disc space-y-1 pl-5 text-sm text-text-2">
                <li>
                  <b>Difficulty index (p)</b>: the average share of the question's points students earned.
                  Above 0.70 is Easy, 0.30–0.70 Medium, below 0.30 Hard.
                </li>
                <li>
                  <b>Discrimination (D)</b>: the top 27% of students' average on the question minus the
                  bottom 27%'s. 0.40+ very good, 0.30–0.39 good, 0.20–0.29 fair, below 0.20 poor (Ebel). A
                  negative value usually means a wrong answer key or a misleading question.
                </li>
                <li>Unanswered questions count as 0; essays are included once graded.</li>
                <li>
                  "AI" is the difficulty the AI review predicted before publishing; this page checks that
                  prediction against real results.
                </li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold text-text-3">{label}</p>
      <p className="mt-1 text-2xl font-black text-text-1">{value}</p>
      {note && <p className="mt-1 text-xs text-text-3">{note}</p>}
    </Card>
  );
}
