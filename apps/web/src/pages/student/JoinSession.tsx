import { useState } from "react";
import { CheckCircle2, LogIn } from "lucide-react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

const checklist = [
  "Monitoring client running",
  "Screen-share permission granted",
  "Stable network connection",
];

export default function JoinSession() {
  const [code, setCode] = useState("");

  return (
    <DashboardLayout
      role="student"
      pageTitle="Join Session"
      userName="Jefferson Palceso"
      userTag="BSCS-4A · Student"
    >
      <div className="grid gap-5" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
        <Card>
          <CardHeader
            title="Enter room code"
            subtitle="Get this code from your professor"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CS-4F2K"
            className="w-full font-mono text-[28px] tracking-[4px] text-center py-4 rounded-xl bg-canvas text-text-1 outline-none mb-4 focus:border-brand"
          />
          {/* Wire this to POST /sessions/join (or your real endpoint) with { code } */}
          <Button icon={LogIn} className="w-full justify-center">
            Join session
          </Button>
        </Card>
        <Card>
          <CardHeader title="Pre-flight checklist" />
          {checklist.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-2"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
            >
              <CheckCircle2 size={15} className="text-risk-low" />
              <span className="font-body text-[13px] text-text-1">{c}</span>
            </div>
          ))}
          <div className="mt-3.5 p-3 rounded-[10px] bg-brand-soft font-body text-xs text-text-2 leading-relaxed">
            By joining, you allow ProctorX to log alt-tab events,
            blacklisted-app usage, idle time, and USB device activity during
            this exam window only. Data is encrypted in transit and at rest.
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
