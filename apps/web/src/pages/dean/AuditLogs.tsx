import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
type Log = {
  actorName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
};
type Result = { items: Log[]; nextCursor: string | null };
export default function AuditLogs() {
  const [filters, setFilters] = useState({
      actor: '',
      action: '',
      dateFrom: '',
      dateTo: '',
    }),
    [appliedFilters, setAppliedFilters] = useState(filters),
    [cursor, setCursor] = useState<string | undefined>();
  const params = {
    ...Object.fromEntries(Object.entries(appliedFilters).filter(([, v]) => v)),
    ...(cursor ? { cursor } : {}),
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () =>
      (await api.get<Result>('/dean/audit-logs', { params })).data,
  });
  const apply = () => {
    setCursor(undefined);
    setAppliedFilters(filters);
  };
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Audit Logs"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={filters.actor}
              onChange={(e) =>
                setFilters({ ...filters, actor: e.target.value })
              }
              placeholder="Actor or email"
              className="rounded border border-border p-2"
            />
            <input
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
              placeholder="Exact action"
              className="rounded border border-border p-2"
            />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
              className="rounded border border-border p-2"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
              className="rounded border border-border p-2"
            />
            <Button onClick={apply}>Apply filters</Button>
          </div>
        </Card>
        <Card padded={false}>
          {isLoading && (
            <div className="p-5 text-sm text-text-2">Loading audit logs…</div>
          )}
          {isError && (
            <div className="p-5 text-sm text-risk-high">
              Could not load audit logs.
            </div>
          )}
          {!isLoading && !isError && !data?.items.length && (
            <div className="p-5 text-sm text-text-2">
              No audit entries match these filters.
            </div>
          )}
          {data?.items.map((r, i) => (
            <div
              key={`${r.occurredAt}-${i}`}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div className="font-body text-[13px] text-text-1">
                <span className="font-semibold">{r.actorName}</span> {r.action}{' '}
                <span className="text-text-2">
                  · {r.targetType ?? ''} {r.targetId ?? ''}
                </span>
              </div>
              <span className="font-mono text-[11.5px] text-text-3">
                {new Date(r.occurredAt).toLocaleString()}
              </span>
            </div>
          ))}
          {data?.nextCursor && (
            <div className="p-5">
              <Button
                variant="ghost"
                onClick={() => setCursor(data.nextCursor!)}
              >
                Load older entries
              </Button>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
