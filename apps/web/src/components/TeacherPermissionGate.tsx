import type { ReactNode } from 'react';
import { DashboardLayout } from './layout/DashboardLayout';
import { Card } from './ui/Card';
import { useAuthStore } from '../store/authStore';

type Props = {
  permission: string;
  pageTitle: string;
  children: ReactNode;
};

export function TeacherPermissionGate({
  permission,
  pageTitle,
  children,
}: Props) {
  const allowed = useAuthStore(
    (state) => state.user?.permissions?.[permission] !== false
  );

  if (allowed) return <>{children}</>;

  return (
    <DashboardLayout role="teacher" pageTitle={pageTitle}>
      <Card>
        <p className="text-sm font-semibold text-text-1">
          Access restricted by your dean.
        </p>
      </Card>
    </DashboardLayout>
  );
}
