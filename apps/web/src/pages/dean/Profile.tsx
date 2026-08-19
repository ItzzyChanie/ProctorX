import { KeyRound, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { useAuthStore } from "../../store/authStore";

const fields = [
  { label: "Full name", value: "Dean Villanueva" },
  { label: "Employee ID", value: "D-2026-007" },
  { label: "Office", value: "Office of the Dean" },
  { label: "Email", value: "dean@school.edu" },
];

export default function DeanProfile() {
  const { user } = useAuthStore();

  return (
    <DashboardLayout
      role="dean"
      pageTitle="Profile & Settings"
      userName={user?.fullName ?? "Dean Villanueva"}
      userTag={
        user?.employeeId
          ? `Employee ${user.employeeId}`
          : "School of Computer Studies"
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
          <CardHeader title="Access controls" />
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-brand-soft mb-3.5">
            <ShieldCheck size={20} className="text-brand" />
            <div>
              <div className="font-body text-[13px] font-semibold text-text-1">
                Full administrative access
              </div>
              <div className="font-body text-[11.5px] text-text-2">
                Analytics, departments, reports, audit logs, and security
                settings are enabled.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-canvas">
            <KeyRound size={18} className="text-risk-low" />
            <div className="font-body text-xs text-text-2 leading-relaxed">
              Sensitive review and security functions are protected by
              role-based controls and audit logging.
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
