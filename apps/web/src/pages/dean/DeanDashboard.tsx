import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Shield,
  Video,
} from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { HeroBanner } from "../../components/ui/HeroBanner";
import { Button } from "../../components/ui/Button";
import { KPI } from "../../components/ui/KPI";
import { useAuthStore } from "../../store/authStore";
import {
  axisProps,
  INCIDENT_COLORS,
  tooltipProps,
} from "../../components/charts/chartTheme";
import { useChartPalette, riskTier } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import {
  incidenceTrend,
  incidentTypes,
  sectionSuspicion,
  subjectIncidence,
} from "../../data/mockDashboard";

export default function DeanDashboard() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const { user } = useAuthStore();

  return (
    <DashboardLayout
      role="dean"
      pageTitle="Dashboard"
      userName={user?.fullName ?? "Dean"}
      userTag={
        user?.employeeId
          ? `Employee ${user.employeeId}`
          : "School of Computer Studies"
      }
    >
      <div className="flex flex-col gap-5">
        <HeroBanner
          eyebrow="School of Computer Studies"
          title="Academic integrity is trending healthy this term"
          subtitle="College-wide suspicion is down 3.8% from last term, with 3 sections above the review threshold."
          stat="17%"
          statLabel="Overall incidence rate"
          cta={
            <Button
              variant="ghost"
              icon={FileText}
              className="!bg-white/15 !text-white !border-white/35"
            >
              View full analytics
            </Button>
          }
        />

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          <KPI
            label="Monitored sessions (term)"
            value="1,248"
            delta={12.4}
            icon={Video}
            accent={0}
          />
          <KPI
            label="College-wide avg. suspicion"
            value="29"
            delta={-3.8}
            icon={Shield}
            accent={2}
          />
          <KPI
            label="Incident rate"
            value="17%"
            delta={1.1}
            icon={FileWarning}
            accent={3}
          />
          <KPI
            label="Sections above threshold"
            value="3"
            delta={0}
            icon={AlertTriangle}
            accent={1}
          />
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "1.3fr 1fr" }}
        >
          <Card>
            <CardHeader title="Cheating-incidence rate by section" />
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={sectionSuspicion}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="section" {...axisProps(p)} />
                <YAxis {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="avg" fill={p.violet} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Incidents by type" subtitle="College-wide" />
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

        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <CardHeader title="Incidence-rate trend" subtitle="This semester" />
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={incidenceTrend}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="week" {...axisProps(p)} />
                <YAxis unit="%" {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={p.riskHigh}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Incidence rate by subject" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={subjectIncidence}
                layout="vertical"
                margin={{ left: 24 }}
              >
                <CartesianGrid stroke={p.border} horizontal={false} />
                <XAxis type="number" unit="%" {...axisProps(p)} />
                <YAxis
                  type="category"
                  dataKey="subject"
                  width={110}
                  {...axisProps(p)}
                />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="rate" fill={p.cyan} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
