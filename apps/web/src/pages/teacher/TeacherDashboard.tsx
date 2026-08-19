import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileWarning, Shield, Users, Video } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { HeroBanner } from "../../components/ui/HeroBanner";
import { Button } from "../../components/ui/Button";
import { KPI } from "../../components/ui/KPI";
import { SuspicionMeter } from "../../components/ui/SuspicionMeter";
import { useAuthStore } from "../../store/authStore";
import {
  axisProps,
  INCIDENT_COLORS,
  tooltipProps,
} from "../../components/charts/chartTheme";
import { useChartPalette, riskTier } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import {
  incidentTypes,
  liveStudents,
  sectionSuspicion,
  suspicionTrend,
} from "../../data/mockDashboard";

export default function TeacherDashboard() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const { user } = useAuthStore();
  const topRisk = [...liveStudents]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Dashboard"
      userName={user?.fullName ?? "Professor"}
      userTag={
        user?.employeeId
          ? `Employee ${user.employeeId}`
          : "College of Computer Studies"
      }
    >
      <div className="flex flex-col gap-5">
        <HeroBanner
          eyebrow="Live now"
          title="CS330-Lab is in session — 10 students connected"
          subtitle="Suspicion levels are tracking normal for this section. 1 student has raised their hand."
          stat="24"
          statLabel="Avg. suspicion score"
          cta={
            <Button
              variant="ghost"
              icon={Video}
              className="!bg-white/15 !text-white !border-white/35"
            >
              Open live monitoring
            </Button>
          }
        />

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <KPI label="Active sessions now" value="2" icon={Video} accent={0} />
          <KPI
            label="Students monitored today"
            value="86"
            delta={4.2}
            icon={Users}
            accent={1}
          />
          <KPI
            label="Avg. suspicion score"
            value="34"
            delta={-6.1}
            icon={Shield}
            accent={2}
          />
          <KPI
            label="Flagged incidents (7d)"
            value="11"
            delta={2.3}
            icon={FileWarning}
            accent={3}
          />
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "1.4fr 1fr" }}
        >
          <Card>
            <CardHeader title="Average suspicion by section" />
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={sectionSuspicion}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="section" {...axisProps(p)} />
                <YAxis domain={[0, 100]} {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                  {sectionSuspicion.map((d, i) => (
                    <Cell key={i} fill={riskTier(d.avg, p).color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Incident types" subtitle="Last 7 days" />
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={incidentTypes}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {incidentTypes.map((_, i) => (
                    <Cell key={i} fill={INCIDENT_COLORS(p)[i]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps(p)} />
                <Legend
                  wrapperStyle={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11.5,
                    color: p.textSecondary,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "1.4fr 1fr" }}
        >
          <Card>
            <CardHeader
              title="Suspicion trend — live session CS330-Lab"
              subtitle="Score sampled every 5 minutes"
            />
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={suspicionTrend}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={p.riskMed}
                      stopOpacity={0.35}
                    />
                    <stop offset="100%" stopColor={p.riskMed} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="t" {...axisProps(p)} />
                <YAxis domain={[0, 100]} {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={p.riskMed}
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Highest risk right now" />
            <div className="flex flex-col gap-4">
              {topRisk.map((s) => (
                <div key={s.id}>
                  <div className="font-body text-[12.5px] font-semibold text-text-1 mb-1">
                    {s.name}
                  </div>
                  <SuspicionMeter score={s.score} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
