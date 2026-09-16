import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Plus, RotateCcw } from 'lucide-react';
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
  term?: string;
  sessionsArchivedAt?: string | null;
  academicPeriod?: { id:string; academicYear:string; semester:'FIRST'|'SECOND' };
};
export default function Sessions() {
  const nav = useNavigate(),
    client = useQueryClient(),
    [toast, setToast] = useState(''),
    [toastError, setToastError] = useState(false),
    [periodId,setPeriodId]=useState(''),
    [term,setTerm]=useState(''),
    [archiveTab, setArchiveTab] = useState<'active' | 'archived'>('active'),
    [archiving, setArchiving] = useState<Exam | null>(null);
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['teacher-exams', archiveTab],
    queryFn: async () =>
      (
        await api.get<Exam[]>('/teacher/exams', {
          params: archiveTab === 'archived' ? { archive: 'archived' } : undefined,
        })
      ).data,
    refetchInterval: 5_000,
  });
  const periodOptions=useQuery({queryKey:['academic-periods'],queryFn:async()=>(await api.get<{id:string;academicYear:string;semester:'FIRST'|'SECOND'}[]>('/academic-periods')).data});
  const periods=periodOptions.data??[...new Map(rows.filter(x=>x.academicPeriod).map(x=>[x.academicPeriod!.id,x.academicPeriod!])).values()];
  const visible=useMemo(()=>rows.filter(x=>(!periodId||x.academicPeriod?.id===periodId)&&(!term||x.term===term)),[rows,periodId,term]);
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setToastError(false);
    setToast('Room code copied.');
    window.setTimeout(() => setToast(''), 2500);
  };
  const archiveExam = useMutation({
    mutationFn: (examId: string) =>
      api.patch(`/teacher/exams/${examId}/archive`),
    onSuccess: () => {
      setArchiving(null);
      setToastError(false);
      setToast('Assessment archived from Sessions.');
      void client.invalidateQueries({ queryKey: ['teacher-exams'] });
      window.setTimeout(() => setToast(''), 3000);
    },
    onError: (error: any) => {
      setToastError(true);
      setToast(
        error?.response?.data?.message ??
          'The assessment could not be archived.'
      );
      window.setTimeout(() => setToast(''), 5000);
    },
  });
  const restoreExam = useMutation({
    mutationFn: (examId: string) =>
      api.patch(`/teacher/exams/${examId}/restore`),
    onSuccess: () => {
      setToastError(false);
      setToast('Assessment restored to active Sessions.');
      void client.invalidateQueries({ queryKey: ['teacher-exams'] });
      window.setTimeout(() => setToast(''), 3000);
    },
    onError: (error: any) => {
      setToastError(true);
      setToast(
        error?.response?.data?.message ??
          'The assessment could not be restored.'
      );
      window.setTimeout(() => setToast(''), 5000);
    },
  });
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
            className={`fixed bottom-5 right-5 z-[80] rounded px-4 py-3 text-sm text-white ${
              toastError ? 'bg-red-600' : 'bg-emerald-600'
            }`}
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
        <Card>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={archiveTab === 'active' ? 'primary' : 'ghost'}
              onClick={() => setArchiveTab('active')}
            >
              Active sessions
            </Button>
            <Button
              variant={archiveTab === 'archived' ? 'primary' : 'ghost'}
              onClick={() => setArchiveTab('archived')}
            >
              Archived sessions
            </Button>
          </div>
        </Card>
        <Card><div className="grid gap-3 md:grid-cols-2"><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="rounded border border-border bg-surface p-2"><option value="">All semesters</option>{periods.map(x=><option key={x.id} value={x.id}>{x.academicYear} · {x.semester==='FIRST'?'First':'Second'} Semester</option>)}</select><select value={term} onChange={e=>setTerm(e.target.value)} className="rounded border border-border bg-surface p-2"><option value="">All terms</option><option value="PRELIMINARY">Preliminary</option><option value="MIDTERM">Midterm</option><option value="SEMI_FINAL">Semi-final</option><option value="FINAL">Final</option></select></div></Card>
        <Card padded={false}>
          {isLoading && (
            <div className="p-5 text-sm text-text-2">Loading exams…</div>
          )}
          {isError && (
            <div className="p-5 text-sm text-risk-high">
              Could not load your exams.
            </div>
          )}
          {!isLoading && !isError && !visible.length && (
            <div className="p-5 text-sm text-text-2">
              {archiveTab === 'archived'
                ? 'No archived assessments match the selected filters.'
                : 'No active assessments match the selected filters.'}
            </div>
          )}
          {visible.map((r, i) => (
            <div
              key={r.examId}
              className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}
            >
              <div>
                <div className="font-body text-[13.5px] font-semibold text-text-1">
                  {r.subjectCode} — {r.title}
                </div>
                <div className="text-xs text-brand">{r.academicPeriod ? `${r.academicPeriod.academicYear} · ${r.academicPeriod.semester === 'FIRST' ? 'First Semester' : 'Second Semester'}` : 'Current semester'} · {(r.term ?? 'PRELIMINARY').replace('_',' ')}</div>
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
                {archiveTab === 'archived' ? (
                  <Button
                    variant="ghost"
                    icon={RotateCcw}
                    disabled={restoreExam.isPending}
                    onClick={() => restoreExam.mutate(r.examId)}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    icon={Archive}
                    disabled={r.status !== 'Ended' || archiveExam.isPending}
                    title={
                      r.status === 'Ended'
                        ? 'Archive assessment'
                        : 'Only ended assessments can be archived'
                    }
                    onClick={() => setArchiving(r)}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
      {archiving && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-5">
            <h2 className="text-lg font-bold">Archive assessment?</h2>
            <p className="mt-2 text-sm text-text-2">
              Archive <b>{archiving.title}</b> from the Sessions list? Exam
              records, submissions, and monitoring history will be retained.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={archiveExam.isPending}
                onClick={() => setArchiving(null)}
              >
                Cancel
              </Button>
              <Button
                icon={Archive}
                disabled={archiveExam.isPending}
                onClick={() => archiveExam.mutate(archiving.examId)}
              >
                {archiveExam.isPending ? 'Archiving…' : 'Archive assessment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
