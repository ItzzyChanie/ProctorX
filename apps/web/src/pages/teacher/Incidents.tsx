import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';

type Incident = {
  id: string;
  type: string;
  intensity: number | null;
  occurredAt: string;
  session: {
    id: string;
    student: { fullName: string };
    exam: { title: string };
    scoreHistory: { score: number }[];
  };
};
type ExportRequest = { sessionId: string; format: 'pdf' | 'html' };

export default function Incidents() {
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const timers = useRef<number[]>([]);
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => (await api.get<Incident[]>('/reports/incidents')).data,
  });
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 3500);
  };
  const exportReport = useMutation({
    mutationFn: async ({ sessionId, format }: ExportRequest) => {
      const { data } = await api.get(`/reports/${sessionId}/export`, {
        params: { format },
      });
      return new Promise<string>((resolve, reject) => {
        const timer = window.setInterval(async () => {
          try {
            const { data: job } = await api.get(`/reports/jobs/${data.job_id}`);
            if (job.status === 'SUCCESS') {
              window.clearInterval(timer);
              resolve(job.result?.path ?? 'Report generated.');
            } else if (['FAILURE', 'REVOKED'].includes(job.status)) {
              window.clearInterval(timer);
              reject(new Error('Report generation failed.'));
            }
          } catch {
            window.clearInterval(timer);
            reject(new Error('Could not check report status.'));
          }
        }, 2000);
        timers.current.push(timer);
      });
    },
    onSuccess: (path) => notify(`Report ready: ${path}`),
    onError: (error) =>
      notify(
        error instanceof Error
          ? error.message
          : 'Could not generate the report.',
        true
      ),
  });
  useEffect(() => () => timers.current.forEach(window.clearInterval), []);
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Incident Reports"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-50 rounded px-4 py-3 text-sm text-white ${
            toast.error ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.message}
        </div>
      )}
      <Card padded={false}>
        <div className="p-5">
          <CardHeader
            title="Incident reports"
            subtitle="Real timestamped evidence from monitored sessions"
          />
        </div>
        {isLoading && (
          <div className="p-5 text-sm text-text-2">
            Loading incident events…
          </div>
        )}
        {isError && (
          <div className="p-5 text-sm text-risk-high">
            Could not load incident events.
          </div>
        )}
        {!isLoading && !isError && !rows.length && (
          <div className="p-5 text-sm text-text-2">
            No incident events have been recorded for your sessions.
          </div>
        )}
        {rows.map((row) => {
          const pending =
            exportReport.isPending &&
            exportReport.variables?.sessionId === row.session.id;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5"
            >
              <div>
                <div className="font-semibold text-text-1">
                  {row.session.student.fullName}
                </div>
                <div className="text-xs text-text-3">
                  {row.session.exam.title} ·{' '}
                  {row.type.split('_').join(' ').toLowerCase()} ·{' '}
                  {new Date(row.occurredAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>{row.session.scoreHistory[0]?.score ?? 0}</span>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    exportReport.mutate({
                      sessionId: row.session.id,
                      format: 'pdf',
                    })
                  }
                >
                  {pending && exportReport.variables?.format === 'pdf'
                    ? 'Generating…'
                    : 'PDF'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    exportReport.mutate({
                      sessionId: row.session.id,
                      format: 'html',
                    })
                  }
                >
                  {pending && exportReport.variables?.format === 'html'
                    ? 'Generating…'
                    : 'HTML'}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </DashboardLayout>
  );
}
