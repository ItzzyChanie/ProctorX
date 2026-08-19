import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuthStore } from "../../store/authStore";
import type { Role } from "../../types/dashboard";

type DashboardLayoutProps = {
  role: Role;
  pageTitle?: string;
  userName?: string;
  userTag?: string;
  children: ReactNode;
};

function roleLabel(role: Role) {
  if (role === "student") return "Student";
  if (role === "teacher") return "Teacher";
  return "Dean";
}

export function DashboardLayout({
  role,
  pageTitle = "Dashboard",
  userName,
  userTag,
  children,
}: DashboardLayoutProps) {
  const { user } = useAuthStore();
  const resolvedUserName = userName ?? user?.fullName ?? "ProctorX User";
  const resolvedUserTag =
    userTag ??
    (user
      ? `${user.program ?? user.employeeId ?? roleLabel(role)} • ${roleLabel(role)}`
      : `${roleLabel(role)} Portal`);

  return (
    <div className="app-shell">
      <Sidebar role={role} />
      <div className="app-main">
        <Topbar
          role={role}
          pageTitle={pageTitle}
          userName={resolvedUserName}
          userTag={resolvedUserTag}
        />
        <main className="app-content"><div className="app-page">{children}</div></main>
      </div>
    </div>
  );
}
