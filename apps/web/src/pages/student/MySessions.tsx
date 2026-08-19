import { LogIn } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";

// Replace with GET /students/me/sessions
const rows = [
  {
    subj: "CS330 Lab Practical",
    date: "Aug 12, 2026",
    dur: "47m",
    status: "Cleared",
  },
  { subj: "IT210 Midterm", date: "Aug 5, 2026", dur: "55m", status: "Cleared" },
  {
    subj: "CS101 Quiz 2",
    date: "Jul 29, 2026",
    dur: "38m",
    status: "Under Review",
  },
  { subj: "CS101 Quiz 1", date: "Jul 22, 2026", dur: "42m", status: "Cleared" },
];

export default function MySessions() {
  return (
    <DashboardLayout
      role="student"
      pageTitle="My Sessions"
      userName="Jefferson Palceso"
      userTag="BSCS-4A · Student"
    >
      <Card padded={false}>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardHeader
              title="Session history"
              subtitle="Every monitored assessment you've taken"
            />
            <Button variant="ghost" icon={LogIn} className="shrink-0">
              Join session
            </Button>
          </div>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <div>
              <div className="font-body text-[13.5px] font-semibold text-text-1">
                {r.subj}
              </div>
              <div className="font-body text-[11.5px] text-text-3">
                {r.date} · {r.dur}
              </div>
            </div>
            <Chip
              color={
                r.status === "Cleared" ? "var(--risk-low)" : "var(--risk-med)"
              }
            >
              {r.status}
            </Chip>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
