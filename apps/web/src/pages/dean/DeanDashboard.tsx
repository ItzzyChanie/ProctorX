import { useQuery } from '@tanstack/react-query';
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
  incidenceRateBySection: { section: string; rate: number }[];
  incidentsByType: { type: string; count: number }[];
  incidenceRateTrend: { week: string; rate: number }[];
  incidenceRateBySubject: { subject: string; rate: number }[];
};
export default function DeanDashboard() {
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    nav = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dean-dashboard'],
    queryFn: async () => (await api.get<Data>('/dean/dashboard')).data,
    refetchInterval: 5_000,
  });
  const k = data?.kpis;
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
          subtitle="Department-wide figures from monitored sessions."
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
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.3fr 1fr' }}
        >
          <Card>
            <CardHeader title="Incident rate by section" />
            {data?.incidenceRateBySection.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data.incidenceRateBySection}>
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="section" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Bar dataKey="rate" fill={p.violet} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-2">No filtered session data.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Incidents by type" />
            {data?.incidentsByType.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={data.incidentsByType.map((x) => ({
                      name: x.type,
                      value: x.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                  >
                    {data.incidentsByType.map((_, i) => (
                      <Cell key={i} fill={INCIDENT_COLORS(p)[i]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps(p)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-2">No incidents recorded.</p>
            )}
          </Card>
        </div>
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
