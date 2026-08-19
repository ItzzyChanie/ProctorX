import { Monitor } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";

// Replace field values with the logged-in user from your auth/session store.
const fields = [
  { label: "Full name", value: "Jefferson B. Palceso" },
  { label: "Student number", value: "2023-00412" },
  { label: "Program", value: "BS Computer Science" },
  { label: "Email", value: "j.palceso@au.edu.ph" },
];

export default function Profile() {
  return (
    <DashboardLayout
      role="student"
      pageTitle="Profile & Device"
      userName="Jefferson Palceso"
      userTag="BSCS-4A · Student"
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
          <CardHeader title="Device & security" />
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-brand-soft mb-3.5">
            <Monitor size={20} className="text-brand" />
            <div>
              <div className="font-body text-[13px] font-semibold text-text-1">
                ProctorX Client v1.4.2
              </div>
              <div className="font-body text-[11.5px] text-text-2">
                Installed and running
              </div>
            </div>
          </div>
          <div className="font-body text-xs text-text-2 leading-relaxed">
            All monitoring data is protected with AES-256 encryption at rest and
            TLS in transit, and is only accessible to your professor and college
            administrators under role-based access control.
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
