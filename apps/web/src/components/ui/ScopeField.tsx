import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';

/**
 * A dashboard scope filter. On phones the text label is replaced by an icon
 * inside the field so the filter grid stays compact (2 per row); from `sm`
 * up the regular text label is shown above the control.
 */
export function ScopeField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <label className="scope-field block min-w-0 text-xs font-semibold text-text-2" title={label}>
      <span className="sr-only sm:not-sr-only sm:mb-1 sm:block">{label}</span>
      <span className="relative block">
        <Icon
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand sm:hidden"
        />
        {children}
      </span>
    </label>
  );
}

/** Shared classes for a select/input inside a ScopeField. */
export const scopeControlClass =
  'w-full min-w-0 truncate rounded-lg border border-border bg-surface py-2 pl-8 pr-2 text-sm sm:px-3';

/** Compact header for a scope card: title + icon-only "clear" on phones. */
export function ScopeHeader({
  title,
  subtitle,
  onClear,
}: {
  title: string;
  subtitle?: string;
  onClear?: () => void;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 sm:mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-head text-[15px] font-semibold tracking-tight text-text-1 sm:text-[16px]">
          <SlidersHorizontal size={16} className="text-brand sm:hidden" />
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 hidden font-body text-[12.5px] text-text-2 sm:block">
            {subtitle}
          </div>
        )}
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-text-2 hover:bg-brand-soft hover:text-brand"
          aria-label="Clear filters"
          title="Clear filters"
        >
          <RotateCcw size={15} />
          <span className="hidden sm:inline">Clear filters</span>
        </button>
      )}
    </div>
  );
}
