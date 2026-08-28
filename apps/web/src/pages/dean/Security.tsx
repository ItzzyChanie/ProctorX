import { Lock, Shield, Users } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { KPI } from '../../components/ui/KPI';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const rbac = [
  { role: 'Student', perms: 'View own sessions, join rooms' },
  {
    role: 'Teacher',
    perms: 'Live monitoring, incident review, roster management',
  },
  {
    role: 'Dean',
    perms: 'Full analytics, account management, security settings',
  },
];

export default function Security() {
  const { data } = useQuery({
    queryKey: ['dean-security-summary'],
    queryFn: async () =>
      (
        await api.get<{
          kpis: { monitoredSessionsThisTerm: number };
        }>('/dean/dashboard')
      ).data,
  });
  return (
    <DashboardLayout role="dean" pageTitle="Security & Access">
      <div className="flex flex-col gap-5">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          <KPI
            label="Encryption at rest"
            value="AES-256"
            mono={false}
            icon={Shield}
            accent={0}
          />
          <KPI
            label="Data in transit"
            value="TLS 1.3"
            mono={false}
            icon={Lock}
            accent={2}
          />
          <KPI
            label="Monitored sessions"
            value={data?.kpis.monitoredSessionsThisTerm ?? 0}
            icon={Users}
            accent={1}
          />
        </div>
        <Card padded={false}>
          <div className="p-5">
            <CardHeader title="Role-based access control" />
          </div>
          {rbac.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
            >
              <span className="font-body text-[13.5px] font-semibold text-text-1">
                {r.role}
              </span>
              <span className="font-body text-[12.5px] text-text-2">
                {r.perms}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
}
