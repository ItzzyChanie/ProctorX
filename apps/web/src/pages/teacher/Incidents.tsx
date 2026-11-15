import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AppWindow,
  Archive,
  CameraOff,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Maximize2,
  Mic,
  MonitorOff,
  PlayCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  TriangleAlert,
  Usb,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api, assetSrc } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

type IncidentEvent = {
  id: string;
  type: string;
  intensity: number | null;
  occurredAt: string;
};
type IncidentReport = {
  id: string;
  startedAt: string;
  eventCount: number;
  latestEventAt: string;
  playbackAvailable: boolean;
  proctorReviewDecision: 'PENDING' | 'NEGATIVE' | 'POSITIVE';
  proctorReviewedAt: string | null;
  student: { id: string; fullName: string; profilePicture?: string };
  exam: {
    title: string;
    term?: string;
    academicPeriod?: {
      id: string;
      academicYear: string;
      semester: 'FIRST' | 'SECOND';
    };
    subject: { code: string };
  };
  events: IncidentEvent[];
  scoreHistory: { score: number; tier: string }[];
};

const eventDetails: Record<
  string,
  { label: string; Icon: LucideIcon; color: string }
> = {
  TAB_SWITCH: { label: 'Tab switch', Icon: AppWindow, color: 'bg-amber-500' },
  FULLSCREEN_EXIT: {
    label: 'Fullscreen exit',
    Icon: Maximize2,
    color: 'bg-orange-500',
  },
  FACE_NOT_VISIBLE: {
    label: 'Face not visible',
    Icon: CameraOff,
    color: 'bg-rose-500',
  },
  EXCESSIVE_EYE_MOVEMENT: {
    label: 'Excessive eye movement',
    Icon: Eye,
    color: 'bg-violet-500',
  },
  POSSIBLE_TALKING: {
    label: 'Possible talking',
    Icon: Mic,
    color: 'bg-sky-500',
  },
  MULTIPLE_FACES_DETECTED: {
    label: 'Multiple faces detected',
    Icon: Users,
    color: 'bg-fuchsia-500',
  },
  VOICE_DETECTED: { label: 'Voice detected', Icon: Mic, color: 'bg-blue-500' },
  BLACKLISTED_APP: {
    label: 'Prohibited application',
    Icon: MonitorOff,
    color: 'bg-red-500',
  },
  USB_EVENT: { label: 'USB activity', Icon: Usb, color: 'bg-cyan-500' },
  IDLE: { label: 'Idle activity', Icon: Clock3, color: 'bg-slate-500' },
  SCREEN_SHARE_STOPPED: {
    label: 'Screen sharing stopped',
    Icon: MonitorOff,
    color: 'bg-red-700',
  },
  MULTIPLE_DISPLAYS: {
    label: 'Multiple displays connected',
    Icon: MonitorOff,
    color: 'bg-violet-600',
  },
};
const detailsFor = (type: string) =>
  eventDetails[type] ?? {
    label: type.split('_').join(' ').toLowerCase(),
    Icon: AlertTriangle,
    color: 'bg-brand',
  };
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value));

