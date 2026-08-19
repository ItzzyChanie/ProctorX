import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { axisProps, tooltipProps } from "../../components/charts/chartTheme";
import { useChartPalette, riskTier } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import {
  correlationData,
  incidenceTrend,
  linearRegression,
  sectionSuspicion,
} from "../../data/mockDashboard";

// Wire these to real filter state (semester, program, section, subject) driving API queries
const filters = [
  "Semester: AY 2025-2026, 2nd Term",
  "Program: BSCS",
  "Section: All",
  "Subject: All",
];

export default function Analytics() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const regressionLine = linearRegression(correlationData);

  return (
    <DashboardLayout
      role="dean"
      pageTitle="Analytics"
      userName="Dean R. Villanueva"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-3 flex-wrap">
            {filters.map((f, i) => (
              <div
                key={i}
                className="font-body text-xs text-text-2 px-3 py-1.5 rounded-lg bg-canvas"
              >
                {f}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Suspicion vs. performance — college-wide"
            subtitle="Rolled up from all professor sessions"
          />
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid stroke={p.border} />
              <XAxis
                type="number"
                dataKey="suspicion"
                name="Suspicion score"
                domain={[0, 100]}
                {...axisProps(p)}
              />
              <YAxis
                type="number"
                dataKey="performance"
                name="Exam score"
                domain={[0, 100]}
                {...axisProps(p)}
              />
              <Tooltip
                {...tooltipProps(p)}
                cursor={{ strokeDasharray: "3 3" }}
              />
              <Scatter
                data={correlationData}
                fill={p.violet}
                fillOpacity={0.55}
              />
              <Line
                data={regressionLine}
                type="linear"
                dataKey="performance"
                stroke={p.riskHigh}
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <CardHeader title="Incidence-rate trend" />
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={incidenceTrend}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="week" {...axisProps(p)} />
                <YAxis unit="%" {...axisProps(p)} />
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
          </Card>
          <Card>
            <CardHeader title="Section comparison" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sectionSuspicion}>
                <CartesianGrid stroke={p.border} vertical={false} />
                <XAxis dataKey="section" {...axisProps(p)} />
                <YAxis {...axisProps(p)} />
                <Tooltip {...tooltipProps(p)} />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                  {sectionSuspicion.map((d, i) => (
                    <Cell key={i} fill={riskTier(d.avg, p).color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
