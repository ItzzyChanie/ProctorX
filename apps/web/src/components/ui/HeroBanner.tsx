import type { ReactNode } from "react";

type HeroBannerProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  stat?: string | number;
  statLabel?: string;
  cta?: ReactNode;
};

/** Full-width gradient banner used at the top of every role's Dashboard page. */
export function HeroBanner({ eyebrow, title, subtitle, stat, statLabel, cta }: HeroBannerProps) {
  return (
    <div
      className="relative rounded-[20px] p-6 sm:p-8 overflow-hidden shadow-glow border border-white/15"
      style={{ background: "var(--brand-gradient)" }}
    >
      <div
        className="absolute -top-16 -right-16 w-56 h-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)" }}
      />
      <div
        className="absolute -bottom-20 left-32 w-64 h-64 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)" }}
      />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)", backgroundSize: "28px 28px", maskImage: "linear-gradient(to right, black, transparent 70%)" }} />
      <div className="relative flex items-center justify-between flex-wrap gap-6">
        <div className="max-w-[460px]">
          {eyebrow && (
            <div className="font-body text-[11.5px] font-bold text-white/80 uppercase tracking-wide mb-2">
              {eyebrow}
            </div>
          )}
          <div className="font-head text-[22px] sm:text-[26px] font-semibold tracking-tight text-white mb-1.5 leading-snug">{title}</div>
          {subtitle && <div className="font-body text-[13.5px] text-white/85 leading-relaxed">{subtitle}</div>}
          {cta && <div className="mt-4">{cta}</div>}
        </div>
        {stat !== undefined && (
          <div className="text-left sm:text-right rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <div className="font-mono font-bold text-[40px] text-white leading-none">{stat}</div>
            <div className="font-body text-xs text-white/80 mt-1">{statLabel}</div>
          </div>
        )}
      </div>
    </div>
  );
}
