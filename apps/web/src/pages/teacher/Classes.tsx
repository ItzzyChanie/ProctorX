import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { SuspicionMeter } from "../../components/ui/SuspicionMeter";

// Replace with GET /teacher/sections/:id/roster
const rows = [
  { name: "Reyes, Marco A.", sessions: 6, avg: 22 },
  { name: "Santos, Angela P.", sessions: 6, avg: 61 },
  { name: "Dela Cruz, Rico", sessions: 5, avg: 15 },
  { name: "Garcia, Liza", sessions: 6, avg: 44 },
];

export default function Classes() {
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Classes & Students"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="BSCS-4A roster"
            subtitle="Aggregate suspicion history per student"
          />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <div className="font-body text-[13.5px] font-semibold text-text-1">
              {r.name}
            </div>
            <div className="flex items-center gap-6">
              <span className="font-body text-xs text-text-3">
                {r.sessions} sessions
              </span>
              <div className="w-[140px]">
                <SuspicionMeter score={r.avg} size="sm" />
              </div>
            </div>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
