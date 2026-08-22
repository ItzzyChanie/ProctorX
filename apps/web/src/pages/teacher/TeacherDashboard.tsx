import { useEffect } from 'react';
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileWarning, Shield, Users, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { HeroBanner } from '../../components/ui/HeroBanner';
import { Button } from '../../components/ui/Button';
import { KPI } from '../../components/ui/KPI';
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
  incidentTypeBreakdown: { type: string; count: number }[];
  liveSuspicionTrend: { sampledAt: string; score: number }[];
  highestRiskRightNow: { studentName: string; score: number }[];
};
export default function TeacherDashboard() {
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    nav = useNavigate(),
    client = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: async () => (await api.get<Data>('/teacher/dashboard')).data,
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
          title={`${k?.activeSessionsNow ?? 0} active session${k?.activeSessionsNow === 1 ? '' : 's'}`}
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
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.4fr 1fr' }}
        >
          <Card>
            <CardHeader title="Average suspicion by section" />
            {data?.avgSuspicionBySection.length ? (
              <ResponsiveContainer width="100%" height={230}>
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
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-2">No sessions yet.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Incident types" subtitle="Last 7 days" />
            {data?.incidentTypeBreakdown.length ? (
              <ResponsiveContainer width="100%" height={230}>
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
              </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height={200}>
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
              </ResponsiveContainer>
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
