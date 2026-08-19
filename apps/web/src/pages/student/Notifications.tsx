import { AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/Card";

// Replace with GET /students/me/notifications
const items = [
  {
    Icon: AlertTriangle,
    color: "var(--risk-med)",
    txt: "Professor sent a warning during CS101 Quiz 2 — please stay on the exam window.",
    time: "Jul 29, 10:41 AM",
  },
  {
    Icon: CheckCircle2,
    color: "var(--risk-low)",
    txt: "Your IT210 Midterm session was reviewed and cleared.",
    time: "Aug 6, 8:02 AM",
  },
  {
    Icon: Bell,
    color: "var(--brand)",
    txt: "New session scheduled: IT 210 — Networking Quiz, Aug 18.",
    time: "Aug 10, 3:15 PM",
  },
];

export default function Notifications() {
  return (
    <DashboardLayout
      role="student"
      pageTitle="Notifications"
      userName="Jefferson Palceso"
      userTag="BSCS-4A · Student"
    >
      <Card padded={false}>
        {items.map((n, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-5 py-4"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <n.Icon
              size={17}
              style={{ color: n.color, marginTop: 2 }}
              className="flex-shrink-0"
            />
            <div className="flex-1">
              <div className="font-body text-[13px] text-text-1">{n.txt}</div>
              <div className="font-body text-[11px] text-text-3 mt-1">
                {n.time}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
