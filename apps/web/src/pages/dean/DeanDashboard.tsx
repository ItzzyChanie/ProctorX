import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Shield,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { notificationSocket } from '../../lib/socket';
import { Card, CardHeader } from '../../components/ui/Card';
import { HeroBanner } from '../../components/ui/HeroBanner';
import { Button } from '../../components/ui/Button';
import { KPI } from '../../components/ui/KPI';
import {
  axisProps,
  INCIDENT_COLORS,
  tooltipProps,
} from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';
type Data = {
  kpis: {
    monitoredSessionsThisTerm: number;
    collegeWideAvgSuspicion: number;
    incidentRatePercent: number;
    sectionsAboveThreshold: number;
  };
  incidenceRateBySection: {
    program: string;
    yearLevel: string;
    sectionName: string;
    section: string;
    participantCount: number;
    flaggedStudentCount: number;
    rate: number;
  }[];
  incidentsByType: Array<{
    type: string;
    count: number;
  }>;
  incidenceRateTrend: Array<{
    week: string;
    rate: number;
  }>;
  incidenceRateBySubject: Array<{
    subject: string;
    rate: number;
  }>;
  termComparison: {
    term: string;
    sessions: number;
    incidentRate: number;
    avgSuspicion: number;
  }[];
  academicPeriods: AcademicPeriod[];
};
type AcademicPeriod = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
  status: 'ACTIVE' | 'CLOSED';
  startsAt?: string;
  endsAt?: string;
  _count: { exams: number };
};
export default function DeanDashboard() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ['dean-dashboard'] });
    notificationSocket.on('integrity:review-updated', refresh);
    return () => {
      notificationSocket.off('integrity:review-updated', refresh);
    };
  }, [queryClient]);
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    nav = useNavigate();
  const [filters, setFilters] = useState({ academicPeriodId: '', term: '' });
  const query = useMemo(
    () =>
      new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v)
      ).toString(),
    [filters]
  );
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dean-dashboard', query],
    queryFn: async () =>
      (await api.get<Data>(`/dean/dashboard${query ? `?${query}` : ''}`)).data,
    refetchInterval: 5_000,
  });
  const k = data?.kpis;
  const incidentColors = INCIDENT_COLORS(p);
  const incidentData =
    data?.incidentsByType.map((item, index) => ({
      name: item.type
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
      value: item.count,
      color: incidentColors[index % incidentColors.length],
    })) ?? [];
  const sectionChart = (program: 'CS' | 'IT', title: string) => {
    const rows =
      data?.incidenceRateBySection
        .filter((item) => item.program === program)
        .map((item) => ({
          ...item,
          label: item.section.replace(`${program} · `, ''),
        })) ?? [];
    return (
      <Card className="h-full">
        <CardHeader
          title={`${title} Flagged student rate by Year level & section`}
          subtitle="Percentage of participating students with one or more recorded incidents. Each student is counted once."
        />
        {rows.length ? (
          <div className="max-h-[520px] overflow-y-auto pr-2">
            <ResponsiveContainer
              width="100%"
              height={Math.max(260, rows.length * 44)}
            >
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ left: 12, right: 18 }}
              >
                <CartesianGrid stroke={p.border} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  {...axisProps(p)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  interval={0}
                  {...axisProps(p)}
                />
                <Tooltip
                  {...tooltipProps(p)}
                  formatter={(value, _name, item) => [
                    `${value}% (${item.payload.flaggedStudentCount} of ${item.payload.participantCount} students)`,
                    'Flagged student rate',
                  ]}
                />
                <Bar dataKey="rate" fill={p.violet} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-text-2">
            No {title} section data available.
          </p>
        )}
      </Card>
    );
  };
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Dashboard"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        {isLoading && <Card>Loading dashboard…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Could not load dean dashboard.
            </span>
          </Card>
        )}
        <HeroBanner
          eyebrow="School of Computer Studies"
          title="Academic integrity overview"
          subtitle="Overall figures across all programs, year levels, sections, and monitored sessions."
          stat={`${k?.incidentRatePercent ?? 0}%`}
          statLabel="Overall incident rate"
          cta={
            <Button
              variant="ghost"
              icon={FileText}
              className="!bg-white/15 !text-white !border-white/35 hover:!bg-white/25 hover:!border-white/60 hover:shadow-lg"
              onClick={() => nav('/dean/analytics')}
            >
              View full analytics
            </Button>
          }
        />
        <Card>
          <CardHeader
            title="Academic period scope"
            subtitle="Every chart and overview total follows the selected semester and term."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-semibold">
              Semester
              <select
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5"
                value={filters.academicPeriodId}
                onChange={(e) =>
                  setFilters((x) => ({
                    ...x,
                    academicPeriodId: e.target.value,
                  }))
                }
              >
                <option value="">Active semester</option>
                <option value="ALL">All semesters</option>
                {data?.academicPeriods.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.academicYear} ·{' '}
                    {x.semester === 'FIRST' ? 'First' : 'Second'} Semester
                    {x.status === 'CLOSED' ? ' (Closed)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Term
              <select
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5"
                value={filters.term}
                onChange={(e) =>
                  setFilters((x) => ({ ...x, term: e.target.value }))
                }
              >
                <option value="">All terms</option>
                <option value="PRELIMINARY">Preliminary</option>
                <option value="MIDTERM">Midterm</option>
                <option value="SEMI_FINAL">Semi-final</option>
                <option value="FINAL">Final</option>
                <option value="UNSPECIFIED">Legacy / Unspecified</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                variant="ghost"
                onClick={() => setFilters({ academicPeriodId: '', term: '' })}
              >
                Clear filters
              </Button>
            </div>
          </div>
        </Card>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(4,1fr)' }}
        >
          <KPI
            label="Monitored sessions"
            value={k?.monitoredSessionsThisTerm ?? 0}
            icon={Video}
            accent={0}
          />
          <KPI
            label="Avg. suspicion"
            value={k?.collegeWideAvgSuspicion ?? 0}
            icon={Shield}
            accent={2}
          />
          <KPI
            label="Incident rate"
            value={`${k?.incidentRatePercent ?? 0}%`}
            icon={FileWarning}
            accent={3}
          />
          <KPI
            label="Sections above threshold"
            value={k?.sectionsAboveThreshold ?? 0}
            icon={AlertTriangle}
            accent={1}
          />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {sectionChart('CS', 'CS')}
          {sectionChart('IT', 'IT')}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Incidents by type" />
            {incidentData.length ? (
              <div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={incidentData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius="74%"
                      >
                        {incidentData.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipProps(p)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div
                  className="mt-4 grid gap-x-5 gap-y-2 border-t border-border pt-4 sm:grid-cols-2"
                  aria-label="Incident type color legend"
                >
                  {incidentData.map((item) => (
                    <div
                      key={item.name}
                      className="flex min-w-0 items-center gap-2 text-sm"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-2">
                        {item.name}
                      </span>
                      <span className="font-semibold text-text-1">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-2">No incidents recorded.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Incidence-rate trend" subtitle="This semester" />
            {data?.incidenceRateTrend.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.incidenceRateTrend}>
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="week" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={p.brand}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-2">No trend data yet.</p>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader title="Incident rate by subject" />
          {data?.incidenceRateBySubject.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.incidenceRateBySubject}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="subject" {...axisProps(p)} />
                <YAxis {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="rate" fill={p.cyan} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-2">No subject data.</p>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Term comparison"
            subtitle="Compare incident rate and average suspicion without losing prior-term history."
          />
          {data?.termComparison.length ? (
            <ResponsiveContainer width="100%" height={240}>
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
                  fill={p.brand}
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
      </div>
    </DashboardLayout>
  );
}