export default function Incidents() {
  const canFlagStudent = useAuthStore(
    (state) => state.user?.permissions?.FLAG_STUDENT !== false
  );
  const navigate = useNavigate();
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IncidentReport | null>(
    null
  );
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const timers = useRef<number[]>([]);
  const queryClient = useQueryClient();
  const {
    data: reports = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['incidents', archiveTab],
    queryFn: async () =>
      (
        await api.get<IncidentReport[]>('/reports/incidents', {
          params:
            archiveTab === 'archived' ? { archive: 'archived' } : undefined,
        })
      ).data,
    refetchInterval: 2_000,
  });
  const periodOptions = useQuery({
    queryKey: ['academic-periods'],
    queryFn: async () =>
      (
        await api.get<
          { id: string; academicYear: string; semester: 'FIRST' | 'SECOND' }[]
        >('/academic-periods')
      ).data,
  });
  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter(
      (report) =>
        (!periodId || report.exam.academicPeriod?.id === periodId) &&
        (!term || report.exam.term === term) &&
        (!query ||
          [
            report.student.fullName,
            report.exam.title,
            report.exam.subject.code,
          ].some((value) => value.toLowerCase().includes(query)))
    );
  }, [reports, search, periodId, term]);
  const periods = periodOptions.data ?? [
    ...new Map(
      reports
        .filter((x) => x.exam.academicPeriod)
        .map((x) => [x.exam.academicPeriod!.id, x.exam.academicPeriod!])
    ).values(),
  ];
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 3500);
  };
  const exportReport = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await api.get(`/reports/${sessionId}/export`, {
        params: { format: 'pdf' },
      });
      return new Promise<string>((resolve, reject) => {
        const timer = window.setInterval(async () => {
          try {
            const { data: job } = await api.get(`/reports/jobs/${data.job_id}`);
            if (job.status === 'SUCCESS') {
              window.clearInterval(timer);
              const response = await api.get(
                `/reports/jobs/${data.job_id}/download`,
                { responseType: 'blob' }
              );
              const url = URL.createObjectURL(response.data);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${sessionId}-incident-report.pdf`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
              resolve('PDF report downloaded.');
            } else if (['FAILURE', 'REVOKED'].includes(job.status)) {
              window.clearInterval(timer);
              reject(new Error(job.error || 'Report generation failed.'));
            }
          } catch {
            window.clearInterval(timer);
            reject(new Error('Could not check report status.'));
          }
        }, 2000);
        timers.current.push(timer);
      });
    },
    onSuccess: (message) => notify(message),
    onError: (error) =>
      notify(
        error instanceof Error
          ? error.message
          : 'Could not generate the report.',
        true
      ),
  });
  const deleteReport = useMutation({
    mutationFn: async (sessionId: string) =>
      api.delete(`/reports/incidents/${sessionId}`),
    onSuccess: async (_, sessionId) => {
      if (selected?.id === sessionId) setSelected(null);
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      notify(
        'Incident report archived. Its evidence and review history were retained.'
      );
    },
    onError: () => notify('Could not archive the incident report.', true),
  });
  const restoreReport = useMutation({
    mutationFn: async (sessionId: string) =>
      api.patch(`/reports/incidents/${sessionId}/restore`),
    onSuccess: async (_, sessionId) => {
      if (selected?.id === sessionId) setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      notify('Incident report restored to active reports.');
    },
    onError: () => notify('Could not restore the incident report.', true),
  });
  const reviewProctoring = useMutation({
    mutationFn: async ({
      sessionId,
      decision,
    }: {
      sessionId: string;
      decision: 'NEGATIVE' | 'POSITIVE';
    }) =>
      (await api.patch(`/reports/incidents/${sessionId}/review`, { decision }))
        .data,
    onSuccess: async (reviewed) => {
      setSelected((current) =>
        current?.id === reviewed.id ? { ...current, ...reviewed } : current
      );
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      notify(
        reviewed.proctorReviewDecision === 'NEGATIVE'
          ? 'Review saved: no issue found.'
          : 'Review saved: violation confirmed.'
      );
    },
    onError: () => notify('Could not save the proctoring review.', true),
  });
  useEffect(() => () => timers.current.forEach(window.clearInterval), []);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) =>
      event.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const updated = reports.find((report) => report.id === selected.id);
    if (updated) setSelected(updated);
    else setSelected(null);
  }, [reports, selected?.id]);

  return (
    <DashboardLayout role="teacher" pageTitle="Incident Reports">
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 z-[70] rounded px-4 py-3 text-sm text-white ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}
        >
          {toast.message}
        </div>
      )}
      <Card padded={false}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <CardHeader
            title="Incident reports"
            subtitle="One complete report per student exam session"
          />
          <label className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-text-3 sm:w-80">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, exam, or subject…"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none placeholder:text-text-3"
            />
          </label>
        </div>
        <div className="flex gap-2 border-t border-border px-4 pt-4">
          <Button
            variant={archiveTab === 'active' ? 'primary' : 'ghost'}
            onClick={() => {
              setArchiveTab('active');
              setSelected(null);
            }}
          >
            Active reports
          </Button>
          <Button
            variant={archiveTab === 'archived' ? 'primary' : 'ghost'}
            onClick={() => {
              setArchiveTab('archived');
              setSelected(null);
            }}
          >
            Archived reports
          </Button>
        </div>
        {isLoading && (
          <div className="border-t border-border p-5 text-sm text-text-2">
            Loading incident reports…
          </div>
        )}
        <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2">
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded border border-border bg-surface p-2 text-sm"
          >
            <option value="">All semesters</option>
            {periods.map((x) => (
              <option key={x.id} value={x.id}>
                {x.academicYear} · {x.semester === 'FIRST' ? 'First' : 'Second'}{' '}
                Semester
              </option>
            ))}
          </select>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="rounded border border-border bg-surface p-2 text-sm"
          >
            <option value="">All terms</option>
            <option value="PRELIMINARY">Preliminary</option>
            <option value="MIDTERM">Midterm</option>
            <option value="SEMI_FINAL">Semi-final</option>
            <option value="FINAL">Final</option>
          </select>
        </div>
        {isError && (
          <div className="border-t border-border p-5 text-sm text-risk-high">
            Could not load incident reports.
          </div>
        )}
        {!isLoading && !isError && !reports.length && (
          <div className="border-t border-border p-5 text-sm text-text-2">
            {archiveTab === 'archived'
              ? 'No archived incident reports.'
              : 'No incident events have been recorded for your sessions.'}
          </div>
        )}
        {!isLoading &&
          !isError &&
          reports.length > 0 &&
          !visibleReports.length && (
            <div className="border-t border-border p-8 text-center text-sm text-text-3">
              No incident reports match “{search}”.
            </div>
          )}
        {visibleReports.map((report) => {
          const score = report.scoreHistory[0]?.score ?? 0;
          const tier = report.scoreHistory[0]?.tier ?? 'LOW';
          return (
            <div
              key={report.id}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 sm:px-5"
            >
              <button
                type="button"
                onClick={() => setSelected(report)}
                title="View incident report"
                className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-4 rounded-lg border border-transparent px-2 py-2 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-sm focus-visible:border-slate-400 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 dark:focus-visible:bg-slate-800/70"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {report.student.profilePicture ? (
                    <img
                      src={assetSrc(report.student.profilePicture)}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <UserRound size={19} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-text-1 transition-colors group-hover:text-brand">
                      {report.student.fullName}
                    </span>
                    <span className="block truncate text-xs text-text-3">
                      {report.exam.subject.code} · {report.exam.title} · Last
                      event {formatDateTime(report.latestEventAt)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-right sm:block">
                    <span className="block text-sm font-bold text-text-1">
                      {report.eventCount}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wide text-text-3">
                      events
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${report.proctorReviewDecision === 'NEGATIVE' ? 'bg-emerald-100 text-emerald-700' : tier === 'HIGH' ? 'bg-red-100 text-red-700' : tier === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
                  >
                    {report.proctorReviewDecision === 'NEGATIVE' ? (
                      <CheckCircle2 size={15} aria-label="Safe — no issue" />
                    ) : (
                      score
                    )}
                  </span>
                  <Eye
                    size={18}
                    className="text-brand transition-transform duration-200 group-hover:scale-110"
                  />
                </span>
              </button>
              {archiveTab === 'archived' ? (
                <button
                  type="button"
                  disabled={restoreReport.isPending}
                  onClick={() => restoreReport.mutate(report.id)}
                  className="shrink-0 rounded-lg p-2.5 text-text-3 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                  aria-label={`Restore incident report for ${report.student.fullName}`}
                  title="Restore incident report"
                >
                  <RotateCcw size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={deleteReport.isPending}
                  onClick={() => setPendingDelete(report)}
                  className="shrink-0 rounded-lg p-2.5 text-text-3 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                  aria-label={`Archive incident report for ${report.student.fullName}`}
                  title="Archive incident report"
                >
                  <Archive size={18} />
                </button>
              )}
            </div>
          );
        })}
      </Card>
      {selected && (
        <IncidentModal
          report={selected}
          pending={exportReport.isPending}
          reviewPending={reviewProctoring.isPending}
          canFlagStudent={canFlagStudent}
          onClose={() => setSelected(null)}
          onExport={() => exportReport.mutate(selected.id)}
          onViewRecording={() =>
            navigate(
              '/teacher/recordings?sessionId=' +
                encodeURIComponent(selected.id)
            )
          }
          onReview={(decision) =>
            reviewProctoring.mutate({ sessionId: selected.id, decision })
          }
        />
      )}
      {pendingDelete && (
        <DeleteConfirmationModal
          report={pendingDelete}
          pending={deleteReport.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => deleteReport.mutate(pendingDelete.id)}
        />
      )}
    </DashboardLayout>
  );
}

function DeleteConfirmationModal({
  report,
  pending,
  onCancel,
  onConfirm,
}: {
  report: IncidentReport;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) =>
        !pending && event.target === event.currentTarget && onCancel()
      }
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-report-title"
        aria-describedby="delete-report-description"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <Archive size={21} />
          </span>
          <div>
            <h2
              id="delete-report-title"
              className="font-head text-lg font-bold text-text-1"
            >
              Archive incident report?
            </h2>
            <p
              id="delete-report-description"
              className="mt-2 text-sm leading-6 text-text-2"
            >
              Archive <b>{report.student.fullName}’s</b> report for{' '}
              <b>
                {report.exam.subject.code} · {report.exam.title}
              </b>
              ? Evidence, scores, and review history are retained for authorized
              audits.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={pending} icon={Archive} onClick={onConfirm}>
            {pending ? 'Archiving…' : 'Archive report'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function IncidentModal({
  report,
  pending,
  reviewPending,
  canFlagStudent,
  onClose,
  onExport,
  onViewRecording,
  onReview,
}: {
  report: IncidentReport;
  pending: boolean;
  reviewPending: boolean;
  canFlagStudent: boolean;
  onClose: () => void;
  onExport: () => void;
  onViewRecording: () => void;
  onReview: (decision: 'NEGATIVE' | 'POSITIVE') => void;
}) {
  const counts = useMemo(
    () =>
      Object.entries(
        report.events.reduce<Record<string, number>>((result, event) => {
          result[event.type] = (result[event.type] ?? 0) + 1;
          return result;
        }, {})
      ).sort((a, b) => b[1] - a[1]),
    [report.events]
  );
  const maxCount = Math.max(...counts.map(([, count]) => count), 1);
  const score = report.scoreHistory[0]?.score ?? 0;
  const tier = report.scoreHistory[0]?.tier ?? 'LOW';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="incident-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="flex min-w-0 gap-3">
            {report.student.profilePicture ? (
              <img
                src={assetSrc(report.student.profilePicture)}
                alt=""
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <ShieldAlert size={22} />
              </span>
            )}
            <div className="min-w-0">
              <div className={'flex flex-wrap items-center gap-2'}>
              <h2
                id="incident-title"
                className="truncate font-head text-xl font-bold text-text-1"
              >
                {report.student.fullName}
              </h2>
              <Button
                disabled={!report.playbackAvailable}
                icon={PlayCircle}
                onClick={onViewRecording}
                title={
                  report.playbackAvailable
                    ? 'Open recorded incident evidence for this student'
                    : 'Playback is available after the exam ends'
                }
                className={'shrink-0'}
              >
                {report.playbackAvailable
                  ? 'View recorded evidence'
                  : 'Available after exam ends'}
              </Button>
              </div>
              <p className="mt-0.5 text-sm text-text-3">
                {report.exam.subject.code} · {report.exam.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-3 hover:bg-brand-soft hover:text-brand"
            aria-label="Close report preview"
          >
            <X size={20} />
          </button>
        </header>
        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={AlertTriangle}
              label="Recorded events"
              value={String(report.eventCount)}
            />
            <SummaryCard
              icon={
                report.proctorReviewDecision === 'NEGATIVE'
                  ? CheckCircle2
                  : ShieldAlert
              }
              label="Suspicion score"
              value={
                report.proctorReviewDecision === 'NEGATIVE'
                  ? 'Safe · No issue'
                  : `${score} · ${tier.toLowerCase()}`
              }
              safe={report.proctorReviewDecision === 'NEGATIVE'}
            />
            <SummaryCard
              icon={Clock3}
              label="Latest activity"
              value={formatDateTime(report.latestEventAt)}
              small
            />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <section>
              <h3 className="font-head font-bold text-text-1">
                Event breakdown
              </h3>
              <p className="mb-4 text-xs text-text-3">
                Frequency by monitoring signal
              </p>
              <div className="space-y-4">
                {counts.map(([type, count]) => {
                  const { label, Icon, color } = detailsFor(type);
                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-text-2">
                          <Icon size={15} />
                          {label}
                        </span>
                        <b className="text-text-1">{count}</b>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-canvas">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{
                            width: `${Math.max((count / maxCount) * 100, 8)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <h3 className="font-head font-bold text-text-1">
                Activity timeline
              </h3>
              <p className="mb-3 text-xs text-text-3">
                Complete date and 12-hour timestamp history
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {report.events.map((event) => {
                  const { label, Icon, color } = detailsFor(event.type);
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white ${color}`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text-1">
                          {label}
                        </span>
                        <span className="block text-xs text-text-3">
                          {formatDateTime(event.occurredAt)}
                        </span>
                      </span>
                      {event.intensity !== null && (
                        <span className="text-xs text-text-3">
                          {Math.round(event.intensity * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-border bg-canvas/50 p-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-3">
              Final teacher decision:{' '}
              {report.proctorReviewDecision === 'PENDING'
                ? 'Pending'
                : report.proctorReviewDecision}
            </p>
            {!canFlagStudent && (
              <p className="text-xs font-semibold text-amber-600">
                Review restricted by your dean.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={reviewPending || !canFlagStudent}
                onClick={() => onReview('NEGATIVE')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${report.proctorReviewDecision === 'NEGATIVE' ? 'border-emerald-400 bg-emerald-200 text-emerald-900' : 'border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100'}`}
              >
                <CheckCircle2 size={15} />
                Negative — No issue
              </button>
              <button
                type="button"
                disabled={reviewPending || !canFlagStudent}
                onClick={() => onReview('POSITIVE')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${report.proctorReviewDecision === 'POSITIVE' ? 'border-rose-400 bg-rose-200 text-rose-900' : 'border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100'}`}
              >
                <TriangleAlert size={15} />
                Positive — Violation confirmed
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-3">
              {report.playbackAvailable
                ? 'Open this student directly in Recordings & Playback.'
                : 'Recorded evidence becomes available after the exam ends.'}
            </p>
            <Button disabled={pending} icon={Download} onClick={onExport}>
              {pending ? 'Generating…' : 'Generate PDF'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  small = false,
  safe = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  small?: boolean;
  safe?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${safe ? 'border-emerald-200 bg-emerald-50/60' : 'border-border bg-canvas/40'}`}
    >
      <div
        className={`mb-2 flex items-center gap-2 text-xs font-medium ${safe ? 'text-emerald-700' : 'text-text-3'}`}
      >
        <Icon size={15} className={safe ? 'text-emerald-600' : 'text-brand'} />
        {label}
      </div>
      <div
        className={`${small ? 'text-sm' : 'text-xl'} font-bold capitalize ${safe ? 'text-emerald-800' : 'text-text-1'}`}
      >
        {value}
      </div>
    </div>
  );
}
