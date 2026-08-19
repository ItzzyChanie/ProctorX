import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { NAV } from "../../config/nav";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import type { Role } from "../../types/dashboard";

export function Sidebar({ role }: { role: Role }) {
  const [collapsed, setCollapsed] = useState(false);
  const { signOut } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div
      className="app-sidebar flex flex-col flex-shrink-0 border-r border-border bg-surface transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 264 }}
    >
      <div className="flex h-[84px] items-center gap-2.5 px-5">
        <div
          className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 shadow-glow"
          style={{ background: "var(--brand-gradient)" }}
        >
          <Eye size={17} color="#fff" />
        </div>
        {!collapsed && (
          <span className="font-head font-bold text-[17px] text-text-1 tracking-tight">
            ProctorX
          </span>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-5">
        {!collapsed && (
          <div className="font-body text-[10.5px] font-bold text-text-3 uppercase tracking-wide px-2.5 pb-2">
            Menu
          </div>
        )}
        {NAV[role].map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.path === `/${role}`}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 w-full rounded-[12px] px-3.5 py-3 mb-1 text-[14px] font-body transition-all duration-150",
                  isActive
                    ? "text-white font-semibold shadow-glow"
                    : "text-text-2 font-medium hover:bg-brand-soft hover:text-brand",
                ].join(" ")
              }
              style={({ isActive }) =>
                isActive ? { background: "var(--brand-gradient)" } : undefined
              }
            >
              <Icon size={17} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <button
          onClick={async () => {
            await api.post("/auth/logout").catch(() => undefined);
            signOut();
            navigate("/");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-border px-3 py-2.5 font-body text-[13px] font-medium text-text-2 transition-colors hover:bg-brand-soft hover:text-brand"
          aria-label="Logout"
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}
