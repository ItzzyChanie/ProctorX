import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3 } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { api } from '../../lib/api';

type Period = {
  id: string;
  academicYear: string;
  semester: 'FIRST' | 'SECOND';
};
type Assessment = {
  id: string;
  title: string;
  assessmentType: 'EXAM' | 'QUIZ';
  scheduledAt: string;
  endsAt: string | null;
  durationMinutes: number;
  status: string;
  term: string;
  createdAt: string;
  academicPeriod: Period;
  sessions: { id: string; status: string }[];
  subject: {
    id: string;
    subjectCode: string | null;
    name: string;
    teacherName: string;
  };
};
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const countdown = (value: string, now: number) => {
  const difference = +new Date(value) - now;
  if (difference <= 0) return 'Ongoing';
  const days = Math.floor(difference / 86_400_000);
  const hours = Math.floor(difference / 3_600_000) % 24;
  const minutes = Math.floor(difference / 60_000) % 60;
  return days
    ? `Starts in ${days}d ${hours}h`
    : hours
      ? `Starts in ${hours}h ${minutes}m`
      : `Starts in ${minutes}m`;
};
const assessmentState = (assessment: Assessment, now: number) => {
  const finished =
    assessment.sessions.some((session) => session.status === 'COMPLETED') ||
    assessment.status === 'ARCHIVED' ||
    (assessment.endsAt !== null && +new Date(assessment.endsAt) <= now);
  if (finished) return { label: 'Finished', className: 'text-text-3' };
  if (+new Date(assessment.scheduledAt) <= now)
    return { label: 'Ongoing', className: 'text-emerald-600' };
  return {
    label: countdown(assessment.scheduledAt, now),
    className: 'text-brand',
  };
};
export default function AssessmentCalendar() {
  const [periodId, setPeriodId] = useState('');
  const [term, setTerm] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['student-assessments'],
    queryFn: async () =>
      (await api.get<Assessment[]>('/students/me/assessments')).data,
    refetchInterval: 60_000,
  });
  const periods = [
    ...new Map(
      data.map((item) => [item.academicPeriod.id, item.academicPeriod])
    ).values(),
  ];
  const subjects = [
    ...new Map(data.map((item) => [item.subject.id, item.subject])).values(),
  ];
  const filtered = useMemo(
    () =>
      data.filter(
        (item) =>
          (!periodId || item.academicPeriod.id === periodId) &&
          (!term || item.term === term) &&
          (!subjectId || item.subject.id === subjectId) &&
          monthKey(new Date(item.scheduledAt)) === month
      ),
    [data, periodId, term, subjectId, month]
  );
  const scheduledList = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aFinished = assessmentState(a, now).label === 'Finished';
        const bFinished = assessmentState(b, now).label === 'Finished';
        return (
          Number(aFinished) - Number(bFinished) ||
          +new Date(b.createdAt) - +new Date(a.createdAt)
        );
      }),
    [filtered, now]
  );
  const days = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    const count = new Date(year, monthNumber, 0).getDate();
    const offset = new Date(year, monthNumber - 1, 1).getDay();
    return [
      ...Array(offset).fill(null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [month]);
  return (
    <DashboardLayout role="student" pageTitle="Assessment Calendar">
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Assessment calendar"
            subtitle="Scheduled exams and quizzes with live countdowns"
          />
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded border border-border bg-surface p-2"
            />
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subjectCode ?? subject.name}
                </option>
              ))}
            </select>
            <select
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All semesters</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.academicYear} ·{' '}
                  {period.semester === 'FIRST' ? 'First' : 'Second'} Semester
                </option>
              ))}
            </select>
            <select
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className="rounded border border-border bg-surface p-2"
            >
              <option value="">All terms</option>
              <option value="PRELIMINARY">Preliminary</option>
              <option value="MIDTERM">Midterm</option>
              <option value="SEMI_FINAL">Semi-final</option>
              <option value="FINAL">Final</option>
            </select>
          </div>
        </Card>
        {isLoading && <Card>Loading assessments…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">Could not load assessments.</span>
          </Card>
        )}
        {!isLoading && !isError && (
          <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
            <Card>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-text-3">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                  (day) => (
                    <div key={day} className="p-2">
                      {day}
                    </div>
                  )
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => (
                  <div
                    key={index}
                    className={`min-h-24 rounded-lg border p-2 ${day !== null && month === monthKey(new Date(now)) && day === new Date(now).getDate() ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-400 dark:bg-blue-950/30' : 'border-border'}`}
                  >
                    {day && (
                      <>
                        <div
                          className={`text-xs font-semibold ${month === monthKey(new Date(now)) && day === new Date(now).getDate() ? 'inline-grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white' : 'text-text-2'}`}
                        >
                          {day}
                        </div>
                        {filtered
                          .filter(
                            (item) =>
                              new Date(item.scheduledAt).getDate() === day
                          )
                          .map((item) => (
                            <div
                              key={item.id}
                              className="mt-1 rounded bg-brand-soft px-2 py-1 text-[10px] font-semibold text-brand"
                            >
                              {item.title}
                            </div>
                          ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Scheduled list" />
              {scheduledList.length ? (
                <div className="mt-2 space-y-3">
                  {scheduledList.map((item) => {
                    const state = assessmentState(item, now);
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-text-1">
                              {item.title}
                            </div>
                            <div className="text-xs text-text-3">
                              {item.subject.subjectCode ?? item.subject.name} ·{' '}
                              {item.assessmentType === 'QUIZ' ? 'Quiz' : 'Exam'}
                            </div>
                          </div>
                          <CalendarDays size={17} className="text-brand" />
                        </div>
                        <div className="mt-2 text-xs text-text-2">
                          {formatDateTime(item.scheduledAt)}
                        </div>
                        <div
                          className={`mt-1 flex items-center gap-1 text-xs font-semibold ${state.className}`}
                        >
                          <Clock3 size={13} />
                          {state.label}
                        </div>
                        {item.endsAt && (
                          <div className="mt-1 text-[11px] text-text-3">
                            Deadline: {formatDateTime(item.endsAt)}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-2">
                  No scheduled assessments match these filters.
                </p>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
