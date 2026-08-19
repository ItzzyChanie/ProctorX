import { FileText } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";

// Replace with GET /dean/reports ; "Generate" should POST /dean/reports with the chosen filters
const rows = [
  { name: "Q2 Accreditation Summary", date: "Aug 1, 2026", fmt: "PDF" },
  {
    name: "Cheating Incidence — All Sections",
    date: "Jul 15, 2026",
    fmt: "Excel",
  },
];

export default function Reports() {
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Reports"
      userName="Dean R. Villanueva"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Build a report"
            subtitle="Choose a date range, sections, and metrics to include"
            right={<Button>Generate</Button>}
          />
        </Card>
        <Card padded={false}>
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
            >
              <div className="flex items-center gap-3">
                <FileText size={17} className="text-text-3" />
                <div>
                  <div className="font-body text-[13.5px] font-semibold text-text-1">
                    {r.name}
                  </div>
                  <div className="font-body text-[11.5px] text-text-3">
                    {r.date}
                  </div>
                </div>
              </div>
              <Chip color="var(--brand)">{r.fmt}</Chip>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
}
