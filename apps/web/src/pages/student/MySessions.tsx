import { useQuery } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
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
  reviewStatus: 'CLEARED' | 'UNDER_REVIEW';
};
export default function MySessions() {
  const navigate = useNavigate();
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['student-sessions'],
    queryFn: async () =>
      (await api.get<Session[]>('/students/me/sessions')).data,
  });
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
              subtitle="Every monitored assessment you've taken"
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
        {rows.map((r, i) => (
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
                {new Date(r.startedAt).toLocaleDateString()} ·{' '}
                {r.durationSec === null
                  ? 'In progress'
                  : `${Math.round(r.durationSec / 60)}m`}
              </div>
            </div>
            <Chip
              color={
                r.reviewStatus === 'CLEARED'
                  ? 'var(--risk-low)'
                  : 'var(--risk-med)'
              }
            >
              {r.reviewStatus === 'CLEARED' ? 'Cleared' : 'Under Review'}
            </Chip>
          </div>
        ))}
      </Card>
    </DashboardLayout>
  );
}
