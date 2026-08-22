import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PlayCircle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { tooltipProps } from '../../components/charts/chartTheme';
import { useChartPalette } from '../../lib/chartPalette';
import { useTheme } from '../../lib/useTheme';
import { api } from '../../lib/api';
type Playback = {
  studentName: string;
  recording: {
    storagePath: string;
    durationSec: number;
    status: string;
  } | null;
  scoreTimeline: { computedAt: string; score: number }[];
  events: { type: string; occurredAt: string; intensity: number | null }[];
};
export default function Recordings() {
  const { dark } = useTheme(),
    p = useChartPalette(dark);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['playback', sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (await api.get<Playback>(`/teacher/sessions/${sessionId}/playback`)).data,
    retry: false,
  });
  const load = (event: React.FormEvent) => {
    event.preventDefault();
    setSessionId(input.trim());
  };
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Recordings & Playback"
      userName="Professor"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Open a session playback"
            subtitle="Paste the session ID from the monitored-session record."
          />
          <form onSubmit={load} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Session ID"
              className="flex-1 rounded border border-border p-2"
            />
            <Button disabled={!input.trim() || isLoading}>
              {isLoading ? 'Loading…' : 'Load'}
            </Button>
          </form>
        </Card>
        {isLoading && <Card>Loading playback…</Card>}
        {isError && (
          <Card>
            <span className="text-risk-high">
              Playback could not be loaded for this session.
            </span>
          </Card>
        )}
        {data && !isLoading && (
          <Card>
            <CardHeader
              title={`${data.studentName} — playback`}
              subtitle={
                data.recording
                  ? `${data.recording.durationSec}s recording`
                  : 'No recording is available for this session'
              }
            />
            <div className="h-[220px] rounded-[10px] bg-canvas flex items-center justify-center mb-3.5">
              {data.recording ? (
                <video
                  controls
                  src={data.recording.storagePath}
                  className="max-h-full max-w-full"
                />
              ) : (
                <PlayCircle size={40} className="text-text-3" />
              )}
            </div>
            <div className="font-body text-[11.5px] text-text-2 mb-1.5">
              Suspicion score across the session
            </div>
            {data.scoreTimeline.length ? (
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart
                  data={data.scoreTimeline.map((x) => ({
                    t: new Date(x.computedAt).toLocaleTimeString(),
                    score: x.score,
                  }))}
                >
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip {...tooltipProps(p)} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={p.brand}
                    fill={p.brand}
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-2">No score samples available.</p>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
