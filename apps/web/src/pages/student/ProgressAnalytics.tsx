import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock3, Target, TrendingUp } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { axisProps, tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';

type Period = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
};
type Attempt = {
  sessionId: string;
  examTitle: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  term: string;
  academicPeriod: Period;
  submittedAt: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeMinutes: number;
};
type Analytics = {
  attempts: Attempt[];
  subjects: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    attempts: number;
    averageScore: number;
    totalTimeMinutes: number;
  }[];
};
export default function ProgressAnalytics() {
  const { dark } = useTheme();
  const palette = useChartPalette(dark);
  const [subjectId, setSubjectId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [term, setTerm] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-analytics'],
    queryFn: async () =>
      (await api.get<Analytics>('/students/me/analytics')).data,
    refetchInterval: 30_000,
  });
  const attempts = useMemo(
    () =>
      (data?.attempts ?? []).filter(
        (item) =>
          (!subjectId || item.subjectId === subjectId) &&
          (!periodId || item.academicPeriod.id === periodId) &&
          (!term || item.term === term)
      ),
    [data, subjectId, periodId, term]
  );
  const subjects = [
    ...new Map(
      (data?.attempts ?? []).map((item) => [
        item.subjectId,
        { id: item.subjectId, code: item.subjectCode, name: item.subjectName },
      ])
    ).values(),
  ];
  const periods = [
    ...new Map(
      (data?.attempts ?? []).map((item) => [
        item.academicPeriod.id,
        item.academicPeriod,
      ])
    ).values(),
  ];
  const average = attempts.length
    ? Math.round(
        attempts.reduce((sum, item) => sum + item.percentage, 0) /
          attempts.length
      )
    : 0;
  const totalTime = attempts.reduce((sum, item) => sum + item.timeMinutes, 0);
  return (
    <DashboardLayout role="student" pageTitle="Progress Analytics">
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Performance filters"
            subtitle="Analyze confirmed results by subject, semester, and term"
          />
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} · {subject.name}
                </option>
              ))}
            </select>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All semesters</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.academicYear} ·{' '}
                  {period.semester === 'FIRST' ? 'First' : 'Second'} Semester
                </option>
              ))}
            </select>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All terms</option>
              <option value="PRELIMINARY">Preliminary</option>
              <option value="MIDTERM">Midterm</option>
              <option value="SEMI_FINAL">Semi-final</option>
              <option value="FINAL">Final</option>
            </select>
          </div>
        </Card>
        {isLoading && <Card>Loading analytics…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">Could not load analytics.</span>
          </Card>
        )}
        {!isLoading && !isError && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <Target className="text-brand" size={20} />
                <div className="mt-2 text-3xl font-bold">{average}%</div>
                <div className="text-xs text-text-3">Average score</div>
              </Card>
              <Card>
                <TrendingUp className="text-brand" size={20} />
                <div className="mt-2 text-3xl font-bold">{attempts.length}</div>
                <div className="text-xs text-text-3">Confirmed assessments</div>
              </Card>
              <Card>
                <Clock3 className="text-brand" size={20} />
                <div className="mt-2 text-3xl font-bold">{totalTime}m</div>
                <div className="text-xs text-text-3">Time spent</div>
              </Card>
            </div>
            <Card>
              <CardHeader
                title="Score trend"
                subtitle="Confirmed scores in submission order"
              />
              {attempts.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={attempts}>
                    <CartesianGrid vertical={false} stroke={palette.border} />
                    <XAxis dataKey="examTitle" {...axisProps(palette)} />
                    <YAxis domain={[0, 100]} {...axisProps(palette)} />
                    <Tooltip {...tooltipProps(palette)} />
                    <Area
                      type="monotone"
                      dataKey="percentage"
                      stroke={palette.brand}
                      fill={palette.brand}
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-2">
                  No confirmed results match these filters.
                </p>
              )}
            </Card>
            <Card>
              <CardHeader title="Performance by subject" />
              {subjects.map((subject) => {
                const rows = attempts.filter(
                  (item) => item.subjectId === subject.id
                );
                if (!rows.length) return null;
                const avg = Math.round(
                  rows.reduce((sum, item) => sum + item.percentage, 0) /
                    rows.length
                );
                const minutes = rows.reduce(
                  (sum, item) => sum + item.timeMinutes,
                  0
                );
                return (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between border-t border-border py-3 first:border-0"
                  >
                    <div>
                      <div className="font-semibold">
                        {subject.code} · {subject.name}
                      </div>
                      <div className="text-xs text-text-3">
                        {rows.length} assessment{rows.length === 1 ? '' : 's'} ·{' '}
                        {minutes} minutes
                      </div>
                    </div>
                    <div className="text-xl font-bold text-brand">{avg}%</div>
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
