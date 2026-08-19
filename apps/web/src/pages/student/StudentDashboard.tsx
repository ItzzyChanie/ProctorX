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
} from "recharts";
import { Clock, LogIn } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { HeroBanner } from "../../components/ui/HeroBanner";
import { axisProps, tooltipProps } from "../../components/charts/chartTheme";
import { useChartPalette } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import { useAuthStore } from "../../store/authStore";
import { scoreHistory, sessionTime } from "../../data/mockDashboard";

const upcomingSessions = [
  { s: "IT 210 — Networking Quiz", d: "Aug 18, 1:00 PM" },
  { s: "CS 330 — Lab Practical", d: "Aug 21, 9:00 AM" },
];
const recentActivity = [
  { txt: "Joined CS330-Lab", time: "2h ago" },
  { txt: "Submitted IT210-Mid", time: "1d ago" },
  { txt: "Warning acknowledged", time: "3d ago" },
];

export default function StudentDashboard() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const { user } = useAuthStore();
  const userName = user?.fullName ?? "Student";
  const userTag = user ? `${user.program ?? "BSCS"} • Student` : "Student";

  return (
    <DashboardLayout
      role="student"
      pageTitle="Dashboard"
      userName={userName}
      userTag={userTag}
    >
      <div className="flex flex-col gap-5">
        <HeroBanner
          eyebrow="Welcome back"
          title="Ready for IT 210 — Networking Quiz"
          subtitle="Starts Aug 18, 1:00 PM · your monitoring client is connected and ready to go."
          stat="88"
          statLabel="Latest exam score"
          cta={
            <Button
              variant="ghost"
              icon={LogIn}
              className="!bg-white/15 !text-white !border-white/35"
            >
              Go to join session
            </Button>
          }
        />

        <div className="grid gap-5" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Exam score history"
                subtitle="Released once your professor uploads results"
              />
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={scoreHistory}>
                  <defs>
                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={p.brand}
                        stopOpacity={0.35}
                      />
                      <stop offset="100%" stopColor={p.brand} stopOpacity={0} />
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
                    strokeWidth={2.5}
                    fill="url(#scoreFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <CardHeader title="Time spent per session" />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sessionTime}>
                  <CartesianGrid stroke={p.border} vertical={false} />
                  <XAxis dataKey="session" {...axisProps(p)} />
                  <YAxis unit="m" {...axisProps(p)} />
                  <Tooltip {...tooltipProps(p)} />
                  <Bar dataKey="mins" fill={p.cyan} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Upcoming sessions" />
              {upcomingSessions.map((u, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div>
                    <div className="font-body text-[13px] font-semibold text-text-1">
                      {u.s}
                    </div>
                    <div className="font-body text-[11.5px] text-text-3">
                      {u.d}
                    </div>
                  </div>
                  <Clock size={15} className="text-text-3" />
                </div>
              ))}
            </Card>

            <Card>
              <CardHeader title="Recent activity" />
              {recentActivity.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                  <span className="font-body text-[12.5px] text-text-1 flex-1">
                    {a.txt}
                  </span>
                  <span className="font-body text-[11px] text-text-3">
                    {a.time}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
