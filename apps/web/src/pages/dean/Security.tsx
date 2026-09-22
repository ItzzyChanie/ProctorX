import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cookie,
  RotateCcw,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { KPI } from '../../components/ui/KPI';
import { api } from '../../lib/api';

type AccessData = {
  permissions: {
    key: string;
    description: string;
    defaultGranted: boolean;
  }[];
  faculty: {
    userId: string;
    name: string;
    email: string | null;
    employeeId: string | null;
    department: string | null;
    status: string;
    overrides: Record<string, boolean>;
    effective: Record<string, boolean>;
  }[];
};

const friendlyPermission = (key: string) =>
  key
    .toLowerCase()
    .split('_')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');

export default function Security() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const access = useQuery({
    queryKey: ['dean-security-access'],
    queryFn: async () =>
      (await api.get<AccessData>('/dean/security/access')).data,
  });
  const visibleFaculty = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (access.data?.faculty ?? []).filter((member) =>
      [
        member.name,
        member.email ?? '',
        member.employeeId ?? '',
        member.department ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [access.data?.faculty, search]);
  const selected =
    access.data?.faculty.find((member) => member.userId === selectedId) ??
    visibleFaculty[0];
  const refresh = async (notice: string) => {
    await queryClient.invalidateQueries({ queryKey: ['dean-security-access'] });
    setMessage(notice);
    window.setTimeout(() => setMessage(''), 3000);
  };
  const setOverride = useMutation({
    mutationFn: ({
      userId,
      permissionKey,
      granted,
    }: {
      userId: string;
      permissionKey: string;
      granted: boolean;
    }) =>
      api.patch('/dean/security/faculty/' + userId + '/permissions', {
        permissionKey,
        granted,
      }),
    onSuccess: () => refresh('Permission override saved.'),
  });
  const resetOverride = useMutation({
    mutationFn: ({
      userId,
      permissionKey,
    }: {
      userId: string;
      permissionKey: string;
    }) =>
      api.delete(
        '/dean/security/faculty/' +
          userId +
          '/permissions/' +
          permissionKey
      ),
    onSuccess: () => refresh('Permission restored to the role default.'),
  });
  const pending = setOverride.isPending || resetOverride.isPending;

  return (
    <DashboardLayout role="dean" pageTitle="Security & Access">
      {message && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl"
        >
          {message}
        </div>
      )}
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KPI
            label="Session authentication"
            value="HTTP-only cookie"
            mono={false}
            icon={Cookie}
            accent={0}
          />
          <KPI
            label="Authorization"
            value="Role + capability"
            mono={false}
            icon={ShieldCheck}
            accent={2}
          />
          <KPI
            label="Audit history"
            value="Append-only"
            mono={false}
            icon={ScrollText}
            accent={1}
          />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader
              title="Faculty access"
              subtitle="Select a faculty member to review capability overrides."
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search faculty"
              className="mb-3 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
            />
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {visibleFaculty.map((member) => (
                <button
                  key={member.userId}
                  onClick={() => setSelectedId(member.userId)}
                  className={
                    'w-full rounded-xl border p-3 text-left transition ' +
                    (selected?.userId === member.userId
                      ? 'border-brand bg-brand-soft'
                      : 'border-border hover:bg-surface-2')
                  }
                >
                  <span className="block font-semibold text-text-1">
                    {member.name}
                  </span>
                  <span className="block text-xs text-text-3">
                    {member.employeeId ?? 'No employee ID'}
                    <span aria-hidden="true"> &bull; </span>
                    {member.department ?? 'Unassigned'}
                  </span>
                </button>
              ))}
              {!visibleFaculty.length && (
                <p className="py-8 text-center text-sm text-text-3">
                  No faculty found.
                </p>
              )}
            </div>
          </Card>
          <Card padded={false}>
            <div className="p-5">
              <CardHeader
                title={selected?.name ?? 'Permission overrides'}
                subtitle={
                  selected
                    ? 'Overrides take precedence over the Teacher role defaults. Reset an override to inherit the default again.'
                    : 'Select a faculty member to manage access.'
                }
              />
              {selected && (
                <div className="flex flex-wrap gap-2 text-xs text-text-3">
                  <span>{selected.email}</span>
                  <span aria-hidden="true">&bull;</span>
                  <span>{selected.status}</span>
                </div>
              )}
            </div>
            {selected &&
              access.data?.permissions.map((permission, index) => {
                const overridden = Object.prototype.hasOwnProperty.call(
                  selected.overrides,
                  permission.key
                );
                const granted = selected.effective[permission.key];
                return (
                  <div
                    key={permission.key}
                    className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-text-1">
                        {friendlyPermission(permission.key)}
                      </p>
                      <p className="mt-1 text-xs text-text-3">
                        {permission.description}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-text-3">
                        {overridden
                          ? 'Custom override'
                          : 'Inherited Teacher default'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {overridden && (
                        <button
                          disabled={pending}
                          onClick={() =>
                            resetOverride.mutate({
                              userId: selected.userId,
                              permissionKey: permission.key,
                            })
                          }
                          title="Restore role default"
                          className="rounded-lg p-2 text-text-3 hover:bg-surface-2 hover:text-brand disabled:opacity-50"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={granted}
                        aria-label={
                          (granted ? 'Revoke ' : 'Grant ') +
                          friendlyPermission(permission.key)
                        }
                        disabled={pending}
                        onClick={() =>
                          setOverride.mutate({
                            userId: selected.userId,
                            permissionKey: permission.key,
                            granted: !granted,
                          })
                        }
                        className={
                          'relative h-7 w-12 rounded-full transition disabled:opacity-50 ' +
                          (granted ? 'bg-emerald-500' : 'bg-slate-300')
                        }
                      >
                        <span
                          className={
                            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ' +
                            (granted ? 'left-6' : 'left-1')
                          }
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            {!selected && !access.isLoading && (
              <p className="border-t border-border p-8 text-center text-sm text-text-3">
                No faculty account is available for permission management.
              </p>
            )}
            {access.isLoading && (
              <p className="border-t border-border p-8 text-center text-sm text-text-3">
                Loading permissions...
              </p>
            )}
            {access.isError && (
              <p className="border-t border-border p-8 text-center text-sm text-red-600">
                Permission data could not be loaded.
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
