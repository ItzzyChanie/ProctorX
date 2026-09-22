import { useEffect, useMemo, useState } from 'react';
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
    yearLevel: string;
    sectionName: string;
    section: string;
    rate: number;
    participantCount: number;
    flaggedStudentCount: number;
  }>;
  sessionDrilldown: Array<{
    sessionId: string;
    studentName: string;
    studentId: string | null;
    program: string | null;
    yearLevel: string | null;
    section: string;
    subjectCode: string;
    subjectName: string;
    examTitle: string;
    startedAt: string;
    reviewDecision: string;
    suspicion: number | null;
    incidentCount: number;
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
const startedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

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
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionReview, setSessionReview] = useState('');
  const [sessionRisk, setSessionRisk] = useState('');
  const [sessionRows, setSessionRows] = useState(10);
  const [sessionPage, setSessionPage] = useState(1);
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v)
  );
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dean-analytics', params],
    queryFn: async () =>
      (await api.get<Data>('/dean/analytics', { params })).data,
  });
  const filteredSessions = useMemo(() => {
    const search = sessionSearch.trim().toLowerCase();
    return (data?.sessionDrilldown ?? []).filter((session) => {
      const matchesSearch =
        !search ||
        [
          session.studentName,
          session.studentId ?? '',
          session.program ?? '',
          session.section,
          session.subjectCode,
          session.subjectName,
          session.examTitle,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);
      const matchesReview =
        !sessionReview || session.reviewDecision === sessionReview;
      const score = session.suspicion;
      const matchesRisk =
        !sessionRisk ||
        (sessionRisk === 'HIGH' && score !== null && score >= 70) ||
        (sessionRisk === 'MEDIUM' &&
          score !== null &&
          score >= 40 &&
          score < 70) ||
        (sessionRisk === 'LOW' && score !== null && score < 40) ||
        (sessionRisk === 'PENDING' && score === null);
      return matchesSearch && matchesReview && matchesRisk;
    });
  }, [data?.sessionDrilldown, sessionReview, sessionRisk, sessionSearch]);
  const sessionPageCount = Math.max(
    1,
    Math.ceil(filteredSessions.length / sessionRows)
  );
  const visibleSessions = filteredSessions.slice(
    (sessionPage - 1) * sessionRows,
    sessionPage * sessionRows
  );
  useEffect(() => {
    setSessionPage((page) => Math.min(page, sessionPageCount));
  }, [sessionPageCount]);
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
              <Bar
                dataKey="rate"
                className="cursor-pointer"
                onClick={(entry: any) => {
                  const selected = entry.payload ?? entry;
                  setFilters({
                    ...filters,
                    program: selected.program,
                    yearLevel: selected.yearLevel,
                    section: selected.sectionName,
                  });
                }}
              >
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
              <option value="">Active semester</option>
              <option value="ALL">All academic semesters</option>
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
        <Card padded={false}>
          <div className="p-5">
            <CardHeader
              title="Session drill-down"
              subtitle="Default: active semester and all terms. Up to 100 sessions, ordered by suspicion score."
              right={
                Object.values(filters).some(Boolean) ? (
                  <button
                    className="text-sm font-semibold text-brand"
                    onClick={() =>
                      setFilters({
                        academicPeriodId: '',
                        term: '',
                        dateFrom: '',
                        dateTo: '',
                        program: '',
                        yearLevel: '',
                        section: '',
                        subjectCode: '',
                      })
                    }
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
            <p className="text-xs text-text-3">
              Tip: select a section bar above to drill into that section.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <input
                value={sessionSearch}
                onChange={(event) => {
                  setSessionSearch(event.target.value);
                  setSessionPage(1);
                }}
                placeholder="Search sessions"
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              />
              <select
                value={sessionReview}
                onChange={(event) => {
                  setSessionReview(event.target.value);
                  setSessionPage(1);
                }}
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              >
                <option value="">All reviews</option>
                <option value="PENDING">Pending</option>
                <option value="POSITIVE">Positive</option>
                <option value="NEGATIVE">Negative</option>
              </select>
              <select
                value={sessionRisk}
                onChange={(event) => {
                  setSessionRisk(event.target.value);
                  setSessionPage(1);
                }}
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              >
                <option value="">All risk levels</option>
                <option value="HIGH">High (70+)</option>
                <option value="MEDIUM">Medium (40-69)</option>
                <option value="LOW">Low (below 40)</option>
                <option value="PENDING">Pending score</option>
              </select>
              <select
                aria-label="Rows per page"
                value={sessionRows}
                onChange={(event) => {
                  setSessionRows(Number(event.target.value));
                  setSessionPage(1);
                }}
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
              >
                {[10, 25, 50, 100].map((count) => (
                  <option key={count} value={count}>
                    {count} rows
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
                <tr>
                  {[
                    'Student',
                    'Program / Section',
                    'Subject',
                    'Assessment',
                    'Suspicion',
                    'Incidents',
                    'Review',
                    'Started',
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((session) => (
                  <tr
                    key={session.sessionId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-1">
                        {session.studentName}
                      </p>
                      <p className="text-xs text-text-3">
                        {session.studentId ?? 'No student ID'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {session.program ?? 'Unknown'}
                      <span aria-hidden="true"> &bull; </span>
                      {session.section}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{session.subjectCode}</p>
                      <p className="text-xs text-text-3">
                        {session.subjectName}
                      </p>
                    </td>
                    <td className="px-4 py-3">{session.examTitle}</td>
                    <td className="px-4 py-3">
                      {session.suspicion === null
                        ? 'Pending'
                        : session.suspicion + '%'}
                    </td>
                    <td className="px-4 py-3">{session.incidentCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'rounded-full px-2 py-1 text-xs font-semibold ' +
                          (session.reviewDecision === 'POSITIVE'
                            ? 'bg-red-100 text-red-700'
                            : session.reviewDecision === 'NEGATIVE'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700')
                        }
                      >
                        {session.reviewDecision}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-3">
                      {startedFormatter.format(new Date(session.startedAt))}
                    </td>
                  </tr>
                ))}
                {!visibleSessions.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-text-3"
                    >
                      No sessions match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm text-text-3">
            <span>
              {filteredSessions.length
                ? `${(sessionPage - 1) * sessionRows + 1}-${Math.min(
                    sessionPage * sessionRows,
                    filteredSessions.length
                  )} of ${filteredSessions.length}`
                : '0 sessions'}
            </span>
            <div className="flex items-center gap-3">
              <button
                disabled={sessionPage === 1}
                onClick={() => setSessionPage((page) => page - 1)}
                className="rounded-lg border border-border px-3 py-2 font-semibold text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {sessionPage} of {sessionPageCount}
              </span>
              <button
                disabled={sessionPage === sessionPageCount}
                onClick={() => setSessionPage((page) => page + 1)}
                className="rounded-lg border border-border px-3 py-2 font-semibold text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
