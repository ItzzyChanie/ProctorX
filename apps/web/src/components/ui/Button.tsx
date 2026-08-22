import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  icon?: LucideIcon;
};

export function Button({
  variant = "primary",
  icon: Icon,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold font-body leading-none transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary:
      "bg-brand-gradient text-white shadow-rest hover:shadow-glow hover:-translate-y-px active:translate-y-0",
    ghost:
      "border border-border bg-surface text-text-1 hover:bg-brand-soft hover:border-brand/30",
    danger: "bg-transparent text-risk-high hover:bg-risk-high/10",
  };
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}
