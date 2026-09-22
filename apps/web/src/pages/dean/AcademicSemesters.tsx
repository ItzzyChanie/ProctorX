import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Period = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
  status: 'ACTIVE' | 'CLOSED';
  startsAt?: string;
  endsAt?: string;
  closedAt?: string;
  _count: { exams: number };
};
export default function AcademicSemesters() {
  const client = useQueryClient(),
    [form, setForm] = useState({
      academicYear: '',
      semester: 'FIRST',
      startsAt: '',
      endsAt: '',
    }),
    [confirm, setConfirm] = useState<{
      period: Period;
      action: 'close' | 'reopen';
    } | null>(null),
    [toast, setToast] = useState<{ message: string; error?: boolean } | null>(
      null
    );
  const periods = useQuery({
    queryKey: ['academic-periods'],
    queryFn: async () => (await api.get<Period[]>('/academic-periods')).data,
  });
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 4000);
  };
  const create = useMutation({
    mutationFn: () =>
      api.post('/dean/academic-periods', {
        ...form,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['academic-periods'] });
      client.invalidateQueries({ queryKey: ['dean-dashboard'] });
      setForm({
        academicYear: '',
        semester: 'FIRST',
        startsAt: '',
        endsAt: '',
      });
      notify('Academic semester started successfully.');
    },
    onError: (e: any) =>
      notify(
        e.response?.data?.message ?? 'Could not start the semester.',
        true
      ),
  });
  const change = useMutation({
    mutationFn: () =>
      api.post(
        `/dean/academic-periods/${confirm?.period.id}/${confirm?.action}`
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['academic-periods'] });
      client.invalidateQueries({ queryKey: ['dean-dashboard'] });
      notify(
        `Academic semester ${confirm?.action === 'close' ? 'closed' : 'reopened'} successfully.`
      );
      setConfirm(null);
    },
    onError: (e: any) =>
      notify(
        e.response?.data?.message ?? 'Could not update the semester.',
        true
      ),
  });
  return (
    <DashboardLayout
      role="dean"
      pageTitle="Academic Semesters"
      userName="Dean"
      userTag="School of Computer Studies"
    >
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Start a new academic semester"
            subtitle="A new semester can begin only after the current active semester is closed."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-semibold">
              Academic year
              <input
                value={form.academicYear}
                onChange={(e) =>
                  setForm((x) => ({ ...x, academicYear: e.target.value }))
                }
                placeholder="2027-2028"
                className="mt-1 w-full rounded-lg border border-border p-2.5"
              />
            </label>
            <label className="text-xs font-semibold">
              Semester
              <select
                value={form.semester}
                onChange={(e) =>
                  setForm((x) => ({ ...x, semester: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border p-2.5"
              >
                <option value="FIRST">First Semester</option>
                <option value="SECOND">Second Semester</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Start date
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) =>
                  setForm((x) => ({ ...x, startsAt: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border p-2.5"
              />
            </label>
            <label className="text-xs font-semibold">
              End date
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) =>
                  setForm((x) => ({ ...x, endsAt: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border p-2.5"
              />
            </label>
            <div className="flex items-end">
              <Button
                disabled={!form.academicYear || create.isPending}
                onClick={() => create.mutate()}
              >
                Start semester
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Academic semester history"
            subtitle="Closed semesters remain available in Teacher, Dean, and Student filters without changing historical calculations."
          />
          {periods.isLoading ? (
            <p className="text-sm text-text-2">Loading semesters…</p>
          ) : periods.isError ? (
            <p className="text-sm text-risk-high">
              Could not load academic semesters.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {periods.data?.map((x) => (
                <div
                  key={x.id}
                  className="flex items-center justify-between rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">
                      <CalendarRange size={19} />
                    </span>
                    <span>
                      <b>
                        {x.academicYear} ·{' '}
                        {x.semester === 'FIRST' ? 'First' : 'Second'} Semester
                      </b>
                      <small className="block text-text-2">
                        {x.status} · {x._count.exams} assessment(s)
                      </small>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        period: x,
                        action: x.status === 'ACTIVE' ? 'close' : 'reopen',
                      })
                    }
                  >
                    {x.status === 'ACTIVE' ? 'Close semester' : 'Reopen'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      {confirm && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader
              title={`${confirm.action === 'close' ? 'Close' : 'Reopen'} academic semester?`}
            />
            <p className="text-sm text-text-2">
              {confirm.action === 'close'
                ? 'Historical data will remain read-only. All active assessments must be stopped and a published or archived Final-term assessment must exist.'
                : 'The semester will accept new assessments again. No other semester may be active.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                disabled={change.isPending}
                onClick={() => change.mutate()}
              >
                Confirm
              </Button>
            </div>
          </Card>
        </div>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[80] rounded-lg px-4 py-3 text-sm text-white ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}
        >
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  );
}
