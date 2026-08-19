import { Hand, Lock, Monitor } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { SuspicionMeter } from "../../components/ui/SuspicionMeter";
import { useChartPalette, riskTier } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";
import { liveStudents } from "../../data/mockDashboard";

/**
 * Flagship screen. In production, replace `liveStudents` with a live data source
 * (WebSocket/polling against your NestJS gateway) keyed by an active session id.
 */
export default function LiveMonitoring() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);
  const sorted = [...liveStudents].sort((a, b) => b.score - a.score);

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Live Monitoring"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-body text-[12.5px] text-text-2">
            <span className="w-2 h-2 rounded-full bg-risk-low" />
            Session CS330-Lab · 10 connected · 00:24:12 elapsed
          </div>
          <div className="flex gap-2">
            <Button variant="ghost">Sort: Risk ↓</Button>
            <Button variant="ghost" icon={Hand}>
              Raise-hand queue (1)
            </Button>
          </div>
        </div>

        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {sorted.map((s) => {
            const tier = riskTier(s.score, p);
            return (
              <Card key={s.id}>
                <div className="h-[100px] rounded-[9px] bg-canvas flex items-center justify-center mb-2.5">
                  <Monitor size={26} className="text-text-3" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-[12.5px] font-semibold text-text-1">
                    {s.name}
                  </span>
                  {s.alerts > 0 && (
                    <Chip color="var(--risk-med)">{s.alerts} alerts</Chip>
                  )}
                </div>
                <SuspicionMeter score={s.score} size="sm" />
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="ghost"
                    className="flex-1 justify-center !px-2 !py-1.5 !text-[11.5px]"
                  >
                    Warn
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Lock}
                    className="flex-1 justify-center !px-2 !py-1.5 !text-[11.5px]"
                  >
                    Lock
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
