import { Monitor, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { useAuthStore } from "../../store/authStore";

const fields = [
  { label: "Full name", value: "Prof. Maria Santos" },
  { label: "Employee ID", value: "PM-2026-001" },
  { label: "Department", value: "College of Computer Studies" },
  { label: "Email", value: "teacher@school.edu" },
];

export default function TeacherProfile() {
  const { user } = useAuthStore();

  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Profile & Settings"
      userName={user?.fullName ?? "Prof. Maria Santos"}
      userTag={
        user?.employeeId
          ? `Employee ${user.employeeId}`
          : "College of Computer Studies"
      }
    >
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <CardHeader title="Profile" />
          {fields.map((f, i) => (
            <div key={i} className="mb-3">
              <div className="font-body text-[11.5px] text-text-3 mb-1">
                {f.label}
              </div>
              <div className="font-body text-[13.5px] text-text-1 px-3 py-2.5 rounded-[9px] bg-canvas">
                {f.value}
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <CardHeader title="Monitoring permissions" />
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-brand-soft mb-3.5">
            <Monitor size={20} className="text-brand" />
            <div>
              <div className="font-body text-[13px] font-semibold text-text-1">
                Live monitoring enabled
              </div>
              <div className="font-body text-[11.5px] text-text-2">
                Session controls are active for your assigned sections.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-canvas">
            <ShieldCheck size={18} className="text-risk-low" />
            <div className="font-body text-xs text-text-2 leading-relaxed">
              Your role allows access to live monitoring, incident review,
              sessions, recordings, and student roster data for your classes.
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
