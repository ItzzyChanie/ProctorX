import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarClock, CalendarRange } from 'lucide-react';
import {
  ScopeField,
  ScopeHeader,
  scopeControlClass,
} from '../../components/ui/ScopeField';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ResponsiveChart } from '../../components/charts/ResponsiveChart';
import { Archive, Clock, LogIn, RotateCcw } from 'lucide-react';
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
  upcomingSessions: ({ examTitle: string; startsAt: string } & PeriodMeta)[];
  recentActivity: ({ id: string; text: string; occurredAt: string } & PeriodMeta)[];
  archivedActivity: ({ id: string; text: string; occurredAt: string } & PeriodMeta)[];
  scoreHistory: ({ examTitle: string; score: number; maxScore: number } & PeriodMeta)[];
  sessionTimeMinutes: ({ examTitle: string; minutes: number } & PeriodMeta)[];
  academicPeriods:{id:string;academicYear:string;semester:'FIRST'|'SECOND';status:string}[];
};
type PeriodMeta={term?:string;academicPeriod?:{id:string;academicYear:string;semester:'FIRST'|'SECOND'}};
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
export default function StudentDashboard() {
  const { dark } = useTheme(),
    p = useChartPalette(dark),
    { user } = useAuthStore(),
    navigate = useNavigate(),
    queryClient = useQueryClient();
  const [periodId,setPeriodId]=useState(''),[term,setTerm]=useState('');
  const [activityView, setActivityView] = useState<'active' | 'archived'>('active');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () =>
      (await api.get<Dashboard>('/students/me/dashboard')).data,
    refetchInterval: 5_000,
  });
  const inScope=(x:PeriodMeta)=>(!periodId||x.academicPeriod?.id===periodId)&&(!term||x.term===term);
  const scores =
    data?.scoreHistory.filter(inScope).map((x) => ({
      term: `${(x.term ?? 'PRELIMINARY').replace('_',' ')} · ${x.examTitle}`,
      score: Math.round((x.score / x.maxScore) * 100),
    })) ?? [];
  const time =
    data?.sessionTimeMinutes.filter(inScope).map((x) => ({
      session: x.examTitle,
      mins: x.minutes,
    })) ?? [];
  const upcoming=data?.upcomingSessions.filter(inScope)??[];
  const recent = (activityView === 'active'
    ? data?.recentActivity
    : data?.archivedActivity
  )?.filter(inScope) ?? [];
  const updateActivityArchive = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      api.patch(
        `/students/me/activities/${id}/${archive ? 'archive' : 'restore'}`
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
  });
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
            upcoming[0]?.examTitle ??
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
        <Card>
          <ScopeHeader
            title="Academic period scope"
            subtitle="Scores, session time, upcoming assessments, and recent activity use this selection."
            onClear={() => {
              setPeriodId('');
              setTerm('');
            }}
          />
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <ScopeField label="Semester" icon={CalendarRange}>
              <select aria-label="Semester" value={periodId} onChange={e=>setPeriodId(e.target.value)} className={scopeControlClass}><option value="">All semesters</option>{data?.academicPeriods?.map(x=><option key={x.id} value={x.id}>{x.academicYear} · {x.semester==='FIRST'?'First':'Second'} Semester{x.status==='CLOSED'?' (Closed)':''}</option>)}</select>
            </ScopeField>
            <ScopeField label="Term" icon={CalendarClock}>
              <select aria-label="Term" value={term} onChange={e=>setTerm(e.target.value)} className={scopeControlClass}><option value="">All terms</option><option value="PRELIMINARY">Preliminary</option><option value="MIDTERM">Midterm</option><option value="SEMI_FINAL">Semi-final</option><option value="FINAL">Final</option></select>
            </ScopeField>
          </div>
        </Card>
        <div className="grid gap-5" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Exam score history"
                subtitle="Teacher-confirmed results"
              />
              {scores.length ? (
                <ResponsiveChart width="100%" height={220}>
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
                </ResponsiveChart>
              ) : (
                <p className="text-sm text-text-2">No released scores yet.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Time spent per session" />
              {time.length ? (
                <ResponsiveChart width="100%" height={200}>
                  <BarChart data={time}>
                    <CartesianGrid stroke={p.border} vertical={false} />
                    <XAxis dataKey="session" {...axisProps(p)} />
                    <YAxis unit="m" {...axisProps(p)} />
                    <Tooltip {...tooltipProps(p)} />
                    <Bar dataKey="mins" fill={p.cyan} />
                  </BarChart>
                </ResponsiveChart>
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
              {upcoming.length ? (
                <>
                  {upcoming.map((x) => (
                    <div
                      key={`${x.examTitle}-${x.startsAt}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div>
                        <div>{x.examTitle}</div>
                        <div className="text-sm text-text-2">
                          {formatDateTime(x.startsAt)}
                        </div>
                      </div>
                      <Clock size={15} className="shrink-0" />
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-text-2">No upcoming sessions.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
              <div className="mb-2 flex gap-2">
                {(['active', 'archived'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activityView === view ? 'bg-brand text-white' : 'bg-surface-2 text-text-2 hover:text-text-1'}`}
                    onClick={() => setActivityView(view)}
                  >
                    {view === 'active' ? 'Active' : 'Archive'}
                  </button>
                ))}
              </div>
              {recent.length ? (
                recent.map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
                  >
                    <div>
                      <div>{x.text}</div>
                      <small className="text-text-3">
                        {formatDateTime(x.occurredAt)}
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      icon={activityView === 'active' ? Archive : RotateCcw}
                      className="shrink-0 !px-2.5 !py-2 hover:!border-blue-600 hover:!bg-blue-600 hover:!text-white"
                      disabled={updateActivityArchive.isPending}
                      onClick={() =>
                        updateActivityArchive.mutate({
                          id: x.id,
                          archive: activityView === 'active',
                        })
                      }
                      aria-label={activityView === 'active' ? 'Archive activity' : 'Restore activity'}
                      title={activityView === 'active' ? 'Archive' : 'Restore'}
                    >
                      {activityView === 'active' ? 'Archive' : 'Restore'}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-2">
                  {activityView === 'active' ? 'No recent activity.' : 'No archived activity.'}
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
