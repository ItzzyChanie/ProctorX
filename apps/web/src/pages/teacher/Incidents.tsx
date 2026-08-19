import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { riskTier, useChartPalette } from "../../lib/chartPalette";
import { useTheme } from "../../lib/useTheme";

// Replace with GET /teacher/incidents
const rows = [
  {
    student: "Torres, C.",
    session: "CS330-Lab",
    peak: 82,
    type: "Blacklisted app",
    status: "Open",
  },
  {
    student: "Mendoza, P.",
    session: "CS101-Q2",
    peak: 76,
    type: "Tab switch ×6",
    status: "Reviewed",
  },
  {
    student: "Bautista, K.",
    session: "IT210-Mid",
    peak: 58,
    type: "Idle 4m",
    status: "Dismissed",
  },
];

export default function Incidents() {
  const { dark } = useTheme();
  const p = useChartPalette(dark);

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Incident Reports"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="Incident reports"
            subtitle="Timestamped evidence for review or dispute resolution"
            right={<Button variant="ghost">Export PDF</Button>}
          />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <div>
              <div className="font-body text-[13.5px] font-semibold text-text-1">
                {r.student}
              </div>
              <div className="font-body text-[11.5px] text-text-3">
                {r.session} · {r.type}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="font-mono text-[13px] font-semibold"
                style={{ color: riskTier(r.peak, p).color }}
              >
                {r.peak}
              </span>
              <Chip
                color={
                  r.status === "Open"
                    ? "var(--risk-high)"
                    : r.status === "Reviewed"
                      ? "var(--risk-low)"
                      : "var(--text-3)"
                }
              >
                {r.status}
              </Chip>
            </div>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
