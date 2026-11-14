import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@proctorx/shared-types';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types/dashboard';
import { api } from '../../lib/api';

type DashboardLayoutProps = {
  role: Role;
  pageTitle?: string;
  userName?: string;
  userTag?: string;
  children: ReactNode;
};

function roleLabel(role: Role) {
  if (role === 'student') return 'Student';
  if (role === 'teacher') return 'Teacher';
  return 'Dean';
}

export function DashboardLayout({
  role,
  pageTitle = 'Dashboard',
  userName,
  userTag,
  children,
}: DashboardLayoutProps) {
  const { user, updateUser } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(() => {
    const refresh = () =>
      void api
        .get<User>('/auth/me')
        .then(({ data }) => updateUser(data))
        .catch(() => undefined);
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [updateUser]);
  const resolvedUserName = user?.fullName ?? userName ?? 'ProctorX User';
  const roleIdentityTag =
    role === 'teacher'
      ? `${user?.employeeId || 'Employee ID'} - Teacher`
      : role === 'dean'
        ? [
            user?.officialTitle || 'Dean',
            user?.employeeId ? `ID: ${user.employeeId}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : user
          ? `${user.program === 'CS' ? 'BSCS' : user.program === 'IT' ? 'BSIT' : user.program || 'Student'}${
              user.sectionName ? `-${user.sectionName}` : ''
            } · Student`
          : undefined;
  const resolvedUserTag =
    roleIdentityTag ??
    userTag ??
    (user
      ? `${user.program ?? user.employeeId ?? roleLabel(role)} • ${roleLabel(role)}`
      : `${roleLabel(role)} Portal`);

  return (
    <div className="app-shell">
      <Sidebar role={role} mobileOpen={menuOpen} onMobileClose={closeMenu} />
      <div className="app-main">
        <Topbar
          role={role}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
          pageTitle={pageTitle}
          userName={resolvedUserName}
          userTag={resolvedUserTag}
          profilePicture={user?.profilePicture}
        />
        <main className="app-content">
          <div className="app-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
