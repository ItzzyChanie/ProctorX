import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PlayCircle } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { tooltipProps } from "../../components/charts/chartTheme";
import { useChartPalette } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import { suspicionTrend } from "../../data/mockDashboard";

export default function Recordings() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Recordings & Playback"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <Card>
        <CardHeader
          title="CS101-Q2 — playback"
          subtitle="Scrub the timeline to jump to any point in the session"
        />
        <div className="h-[220px] rounded-[10px] bg-canvas flex items-center justify-center mb-3.5">
          <PlayCircle size={40} className="text-text-3" />
        </div>
        <div className="font-body text-[11.5px] text-text-2 mb-1.5">
          Suspicion score across the session (scrub timeline)
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={suspicionTrend}>
            <defs>
              <linearGradient id="playbackFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.brand} stopOpacity={0.35} />
                <stop offset="100%" stopColor={p.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 100]} hide />
            <Tooltip {...tooltipProps(p)} />
            <Area
              type="monotone"
              dataKey="score"
              stroke={p.brand}
              strokeWidth={2}
              fill="url(#playbackFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </DashboardLayout>
  );
}
