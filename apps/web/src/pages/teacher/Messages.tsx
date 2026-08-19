import { Hand } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

// Replace with a live WebSocket subscription to the active session's raise-hand queue
const rows = [
  { name: "Torres, C.", msg: "Raised hand — screen frozen", wait: "0:42" },
  { name: "Ramos, S.", msg: "Technical issue: mic permissions", wait: "2:10" },
];

export default function Messages() {
  return (
    <DashboardLayout role="teacher" pageTitle="Raise-Hand Queue" userName="Prof. Nathalie Eglea" userTag="College of Computer Studies">
      <Card padded={false}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-4"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
          >
            <div className="flex items-center gap-3">
              <Hand size={17} className="text-risk-med" />
              <div>
                <div className="font-body text-[13px] font-semibold text-text-1">{r.name}</div>
                <div className="font-body text-xs text-text-2">{r.msg}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-text-3">{r.wait}</span>
              <Button variant="ghost">Resolve</Button>
            </div>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
