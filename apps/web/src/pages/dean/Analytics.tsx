import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { axisProps, tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette, riskTier } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';
import { notificationSocket } from '../../lib/socket';
type Data = {
  academicPeriods: {
    id: string;
    academicYear: string;
    semester: string;
    status: string;
  }[];
  termComparison: {
    term: string;
    sessions: number;
    incidentRate: number;
    avgSuspicion: number;
  }[];
  incidenceRateBySection: Array<{
    program: string;
    section: string;
    rate: number;
    participantCount: number;
    flaggedStudentCount: number;
  }>;
  correlation: {
    points: Array<{
      suspicion: number;
      performance: number;
    }>;
    regressionLine: Array<{
      suspicion: number;
      performance: number;
    }> | null;
    insufficientData: boolean;
  };
};
export default function Analytics() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['dean-analytics'] });
    notificationSocket.on('integrity:review-updated', refresh);
    return () => { notificationSocket.off('integrity:review-updated', refresh); };
  }, [queryClient]);
  const { dark } = useTheme(),
    p = useChartPalette(dark);
  const [filters, setFilters] = useState({
    academicPeriodId: '',
    term: '',
    dateFrom: '',
    dateTo: '',
    program: '',
    yearLevel: '',
    section: '',
    subjectCode: '',
  });
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v)
  );
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dean-analytics', params],
    queryFn: async () =>
      (await api.get<Data>('/dean/analytics', { params })).data,
  });
  const sectionRates = data?.incidenceRateBySection ?? [];
  const sectionRateChart = (program: 'CS' | 'IT') => {
    const programData = sectionRates.filter((item) => item.program === program);

    return (
      <Card>
        <CardHeader
          title={`Flagged ${program} student rate by Year level & section`}
          subtitle="Percentage of participating students with one or more recorded incidents. Each student is counted once."
        />
        {programData.length ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, programData.length * 42)}
          >
            <BarChart data={programData} layout="vertical">
              <CartesianGrid stroke={p.border} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                {...axisProps(p)}
              />
              <YAxis
                type="category"
                dataKey="section"
                width={155}
                interval={0}
                {...axisProps(p)}
              />
              <Tooltip
                {...tooltipProps(p)}
                formatter={(value, _name, item) => [
                  `${value}% (${item.payload.flaggedStudentCount} of ${item.payload.participantCount} students)`,
                  `Flagged ${program} student rate`,
                ]}
              />
              <Bar dataKey="rate">
                {programData.map((item, index) => (
                  <Cell key={index} fill={riskTier(item.rate, p).color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-text-2">
            No {program} section data matches the filters.
          </p>
        )}
      </Card>
    );
  };
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Analytics"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Analytics filters"
            subtitle="All charts and correlation use this same server-side scope."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={filters.academicPeriodId}
              onChange={(e) =>
                setFilters({ ...filters, academicPeriodId: e.target.value })
              }
              className="rounded border border-border p-2"
            >
              <option value="">All academic semesters</option>
              {data?.academicPeriods.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.academicYear} ·{' '}
                  {x.semester === 'FIRST' ? 'First' : 'Second'} Semester
                  {x.status === 'CLOSED' ? ' (Closed)' : ''}
                </option>
              ))}
            </select>
            <select
              value={filters.term}
              onChange={(e) => setFilters({ ...filters, term: e.target.value })}
              className="rounded border border-border p-2"
            >
              <option value="">All terms</option>
              <option value="PRELIMINARY">Preliminary</option>
              <option value="MIDTERM">Midterm</option>
              <option value="SEMI_FINAL">Semi-final</option>
              <option value="FINAL">Final</option>
              <option value="UNSPECIFIED">Legacy / Unspecified</option>
            </select>
            {(
              [
                ['dateFrom', 'date'],
                ['dateTo', 'date'],
                ['program', 'text'],
                ['yearLevel', 'text'],
                ['section', 'text'],
                ['subjectCode', 'text'],
              ] as const
            ).map(([key, type]) => (
              <input
                key={key}
                type={type}
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
                placeholder={key}
                className="rounded border border-border p-2"
              />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Term comparison"
            subtitle="Historical semester data remains available across all four terms."
          />
          {data?.termComparison.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={data.termComparison.map((x) => ({
                  ...x,
                  term: x.term.replace('_', ' '),
                }))}
              >
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="term" {...axisProps(p)} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar
                  dataKey="incidentRate"
                  name="Incident rate"
                  fill={p.violet}
                />
                <Bar
                  dataKey="avgSuspicion"
                  name="Avg. suspicion"
                  fill={p.cyan}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-2">No term data yet.</p>
          )}
        </Card>
        {isLoading && <Card>Loading analytics…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Could not load analytics for these filters.
            </span>
          </Card>
        )}
        <Card>
          <CardHeader
            title="Suspicion vs. performance"
            subtitle={
              data?.correlation.insufficientData
                ? 'Insufficient distinct, teacher-confirmed results for a regression line.'
                : 'Teacher-confirmed scores and final suspicion snapshots'
            }
          />
          {data?.correlation.points.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid stroke={p.border} />
                <XAxis
                  type="number"
                  dataKey="suspicion"
                  domain={[0, 100]}
                  {...axisProps(p)}
                />
                <YAxis
                  type="number"
                  dataKey="performance"
                  domain={[0, 100]}
                  {...axisProps(p)}
                />
                <Tooltip {...tooltipProps(p)} />
                <Scatter data={data.correlation.points} fill={p.violet} />
                {data.correlation.regressionLine && (
                  <Line
                    data={data.correlation.regressionLine}
                    type="linear"
                    dataKey="performance"
                    stroke={p.riskHigh}
                    dot={false}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-2">
              No confirmed graded sessions match the filters.
            </p>
          )}
        </Card>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {sectionRateChart('CS')}
          {sectionRateChart('IT')}
        </div>
      </div>
    </DashboardLayout>
  );
}
