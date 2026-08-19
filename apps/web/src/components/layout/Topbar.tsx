import { Bell, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "../../lib/useTheme";
import type { Role } from "../../types/dashboard";

type TopbarProps = {
  role: Role;
  pageTitle: string;
  userName: string;
  userTag: string;
};

export function Topbar({ role, pageTitle, userName, userTag }: TopbarProps) {
  const { dark, toggleDark } = useTheme();
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <div
      className="app-topbar flex h-[84px] shrink-0 items-center justify-between border-b border-border px-5 sm:px-8 backdrop-blur-glass z-10"
      style={{ background: "var(--surface)" }}
    >
      <div>
          <div className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
          {role}
        </div>
          <div className="font-head text-[20px] font-bold text-text-1 tracking-tight">
          {pageTitle}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {(role === "teacher" || role === "dean") && (
          <div className="hidden lg:flex items-center gap-2 border border-border bg-canvas/70 rounded-[10px] px-3 py-2 text-text-3">
            <Search size={14} />
            <span className="font-body text-[12.5px]">Search…</span>
          </div>
        )}
        <button
          onClick={toggleDark}
          className="w-9 h-9 rounded-[10px] border border-border bg-surface text-text-2 flex items-center justify-center hover:bg-brand-soft transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="relative w-9 h-9 rounded-[10px] border border-border bg-surface text-text-2 flex items-center justify-center hover:bg-brand-soft transition-colors"
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-[7px] right-2 w-1.5 h-1.5 rounded-full bg-risk-high" />
        </button>
        <div className="flex items-center gap-2.5 pl-2.5 border-l border-border">
          <div
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-head font-bold text-[13px] text-white shadow-glow"
            style={{ background: "var(--brand-gradient)" }}
          >
            {initials}
          </div>
          <div className="hidden md:block">
            <div className="font-body text-[12.5px] font-semibold text-text-1">
              {userName}
            </div>
            <div className="font-body text-[11px] text-text-3">{userTag}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
