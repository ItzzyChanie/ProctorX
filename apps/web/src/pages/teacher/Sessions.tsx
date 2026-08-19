import { Copy, Plus } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";

// Replace with GET /teacher/sessions ; the create form should POST /sessions
const rows = [
  {
    name: "CS330-Lab",
    code: "CS-4F2K",
    section: "BSCS-4A",
    status: "Live",
    students: 10,
  },
  {
    name: "IT210-Mid",
    code: "IT-9Q1X",
    section: "BSIT-2A",
    status: "Scheduled",
    students: 34,
  },
  {
    name: "CS101-Q2",
    code: "CS-7B3M",
    section: "BSCS-3B",
    status: "Ended",
    students: 28,
  },
];

export default function Sessions() {
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Sessions"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Create session"
            subtitle="Generates a unique room code for students to join"
            right={<Button icon={Plus}>New session</Button>}
          />
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
          >
            {["Subject", "Section", "Duration (min)"].map((ph, i) => (
              <input
                key={i}
                placeholder={ph}
                className="font-body text-[13px] px-3 py-2.5 rounded-[9px] bg-canvas text-text-1 outline-none focus:border-brand"
              />
            ))}
          </div>
        </Card>

        <Card padded={false}>
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
            >
              <div>
                <div className="font-body text-[13.5px] font-semibold text-text-1">
                  {r.name}
                </div>
                <div className="font-body text-[11.5px] text-text-3">
                  {r.section} · {r.students} students
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[13px] font-semibold text-brand">
                    {r.code}
                  </span>
                  <Copy size={13} className="text-text-3 cursor-pointer" />
                </div>
                <Chip
                  color={
                    r.status === "Live"
                      ? "var(--risk-low)"
                      : r.status === "Scheduled"
                        ? "var(--brand)"
                        : "var(--text-3)"
                  }
                >
                  {r.status}
                </Chip>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
}
