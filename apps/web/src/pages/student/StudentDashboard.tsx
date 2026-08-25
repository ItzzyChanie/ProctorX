import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { HeroBanner } from '../../components/ui/HeroBanner';
import { axisProps, tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';
type Dashboard = {
  monitoringClientStatus: string;
  upcomingSessions: { examTitle: string; startsAt: string }[];
  recentActivity: { text: string; occurredAt: string }[];
  scoreHistory: { examTitle: string; score: number; maxScore: number }[];
  sessionTimeMinutes: { examTitle: string; minutes: number }[];
};
export default function StudentDashboard() {
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    { user } = useAuthStore(),
    navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () =>
      (await api.get<Dashboard>('/students/me/dashboard')).data,
    refetchInterval: 5_000,
  });
  const scores =
    data?.scoreHistory.map((x, i) => ({
      term: `#${i + 1}`,
      score: Math.round((x.score / x.maxScore) * 100),
    })) ?? [];
  const time =
    data?.sessionTimeMinutes.map((x) => ({
      session: x.examTitle,
      mins: x.minutes,
    })) ?? [];
  return (
    <DashboardLayout
      role="student"
      pageTitle="Dashboard"
      userName={user?.fullName ?? 'Student'}
      userTag="Student"
    >
      <div className="flex flex-col gap-5">
        {isLoading && <Card>Loading dashboard…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Could not load your dashboard.
            </span>
          </Card>
        )}
        <HeroBanner
          eyebrow="Welcome back"
          title={
            data?.upcomingSessions[0]?.examTitle ??
            'Ready for your next assessment'
          }
          subtitle={`Monitoring client: ${data?.monitoringClientStatus ?? 'checking'}`}
          stat={scores.at(-1)?.score ?? '—'}
          statLabel="Latest exam score"
          cta={
            <Button
              variant="ghost"
              icon={LogIn}
              className="!bg-white/15 !text-white !border-white/35 hover:!bg-white/25 hover:!border-white/60 hover:shadow-lg"
              onClick={() => navigate('/student/join')}
            >
              Go to join session
            </Button>
          }
        />
        <div className="grid gap-5" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Exam score history"
                subtitle="Teacher-confirmed results"
              />
              {scores.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={scores}>
                    <defs>
                      <linearGradient
                        id="scoreFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={p.brand}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={p.brand}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={p.border} vertical={false} />
                    <XAxis dataKey="term" {...axisProps(p)} />
                    <YAxis domain={[0, 100]} {...axisProps(p)} />
                    <Tooltip {...tooltipProps(p)} />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke={p.brand}
                      fill="url(#scoreFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-2">No released scores yet.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Time spent per session" />
              {time.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={time}>
                    <CartesianGrid stroke={p.border} vertical={false} />
                    <XAxis dataKey="session" {...axisProps(p)} />
                    <YAxis unit="m" {...axisProps(p)} />
                    <Tooltip {...tooltipProps(p)} />
                    <Bar dataKey="mins" fill={p.cyan} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-2">
                  No completed sessions yet.
                </p>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Upcoming sessions" />
              {data?.upcomingSessions.length ? (
                <>
                  {data.upcomingSessions.map((x) => (
                    <div
                      key={x.examTitle}
                      className="flex justify-between py-2"
                    >
                      <span>{x.examTitle}</span>
                      <Clock size={15} />
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-text-2">No upcoming sessions.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
              {data?.recentActivity.length ? (
                data.recentActivity.map((x) => (
                  <div
                    key={`${x.text}${x.occurredAt}`}
                    className="py-2 text-sm"
                  >
                    <span>{x.text}</span>
                    <small className="ml-2 text-text-3">
                      {new Date(x.occurredAt).toLocaleString()}
                    </small>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-2">No recent activity.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
