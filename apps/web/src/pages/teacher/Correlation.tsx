import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
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
  status: string;
  endsAt: string | null;
  sessionCount: number;
  subject: { code: string };
  _count: { sessions: number };
  term?:string;
  academicPeriod?:{id:string;academicYear:string;semester:'FIRST'|'SECOND'};
};
type CorrelationPair = {
  suspicion_score: number;
  exam_score: number;
};
type Result = {
  pairs: CorrelationPair[];
  regressionLine: unknown[] | null;
  insufficientData: true;
} | {
  slope: number;
  intercept: number;
  r: number;
  r_squared: number;
  p_value: number;
  pairs: CorrelationPair[];
  regressionLine: unknown[];
  insufficientData: false;
};
export default function Correlation() {
  const { dark } = useTheme(),
    p = useChartPalette(dark);
  const [exams, setExams] = useState<Exam[]>([]),
    [examId, setExamId] = useState(''),
    [periodId,setPeriodId]=useState(''), [term,setTerm]=useState(''),
    [result, setResult] = useState<Result | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    const load = () => void api.get<Exam[]>('/sessions/monitorable-exams').then(({ data }) => {
      const now = Date.now();
      setExams(data.filter(exam => exam.sessionCount > 0 && (exam.status !== 'PUBLISHED' || (!!exam.endsAt && new Date(exam.endsAt).getTime() <= now))));
    }).catch(() => setMessage('Could not load your exams.'));
    load();
    const timer = window.setInterval(load, 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const periods=[...new Map(exams.filter(x=>x.academicPeriod).map(x=>[x.academicPeriod!.id,x.academicPeriod!])).values()];
  const visibleExams=exams.filter(x=>(!periodId||x.academicPeriod?.id===periodId)&&(!term||x.term===term));
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
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Score Correlation"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <div className="mb-4 grid gap-2 md:grid-cols-2"><select value={periodId} onChange={e=>{setPeriodId(e.target.value);setExamId('')}} className="rounded border border-border bg-surface p-2"><option value="">All semesters</option>{periods.map(x=><option key={x.id} value={x.id}>{x.academicYear} · {x.semester==='FIRST'?'First':'Second'} Semester</option>)}</select><select value={term} onChange={e=>{setTerm(e.target.value);setExamId('')}} className="rounded border border-border bg-surface p-2"><option value="">All terms</option><option value="PRELIMINARY">Preliminary</option><option value="MIDTERM">Midterm</option><option value="SEMI_FINAL">Semi-final</option><option value="FINAL">Final</option></select></div>
          <label className="text-sm text-text-2">
            Exam{' '}
            <select
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
              className="ml-2 min-w-72 rounded border border-border bg-surface p-2 text-text-1"
            >
              <option value="">Select a completed, fully graded exam…</option>
              {visibleExams.map((exam) => (
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
          {!exams.length && <p className="mt-3 text-sm text-text-3">The graph becomes available after an exam has ended and has graded submissions.</p>}
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
                {!result.insufficientData && (
                  <ReferenceLine
                    segment={[{ x: 0, y: result.intercept }, { x: 100, y: result.intercept + result.slope * 100 }]}
                    stroke={p.riskHigh}
                    strokeWidth={2}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
            {result.insufficientData ? (
              <p className="mt-4 text-sm text-text-2">
                A correlation requires at least two graded sessions with
                different suspicion scores.
              </p>
            ) : (
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
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
