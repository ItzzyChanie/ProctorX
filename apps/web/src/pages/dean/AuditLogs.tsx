import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/Card";

// Replace with GET /dean/audit-logs
const rows = [
  {
    actor: "N. Eglea",
    action: "Exported incident report",
    target: "CS330-Lab",
    time: "10:41 AM",
  },
  {
    actor: "Dean Villanueva",
    action: "Updated access policy",
    target: "Security settings",
    time: "Yesterday",
  },
  {
    actor: "J. Palceso",
    action: "Created session",
    target: "IT210-Mid",
    time: "Yesterday",
  },
];

export default function AuditLogs() {
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Audit Logs"
      userName="Dean R. Villanueva"
      userTag="School of Computer Studies"
    >
      <Card padded={false}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <div className="font-body text-[13px] text-text-1">
              <span className="font-semibold">{r.actor}</span> {r.action}{" "}
              <span className="text-text-2">· {r.target}</span>
            </div>
            <span className="font-mono text-[11.5px] text-text-3">
              {r.time}
            </span>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
