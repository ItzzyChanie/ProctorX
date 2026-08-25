import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { api } from '../../lib/api';
type Exam = {
  examId: string;
  title: string;
  subjectCode: string;
  roomCode: string;
  status: string;
  liveSessionCount: number;
  studentCount: number;
};
export default function Sessions() {
  const nav = useNavigate(),
    [toast, setToast] = useState('');
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['teacher-exams'],
    queryFn: async () => (await api.get<Exam[]>('/teacher/exams')).data,
    refetchInterval: 5_000,
  });
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setToast('Room code copied.');
    window.setTimeout(() => setToast(''), 2500);
  };
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Sessions"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        {toast && (
          <div
            role="status"
            className="fixed bottom-5 right-5 rounded bg-emerald-600 px-4 py-3 text-sm text-white"
          >
            {toast}
          </div>
        )}
        <Card>
          <CardHeader
            title="Exams and sessions"
            subtitle="Room codes are generated when you create an exam in the real exam builder."
            right={
              <Button icon={Plus} onClick={() => nav('/teacher/classes')}>
                Create exam
              </Button>
            }
          />
        </Card>
        <Card padded={false}>
          {isLoading && (
            <div className="p-5 text-sm text-text-2">Loading exams…</div>
          )}
          {isError && (
            <div className="p-5 text-sm text-risk-high">
              Could not load your exams.
            </div>
          )}
          {!isLoading && !isError && !rows.length && (
            <div className="p-5 text-sm text-text-2">
              Create an exam to generate its student room code.
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.examId}
              className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div>
                <div className="font-body text-[13.5px] font-semibold text-text-1">
                  {r.subjectCode} — {r.title}
                </div>
                <div className="font-body text-[11.5px] text-text-3">
                  {r.studentCount} enrolled · {r.liveSessionCount} live
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => void copy(r.roomCode)}
                  className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-brand"
                  aria-label={`Copy room code ${r.roomCode}`}
                >
                  {r.roomCode}
                  <Copy size={13} />
                </button>
                <Chip
                  color={
                    r.status === 'Live'
                      ? 'var(--risk-low)'
                      : r.status === 'Scheduled'
                        ? 'var(--brand)'
                        : 'var(--text-3)'
                  }
                >
                  {r.status}
                </Chip>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </DashboardLayout>
  );
}
