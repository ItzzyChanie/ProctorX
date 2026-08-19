import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function EmptyState({
  icon: Icon, title, body,
}: { icon: LucideIcon; title: string; body: string }) {
  return (
    <Card className="text-center py-12 px-6">
      <Icon size={28} className="mx-auto mb-3 text-text-3" />
      <div className="font-head text-[15px] font-semibold text-text-1 mb-1">{title}</div>
      <div className="font-body text-[13px] text-text-2 max-w-[380px] mx-auto">{body}</div>
    </Card>
  );
}
