import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "./Card";

const ICON_BG = [
  "linear-gradient(135deg, var(--brand), var(--violet))",
  "linear-gradient(135deg, var(--cyan), var(--brand))",
  "linear-gradient(135deg, var(--risk-low), var(--cyan))",
  "linear-gradient(135deg, var(--pink), var(--violet))",
];

type KPIProps = {
  label: string;
  value: string | number;
  delta?: number;
  mono?: boolean;
  icon?: LucideIcon;
  /** 0–3, picks a gradient hue pairing for the icon badge so a KPI row doesn't look monochrome. */
  accent?: number;
};

export function KPI({ label, value, delta, mono = true, icon: Icon, accent = 0 }: KPIProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card hover className="relative overflow-hidden">
      <div className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full bg-brand/5" />
      <div className="flex items-center justify-between mb-4">
        <span className="font-body text-[12.5px] font-semibold text-text-2">{label}</span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: ICON_BG[accent % ICON_BG.length] }}
          >
            <Icon size={15} color="#fff" />
          </div>
        )}
      </div>
      <div className={`relative font-${mono ? "mono" : "head"} text-[30px] font-bold text-text-1 tracking-tight`}>
        {value}
      </div>
      {delta !== undefined && (
        <div
          className="inline-flex items-center gap-1 mt-3 text-[11.5px] font-bold font-body rounded-full px-2 py-0.5"
          style={{
            color: up ? "var(--risk-low)" : "var(--risk-high)",
            background: up ? "var(--risk-low)" : "var(--risk-high)",
            backgroundColor: up ? "color-mix(in srgb, var(--risk-low) 14%, transparent)" : "color-mix(in srgb, var(--risk-high) 14%, transparent)",
          }}
        >
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{Math.abs(delta)}% vs last term</span>
        </div>
      )}
    </Card>
  );
}
