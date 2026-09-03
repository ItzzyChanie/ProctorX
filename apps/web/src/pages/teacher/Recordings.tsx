import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clock3, PlayCircle, Search, UserRound } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';

type PlaybackSession = {
  sessionId: string;
  student: { id: string; fullName: string; profilePicture: string | null };
  startedAt: string;
  endedAt: string | null;
  recording: { status: string; durationSec: number | null; playbackUrl: string } | null;
  scoreTimeline: { computedAt: string; score: number; tier: string }[];
  events: {
    id: string;
    type: string;
    occurredAt: string;
    intensity: number | null;
    clips: {
      id: string;
      phase: 'CENTERED';
      startedAt: string;
      endedAt: string;
      status: string;
      playbackUrl: string;
      eventOffsetSec: number;
    }[];
  }[];
};
type PlaybackManifest = {
  exam: { id: string; title: string; subjectCode: string; subjectName: string };
  sessions: PlaybackSession[];
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value));

const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value));

const duration = (seconds: number | null | undefined) => {
  if (seconds == null) return 'Duration unavailable';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].filter((_, index) => index > 0 || hours > 0).map(value => String(value).padStart(2, '0')).join(':');
};

export default function Recordings() {
  const { dark } = useTheme();
  const palette = useChartPalette(dark);
  const [input, setInput] = useState('');
  const [manifest, setManifest] = useState<PlaybackManifest | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [selectedClipId, setSelectedClipId] = useState('');
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const selected = useMemo(() => manifest?.sessions.find(session => session.sessionId === selectedId) ?? null, [manifest, selectedId]);
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 4_000);
  };
  const loadPlayback = useMutation({
    mutationFn: async (id: string) => (await api.get<PlaybackManifest>(`/teacher/sessions/${id}/playback`)).data,
    onSuccess: data => {
      setManifest(data);
      setSelectedId('');
      notify(`${data.sessions.length} completed student session${data.sessions.length === 1 ? '' : 's'} loaded.`);
    },
    onError: (error: any) => {
      setManifest(null);
      setSelectedId('');
      notify(error.response?.data?.message ?? 'Playback could not be loaded. Confirm that the exam has ended.', true);
    },
  });
  const load = (event: React.FormEvent) => {
    event.preventDefault();
    const id = input.trim();
    if (id) loadPlayback.mutate(id);
  };
  const incidentClips = selected?.events.flatMap(event =>
    event.clips.map(clip => ({ ...clip, event }))
  ) ?? [];
  const selectedClip = incidentClips.find(clip => clip.id === selectedClipId) ?? incidentClips[0];
  const videoSource = selectedClip
    ? `${api.defaults.baseURL}${selectedClip.playbackUrl}`
    : undefined;

  return <DashboardLayout role="teacher" pageTitle="Recordings & Playback" userName="Professor" userTag="College of Computer Studies">
    {toast && <div role={toast.error ? 'alert' : 'status'} className={`fixed bottom-5 right-5 z-[70] rounded px-4 py-3 text-sm text-white ${toast.error ? 'bg-red-600' : 'bg-emerald-600'}`}>{toast.message}</div>}
    <div className="flex flex-col gap-5">
      <Card><CardHeader title="Open a session playback" subtitle="Enter an exam room code, exam ID, or any student session ID. Playback is available only after the exam has ended." /><form onSubmit={load} className="flex gap-2"><input value={input} onChange={event => setInput(event.target.value)} placeholder="Room code, exam ID, or session ID" className="min-w-0 flex-1 rounded border border-border bg-surface p-2 text-text-1" /><Button disabled={!input.trim() || loadPlayback.isPending} icon={Search}>{loadPlayback.isPending ? 'Loading…' : 'Load'}</Button></form></Card>
      {manifest && <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card padded={false}><div className="border-b border-border p-5"><CardHeader title={manifest.exam.title} subtitle={`${manifest.exam.subjectCode} · ${manifest.exam.subjectName}`} /></div>{!manifest.sessions.length && <p className="p-5 text-sm text-text-2">No completed student sessions were found.</p>}{manifest.sessions.map(session => <button key={session.sessionId} type="button" onClick={() => { setSelectedId(session.sessionId); setSelectedClipId(''); }} className={`flex w-full items-center gap-3 border-b border-border p-4 text-left transition-colors last:border-b-0 ${selectedId === session.sessionId ? 'bg-brand-soft' : 'hover:bg-canvas'}`}>{session.student.profilePicture ? <img src={session.student.profilePicture} alt={`${session.student.fullName} profile`} className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><UserRound size={18} /></span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-text-1">{session.student.fullName}</span><span className="mt-1 flex items-center gap-1 text-xs text-text-3"><Clock3 size={12} />{session.events.reduce((count, event) => count + event.clips.length, 0)} evidence clips</span></span><PlayCircle size={18} className={session.events.some(event => event.clips.length) ? 'text-brand' : 'text-text-3'} /></button>)}</Card>
        <Card>{!selected && <div className="grid min-h-[360px] place-items-center text-center text-text-3"><div><PlayCircle className="mx-auto mb-3" size={42} /><p className="text-sm">Select a student to open the recorded exam screen.</p></div></div>}{selected && <><div className="flex items-center gap-3">
          {selected.student.profilePicture ? <img src={selected.student.profilePicture} alt={`${selected.student.fullName} profile`} className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><UserRound size={21} /></span>}
          <div className="min-w-0"><h2 className="truncate font-head text-lg font-semibold text-text-1">{selected.student.fullName} — screen recording</h2><p className="mt-1 text-sm text-text-2">{selectedClip ? [formatDateTime(selectedClip.event.occurredAt), selectedClip.event.type.replace(/_/g, ' '), `centered evidence · incident at ${selectedClip.eventOffsetSec.toFixed(1)}s`].join(' · ') : formatDateTime(selected.startedAt)}</p></div>
        </div><div className="mb-4 mt-4 grid min-h-[320px] place-items-center overflow-hidden rounded-xl bg-black">{videoSource ? <video key={videoSource} controls preload="metadata" src={videoSource} className="max-h-[560px] w-full" /> : <div className="text-center text-white/70"><PlayCircle className="mx-auto mb-2" size={38} /><p>No tab-switch or fullscreen-exit evidence clip is available for this student.</p></div>}</div>{incidentClips.length > 0 && <div className="mb-5 space-y-3"><p className="text-sm font-semibold text-text-1">Incident evidence</p>{selected.events.filter(event => event.clips.length > 0).map((event, index) => <div key={event.id} className="rounded-xl border border-border bg-canvas p-3"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-text-1">Incident {index + 1}: {event.type.replace(/_/g, ' ')}</span><span className="text-xs text-text-3">{formatTime(event.occurredAt)}</span></div><div className="flex flex-wrap gap-2">{event.clips.map(clip => <button key={clip.id} type="button" onClick={() => setSelectedClipId(clip.id)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedClip?.id === clip.id ? 'border-brand bg-brand text-white shadow-md' : 'border-brand/40 bg-brand-soft text-brand shadow-sm hover:border-brand hover:bg-brand hover:text-white'}`}>{`Play centered clip · incident at ${clip.eventOffsetSec.toFixed(1)}s`}</button>)}</div></div>)}</div>}<div className="mb-1.5 text-xs font-medium text-text-2">Selected student's suspicion score across the session</div>{selected.scoreTimeline.length ? <ResponsiveContainer width="100%" height={120}><AreaChart data={selected.scoreTimeline.map(point => ({ time: formatTime(point.computedAt), score: point.score }))}><XAxis dataKey="time" hide /><YAxis domain={[0, 100]} hide /><Tooltip {...tooltipProps(palette)} /><Area type="monotone" dataKey="score" stroke={palette.brand} fill={palette.brand} fillOpacity={0.25} /></AreaChart></ResponsiveContainer> : <p className="text-sm text-text-2">No score samples are available.</p>}</>}</Card>
      </div>}
    </div>
  </DashboardLayout>;
}
