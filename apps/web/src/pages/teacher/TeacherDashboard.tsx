import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ResponsiveChart } from '../../components/charts/ResponsiveChart';
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  FileWarning,
  GraduationCap,
  Layers3,
  Shield,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { HeroBanner } from '../../components/ui/HeroBanner';
import { Button } from '../../components/ui/Button';
import { KPI } from '../../components/ui/KPI';
import {
  ScopeField,
  ScopeHeader,
  scopeControlClass,
} from '../../components/ui/ScopeField';
import { useIsPhone } from '../../lib/useMediaQuery';
import { SuspicionMeter } from '../../components/ui/SuspicionMeter';
import {
  axisProps,
  INCIDENT_COLORS,
  tooltipProps,
} from '../../components/charts/chartTheme';
import { useChartPalette, riskTier } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
type Data = {
  kpis: {
    activeSessionsNow: number;
    studentsMonitoredToday: number;
    avgSuspicionScore: number;
    flaggedIncidentsLast7Days: number;
  };
  avgSuspicionBySection: { section: string; avg: number }[];
  incidentRateBySection: { section: string; rate: number }[];
  avgSuspicionBySubject: { subject: string; avg: number }[];
  incidentTypeBreakdown: { type: string; count: number }[];
  liveSuspicionTrend: { sampledAt: string; score: number }[];
  highestRiskRightNow: { studentName: string; score: number }[];
  termComparison: {
    term: string;
    sessions: number;
    incidentRate: number;
    avgSuspicion: number;
  }[];
  filterOptions: {
    subjects: { id: string; subjectCode: string; name: string }[];
    sections: {
      id: string;
      name: string;
      program: string;
      yearLevel: string;
    }[];
    periods: {
      id: string;
      academicYear: string;
      semester: 'FIRST' | 'SECOND';
      status: 'ACTIVE' | 'CLOSED';
    }[];
  };
};
export default function TeacherDashboard() {
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    nav = useNavigate(),
    client = useQueryClient(),
    isPhone = useIsPhone();
  const [filters, setFilters] = useState({
    academicPeriodId: '',
    term: '',
    subjectId: '',
    program: '',
    yearLevel: '',
    sectionId: '',
    dateFrom: '',
    dateTo: '',
  });
  const query = useMemo(
    () =>
      new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v)
      ).toString(),
    [filters]
  );
  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher-dashboard', query],
    queryFn: async () =>
      (await api.get<Data>(`/teacher/dashboard${query ? `?${query}` : ''}`))
        .data,
    refetchInterval: 5_000,
  });
  useEffect(() => {
    const refresh = () =>
      client.invalidateQueries({ queryKey: ['teacher-dashboard'] });
    socket.connect();
    socket.on('monitor:update', refresh);
    return () => {
      socket.off('monitor:update', refresh);
      socket.disconnect();
    };
  }, [client]);
  const k = data?.kpis;
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Dashboard"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        {isLoading && <Card>Loading dashboard…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Could not load the teacher dashboard.
            </span>
          </Card>
        )}
        <HeroBanner
          eyebrow="Live monitoring"
          title={
            (k?.activeSessionsNow ?? 0) > 0
              ? `${k?.activeSessionsNow} active session${k?.activeSessionsNow === 1 ? '' : 's'}`
              : 'No active sessions'
          }
          subtitle="Live suspicion and incidents update from the monitoring gateway."
          stat={k?.avgSuspicionScore ?? 0}
          statLabel="Avg. suspicion score"
          cta={
            <Button
              variant="ghost"
              icon={Video}
              className="!bg-white/15 !text-white !border-white/35 hover:!bg-white/25 hover:!border-white/60 hover:shadow-lg"
              onClick={() => nav('/teacher/monitoring')}
            >
              Open live monitoring
            </Button>
          }
        />
        <Card>
          <ScopeHeader
            title="Dashboard scope"
            subtitle="All overview totals and charts use these same filters."
            onClear={() =>
              setFilters({
                academicPeriodId: '',
                term: '',
                subjectId: '',
                program: '',
                yearLevel: '',
                sectionId: '',
                dateFrom: '',
                dateTo: '',
              })
            }
          />
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <Filter
              icon={CalendarRange}
              label="Academic semester"
              value={filters.academicPeriodId}
              onChange={(v) =>
                setFilters((x) => ({ ...x, academicPeriodId: v }))
              }
            >
              <option value="">All semesters</option>
              {data?.filterOptions.periods.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.academicYear} ·{' '}
                  {x.semester === 'FIRST' ? 'First' : 'Second'} Semester
                  {x.status === 'CLOSED' ? ' (Closed)' : ''}
                </option>
              ))}
            </Filter>
            <Filter
              icon={CalendarClock}
              label="Term"
              value={filters.term}
              onChange={(v) => setFilters((x) => ({ ...x, term: v }))}
            >
              <option value="">All terms</option>
              <option value="PRELIMINARY">Preliminary</option>
              <option value="MIDTERM">Midterm</option>
              <option value="SEMI_FINAL">Semi-final</option>
              <option value="FINAL">Final</option>
              <option value="UNSPECIFIED">Legacy / Unspecified</option>
            </Filter>
            <Filter
              icon={BookOpen}
              label="Subject"
              value={filters.subjectId}
              onChange={(v) => setFilters((x) => ({ ...x, subjectId: v }))}
            >
              <option value="">All subjects</option>
              {data?.filterOptions.subjects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.subjectCode}
                </option>
              ))}
            </Filter>
            <Filter
              icon={GraduationCap}
              label="Program"
              value={filters.program}
              onChange={(v) =>
                setFilters((x) => ({ ...x, program: v, sectionId: '' }))
              }
            >
              <option value="">All programs</option>
              {[
                ...new Set([
                  'CS',
                  'IT',
                  ...(data?.filterOptions.sections.map((x) => x.program) ?? []),
                ]),
              ].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Filter>
            <Filter
              icon={Layers3}
              label="Year level"
              value={filters.yearLevel}
              onChange={(v) =>
                setFilters((x) => ({ ...x, yearLevel: v, sectionId: '' }))
              }
            >
              <option value="">All years</option>
              {['1st', '2nd', '3rd', '4th'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Filter>
            <Filter
              icon={Users}
              label="Section"
              value={filters.sectionId}
              onChange={(v) => setFilters((x) => ({ ...x, sectionId: v }))}
            >
              <option value="">All sections</option>
              {data?.filterOptions.sections
                .filter(
                  (x) =>
                    (!filters.program || x.program === filters.program) &&
                    (!filters.yearLevel || x.yearLevel === filters.yearLevel)
                )
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.program} · {x.yearLevel} - {x.name}
                  </option>
                ))}
            </Filter>
            <ScopeField label="From date" icon={CalendarDays}>
              <input
                type="date"
                aria-label="From date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((x) => ({ ...x, dateFrom: e.target.value }))
                }
                className={scopeControlClass}
              />
            </ScopeField>
            <ScopeField label="To date" icon={CalendarCheck}>
              <input
                type="date"
                aria-label="To date"
                value={filters.dateTo}
                min={filters.dateFrom}
                onChange={(e) =>
                  setFilters((x) => ({ ...x, dateTo: e.target.value }))
                }
                className={scopeControlClass}
              />
            </ScopeField>
          </div>
        </Card>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(4,1fr)' }}
        >
          <KPI
            label="Active sessions now"
            value={k?.activeSessionsNow ?? 0}
            icon={Video}
            accent={0}
          />
          <KPI
            label="Students monitored today"
            value={k?.studentsMonitoredToday ?? 0}
            icon={Users}
            accent={1}
          />
          <KPI
            label="Avg. suspicion score"
            value={k?.avgSuspicionScore ?? 0}
            icon={Shield}
            accent={2}
          />
          <KPI
            label="Flagged incidents (7d)"
            value={k?.flaggedIncidentsLast7Days ?? 0}
            icon={FileWarning}
            accent={3}
          />
        </div>
        <Card>
          <CardHeader
            title="Term comparison"
            subtitle="Historical term data remains available when a new term begins."
          />
          {data?.termComparison.length ? (
            <ResponsiveChart width="100%" height={240}>
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
            </ResponsiveChart>
          ) : (
            <p className="text-sm text-text-2">No term data yet.</p>
          )}
        </Card>
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.4fr 1fr' }}
        >
          <Card>
            <CardHeader
              title="Incident rate by Year level & section"
              subtitle="A session is counted once when it contains one or more incidents."
            />
            {data?.incidentRateBySection.length ? (
              <ResponsiveChart
                width="100%"
                className="chart-tall"
                height={Math.max(240, data.incidentRateBySection.length * 38)}
              >
                <BarChart
                  data={data.incidentRateBySection}
                  layout="vertical"
                  margin={{ left: isPhone ? 0 : 55 }}
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
                    dataKey="section"
                    width={isPhone ? 84 : 145}
                    {...axisProps(p)}
                  />
                  <Tooltip {...tooltipProps(p)} />
                  <Bar dataKey="rate" fill={p.brand} />
                </BarChart>
              </ResponsiveChart>
            ) : (
              <p className="text-sm text-text-2">
                No sessions match this scope.
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Average suspicion by subject" />
            {data?.avgSuspicionBySubject.length ? (
              <ResponsiveChart width="100%" height={240}>
                <BarChart data={data.avgSuspicionBySubject}>
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="subject" {...axisProps(p)} />
                  <YAxis domain={[0, 100]} {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Bar dataKey="avg" fill={p.brand} />
                </BarChart>
              </ResponsiveChart>
            ) : (
              <p className="text-sm text-text-2">
                No scored sessions match this scope.
              </p>
            )}
          </Card>
        </div>
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.4fr 1fr' }}
        >
          <Card>
            <CardHeader title="Average suspicion by section" />
            {data?.avgSuspicionBySection.length ? (
              <ResponsiveChart width="100%" height={230}>
                <BarChart data={data.avgSuspicionBySection}>
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="section" {...axisProps(p)} />
                  <YAxis domain={[0, 100]} {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Bar dataKey="avg">
                    {data.avgSuspicionBySection.map((d, i) => (
                      <Cell key={i} fill={riskTier(d.avg, p).color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveChart>
            ) : (
              <p className="text-sm text-text-2">No sessions yet.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Incident types" subtitle="Last 7 days" />
            {data?.incidentTypeBreakdown.length ? (
              <ResponsiveChart width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={data.incidentTypeBreakdown.map((x) => ({
                      name: x.type,
                      value: x.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                  >
                    {data.incidentTypeBreakdown.map((_, i) => (
                      <Cell key={i} fill={INCIDENT_COLORS(p)[i]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps(p)} />
                </PieChart>
              </ResponsiveChart>
            ) : (
              <p className="text-sm text-text-2">No incidents yet.</p>
            )}
          </Card>
        </div>
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.4fr 1fr' }}
        >
          <Card>
            <CardHeader title="Live suspicion trend" />
            {data?.liveSuspicionTrend.length ? (
              <ResponsiveChart width="100%" height={200}>
                <AreaChart
                  data={data.liveSuspicionTrend.map((x) => ({
                    t: new Date(x.sampledAt).toLocaleTimeString(),
                    score: x.score,
                  }))}
                >
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="t" {...axisProps(p)} />
                  <YAxis domain={[0, 100]} {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={p.riskMed}
                    fill={p.riskMed}
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveChart>
            ) : (
              <p className="text-sm text-text-2">No active score samples.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Highest risk right now" />
            {data?.highestRiskRightNow.length ? (
              data.highestRiskRightNow.map((x) => (
                <div key={x.studentName} className="mb-3">
                  <div className="text-sm font-semibold">{x.studentName}</div>
                  <SuspicionMeter score={x.score} size="sm" />
                </div>
              ))
            ) : (
              <p className="text-sm text-text-2">No active sessions.</p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Filter({
  label,
  icon,
  value,
  onChange,
  children,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <ScopeField label={label} icon={icon}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={scopeControlClass}
      >
        {children}
      </select>
    </ScopeField>
  );
}
