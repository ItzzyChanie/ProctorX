import { Plus } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

// Replace with GET /dean/professors
const rows = [
  { name: "Nathalie Eglea", sections: "BSCS-4A, BSCS-3B", active: "2h ago" },
  { name: "Jefferson Palceso", sections: "BSIT-2A, BSIT-3C", active: "1d ago" },
  { name: "Marco Villaruel", sections: "BSCS-3A", active: "5h ago" },
];

export default function Departments() {
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Departments & Professors"
      userName="Dean R. Villanueva"
      userTag="School of Computer Studies"
    >
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="Professors"
            right={<Button icon={Plus}>Invite professor</Button>}
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
                {r.name}
              </div>
              <div className="font-body text-[11.5px] text-text-3">
                {r.sections}
              </div>
            </div>
            <span className="font-body text-[11.5px] text-text-3">
              Active {r.active}
            </span>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
