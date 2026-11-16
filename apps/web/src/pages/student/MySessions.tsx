import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CheckCircle2, LogIn, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { api } from '../../lib/api';

type Session = {
  sessionId: string;
  examTitle: string;
  subjectCode: string;
  startedAt: string;
  durationSec: number | null;
  reviewStatus: 'NO_FLAGS' | 'FLAGGED' | 'NEGATIVE' | 'POSITIVE';
  proctorReviewedAt: string | null;
  submission: { id: string; gradeStatus: string; totalScore: number | null; maxScore: number } | null;
  term?:string;
  academicPeriod?:{id:string;academicYear:string;semester:'FIRST'|'SECOND'};
};
export default function MySessions() {
  const navigate = useNavigate();
  const [periodId,setPeriodId]=useState(''),[term,setTerm]=useState('');
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['student-sessions'],
    queryFn: async () =>
      (await api.get<Session[]>('/students/me/sessions')).data,
    refetchInterval: 5_000,
  });
  const periodOptions=useQuery({queryKey:['academic-periods'],queryFn:async()=>(await api.get<{id:string;academicYear:string;semester:'FIRST'|'SECOND'}[]>('/academic-periods')).data});
  const periods=periodOptions.data??[...new Map(rows.filter(x=>x.academicPeriod).map(x=>[x.academicPeriod!.id,x.academicPeriod!])).values()];
  const visible=useMemo(()=>rows.filter(x=>(!periodId||x.academicPeriod?.id===periodId)&&(!term||x.term===term)),[rows,periodId,term]);
  return (
    <DashboardLayout
      role="student"
      pageTitle="My Sessions"
      userName="Jefferson Palceso"
      userTag="Student"
    >
      <Card padded={false}>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardHeader
              title="Session history"
              subtitle="Monitoring review status is separate from your exam grade"
            />
            <Button
              variant="ghost"
              icon={LogIn}
              className="shrink-0"
              onClick={() => navigate('/student/join')}
            >
              Join session
            </Button>
          </div>
        </div>
        <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2"><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="rounded border border-border bg-surface p-2"><option value="">All semesters</option>{periods.map(x=><option key={x.id} value={x.id}>{x.academicYear} · {x.semester==='FIRST'?'First':'Second'} Semester</option>)}</select><select value={term} onChange={e=>setTerm(e.target.value)} className="rounded border border-border bg-surface p-2"><option value="">All terms</option><option value="PRELIMINARY">Preliminary</option><option value="MIDTERM">Midterm</option><option value="SEMI_FINAL">Semi-final</option><option value="FINAL">Final</option></select></div>
        {isLoading && (
          <div className="p-5 text-sm text-text-2">
            Loading your session history…
          </div>
        )}
        {isError && (
          <div className="p-5 text-sm text-risk-high">
            Could not load your session history.
          </div>
        )}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="p-5 text-sm text-text-2">
            You have not joined any monitored sessions yet.
          </div>
        )}
        {!isLoading && !isError && rows.length > 0 && visible.length === 0 && (
          <div className="p-5 text-sm text-text-2">
            No sessions match the selected semester and term.
          </div>
        )}
        {visible.map((r, i) => (
          <div
            key={r.sessionId}
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <div>
              <div className="font-body text-[13.5px] font-semibold text-text-1">
                {r.subjectCode} — {r.examTitle}
              </div>
              <div className="font-body text-[11.5px] text-text-3">
                {r.academicPeriod ? `${r.academicPeriod.academicYear} · ${r.academicPeriod.semester==='FIRST'?'First Semester':'Second Semester'}` : 'Current semester'} · {(r.term ?? 'PRELIMINARY').replace('_',' ')} ·{' '}
                {new Date(r.startedAt).toLocaleDateString()} ·{' '}
                {r.durationSec === null
                  ? 'In progress'
                  : `${Math.round(r.durationSec / 60)}m`}
              </div>
            </div>
            <div className="max-w-72 text-right">
              <Chip
                color={
                  r.reviewStatus === 'POSITIVE'
                    ? 'var(--risk-high)'
                    : r.reviewStatus === 'FLAGGED'
                      ? 'var(--risk-med)'
                      : 'var(--risk-low)'
                }
              >
                <span className="inline-flex items-center gap-1">
                  {r.reviewStatus === 'NEGATIVE' && <CheckCircle2 size={13} />}
                  {r.reviewStatus === 'POSITIVE' && <TriangleAlert size={13} />}
                  {r.reviewStatus === 'NEGATIVE'
                    ? 'NEGATIVE — No issue'
                    : r.reviewStatus === 'POSITIVE'
                      ? 'POSITIVE — Violation confirmed'
                      : r.reviewStatus === 'FLAGGED'
                        ? 'Flagged — Teacher review pending'
                        : 'No monitoring flags detected'}
                </span>
              </Chip>
              {r.reviewStatus === 'FLAGGED' && (
                <p className="mt-1.5 text-[11px] leading-4 text-text-3">
                  The proctoring system detected monitoring events. Your teacher
                  has not made a final decision yet.
                </p>
              )}
              {r.reviewStatus === 'NEGATIVE' && (
                <p className="mt-1.5 text-[11px] leading-4 text-risk-low">
                  Your teacher reviewed the flags and found no violation.
                </p>
              )}
              {r.reviewStatus === 'POSITIVE' && (
                <p className="mt-1.5 text-[11px] leading-4 text-risk-high">
                  Your teacher reviewed the session and confirmed a violation.
                </p>
              )}
              {r.submission && (
                <Button
                  variant="ghost"
                  className="mt-2 !px-2.5 !py-1.5"
                  onClick={() => navigate(`/student/sessions/${r.sessionId}/result`)}
                >
                  {r.submission.gradeStatus === 'TEACHER_CONFIRMED'
                    ? 'View result'
                    : r.submission.gradeStatus === 'PENDING_RELEASE'
                      ? 'Results after exam closes'
                      : 'Grading pending'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
