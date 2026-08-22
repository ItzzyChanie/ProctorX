import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
type Professor = {
  userId: string;
  name: string;
  subjects: string[];
  lastActiveAt: string;
};
const inviteSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  email: z.string().email().max(320),
});
export default function Departments() {
  const client = useQueryClient(),
    [show, setShow] = useState(false),
    [form, setForm] = useState({ fullName: '', email: '' }),
    [message, setMessage] = useState('');
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['professors'],
    queryFn: async () => (await api.get<Professor[]>('/dean/professors')).data,
  });
  const invite = useMutation({
    mutationFn: (data: { fullName: string; email: string }) =>
      api.post('/dean/professors/invite', data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['professors'] });
      setShow(false);
      setForm({ fullName: '', email: '' });
      setMessage(
        'Professor invited. They can activate their account with the normal OTP flow.'
      );
    },
    onError: () =>
      setMessage('Could not invite professor. Check the email address.'),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = inviteSchema.safeParse(form);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message ?? 'Check the invitation details.'
      );
      return;
    }
    invite.mutate(parsed.data);
  };
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Departments & Professors"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="Professors"
            right={
              <Button icon={Plus} onClick={() => setShow(true)}>
                Invite professor
              </Button>
            }
          />
        </div>
        {message && (
          <div
            role="status"
            className="mx-5 mb-3 rounded bg-brand-soft p-3 text-sm"
          >
            {message}
          </div>
        )}
        {isLoading && (
          <div className="p-5 text-sm text-text-2">Loading professors…</div>
        )}
        {isError && (
          <div className="p-5 text-sm text-risk-high">
            Could not load professors.
          </div>
        )}
        {!isLoading && !isError && !rows.length && (
          <div className="p-5 text-sm text-text-2">
            No professor accounts yet.
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={r.userId}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
          >
            <div>
              <div className="font-body text-[13.5px] font-semibold text-text-1">
                {r.name}
              </div>
              <div className="font-body text-[11.5px] text-text-3">
                {r.subjects.join(', ') || 'No assigned subjects'}
              </div>
            </div>
            <span className="font-body text-[11.5px] text-text-3">
              Active {new Date(r.lastActiveAt).toLocaleString()}
            </span>
          </div>
        ))}
      </Card>
      {show && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-md rounded-[16px] bg-surface p-6 shadow-2xl"
          >
            <div className="mb-5 flex justify-between">
              <h2 className="font-head text-xl font-bold">Invite professor</h2>
              <button type="button" onClick={() => setShow(false)}>
                <X size={20} />
              </button>
            </div>
            <label className="block text-sm">
              Full name
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="mt-1 w-full rounded border border-border p-2"
              />
            </label>
            <label className="mt-3 block text-sm">
              School email
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded border border-border p-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShow(false)}
              >
                Cancel
              </Button>
              <Button disabled={invite.isPending}>
                {invite.isPending ? 'Inviting…' : 'Send invite'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
