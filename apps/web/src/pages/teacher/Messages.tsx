import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hand } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
type HandRequest = {
  id: string;
  reason: string | null;
  raisedAt: string;
  session: { student: { fullName: string }; exam: { title: string; term?:string; academicPeriod?:{academicYear:string;semester:'FIRST'|'SECOND'} } };
};
export default function Messages() {
  const client = useQueryClient(),
    [toast, setToast] = useState('');
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['raise-hand-queue'],
    queryFn: async () =>
      (await api.get<HandRequest[]>('/teacher/raise-hand-queue')).data,
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      api.post(`/teacher/raise-hand-queue/${id}/resolve`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['raise-hand-queue'] });
      setToast('Raised-hand request resolved.');
      window.setTimeout(() => setToast(''), 2500);
    },
    onError: () => setToast('Could not resolve the request.'),
  });
  useEffect(() => {
    const refresh = () =>
      client.invalidateQueries({ queryKey: ['raise-hand-queue'] });
    socket.connect();
    socket.on('raise-hand:new', refresh);
    return () => {
      socket.off('raise-hand:new', refresh);
      socket.disconnect();
    };
  }, [client]);
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Raise-Hand Queue"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <>
        {toast && (
          <div
            role="status"
            className="fixed bottom-5 right-5 rounded bg-emerald-600 px-4 py-3 text-sm text-white"
          >
            {toast}
          </div>
        )}
        <Card padded={false}>
          {isLoading && (
            <div className="p-5 text-sm text-text-2">Loading queue…</div>
          )}
          {isError && (
            <div className="p-5 text-sm text-risk-high">
              Could not load the raise-hand queue.
            </div>
          )}
          {!isLoading && !isError && !rows.length && (
            <div className="p-5 text-sm text-text-2">
              No students are waiting for help.
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-3">
                <Hand size={17} className="text-risk-med" />
                <div>
                  <div className="font-body text-[13px] font-semibold text-text-1">
                    {r.session.student.fullName}
                  </div>
                  <div className="text-[11px] text-brand">{r.session.exam.academicPeriod ? `${r.session.exam.academicPeriod.academicYear} · ${r.session.exam.academicPeriod.semester === 'FIRST' ? 'First Semester' : 'Second Semester'}` : 'Current semester'} · {(r.session.exam.term ?? 'PRELIMINARY').replace('_',' ')}</div>
                  <div className="font-body text-xs text-text-2">
                    {r.reason || 'Raised hand'} · {r.session.exam.title}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-text-3">
                  {new Date(r.raisedAt).toLocaleTimeString()}
                </span>
                <Button
                  variant="ghost"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(r.id)}
                >
                  Resolve
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </>
    </DashboardLayout>
  );
}
