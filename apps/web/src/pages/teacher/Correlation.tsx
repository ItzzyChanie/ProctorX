import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { api } from '../../lib/api';
import { axisProps, tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';

type Exam = {
  id: string;
  title: string;
  subject: { code: string };
  _count: { sessions: number };
};
type Result = {
  slope: number;
  intercept: number;
  r: number;
  r_squared: number;
  p_value: number;
  pairs: { suspicion_score: number; exam_score: number }[];
};
export default function Correlation() {
  const { dark } = useTheme(),
    p = useChartPalette(dark);
  const [exams, setExams] = useState<Exam[]>([]),
    [examId, setExamId] = useState(''),
    [result, setResult] = useState<Result | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    void api
      .get<Exam[]>('/sessions/monitorable-exams')
      .then(({ data }) => setExams(data))
      .catch(() => setMessage('Could not load your exams.'));
  }, []);
  useEffect(() => {
    if (!examId) {
      setResult(null);
      return;
    }
    setMessage('Loading native graded results…');
    void api
      .get<Result>(`/reports/exams/${examId}/correlation`)
      .then(({ data }) => {
        setResult(data);
        setMessage('');
      })
      .catch((error) =>
        setMessage(
          error.response?.data?.message ??
            'At least two teacher-confirmed submissions with suspicion scores are required.'
        )
      );
  }, [examId]);
  const line = useMemo(
    () =>
      result
        ? [
            { suspicion_score: 0, exam_score: result.intercept },
            {
              suspicion_score: 100,
              exam_score: result.intercept + result.slope * 100,
            },
          ]
        : [],
    [result]
  );
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Score Correlation"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <label className="text-sm text-text-2">
            Exam{' '}
            <select
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
              className="ml-2 min-w-72 rounded border border-border bg-surface p-2 text-text-1"
            >
              <option value="">Select a fully graded exam…</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subject.code} — {exam.title}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm text-text-2">
            Uses ProctorX’s own teacher-confirmed grades and final suspicion
            snapshots. No CSV or external scoring source is used.
          </p>
        </Card>
        {message && (
          <Card>
            <p className="text-sm text-text-2">{message}</p>
          </Card>
        )}
        {result && (
          <Card>
            <div className="mb-4">
              <h2 className="font-head text-[15px] font-semibold text-text-1">
                Suspicion vs. exam performance
              </h2>
              <p className="text-sm text-text-2">
                {result.pairs.length} fully graded student sessions
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid stroke={p.border} />
                <XAxis
                  type="number"
                  dataKey="suspicion_score"
                  domain={[0, 100]}
                  name="Suspicion"
                  {...axisProps(p)}
                />
                <YAxis
                  type="number"
                  dataKey="exam_score"
                  domain={[0, 100]}
                  name="Exam score"
                  {...axisProps(p)}
                />
                <Tooltip {...tooltipProps(p)} />
                <Scatter data={result.pairs} fill={p.brand} />
                <Line
                  data={line}
                  type="linear"
                  dataKey="exam_score"
                  stroke={p.riskHigh}
                  strokeWidth={2}
                  dot={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <span>
                r: <b>{result.r.toFixed(3)}</b>
              </span>
              <span>
                R²: <b>{result.r_squared.toFixed(3)}</b>
              </span>
              <span>
                Slope: <b>{result.slope.toFixed(3)}</b>
              </span>
              <span>
                p-value: <b>{result.p_value.toFixed(4)}</b>
              </span>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
