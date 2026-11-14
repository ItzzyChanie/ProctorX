import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  hover?: boolean;
};

/** Base surface card. `hover` adds the lift + brand glow used on interactive cards (e.g. KPIs). */
export function Card({
  padded = true,
  hover = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-[18px] border border-border shadow-rest transition-all duration-200",
        hover && "hover:shadow-raised hover:-translate-y-0.5",
        padded && "p-4 sm:p-6 lg:p-7",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassCard({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-glass backdrop-blur-glass rounded-[18px] border border-border p-5 shadow-rest", className)}
      style={{ background: "var(--glass)" }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <div className="font-head text-[16px] font-semibold text-text-1 tracking-tight">
          {title}
        </div>
        {subtitle && (
          <div className="font-body text-[12.5px] text-text-2 mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
