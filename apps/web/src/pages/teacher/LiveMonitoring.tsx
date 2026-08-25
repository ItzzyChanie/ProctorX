import { useEffect, useRef, useState } from 'react';
import { Maximize2, Monitor, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';

type Student = {
  id: string;
  name: string;
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  tabSwitches: number;
};
type Exam = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  roomCode: string;
  subject: { code: string; name: string };
  _count: { sessions: number };
};
type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export default function LiveMonitoring() {
  const [params, setParams] = useSearchParams();
  const examId = params.get('examId') ?? '';
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Student | null>(null);
  const [alerts, setAlerts] = useState<
    {
      sessionId: string;
      type: string;
      intensity?: number;
    }[]
  >([]);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidates = useRef(
    new Map<string, RTCIceCandidateInit[]>()
  );
  const watched = useRef(new Set<string>());
  const frameUrls = useRef(new Map<string, string>());
  const selectedExam = exams.find((exam) => exam.id === examId);
  const stopAll = () => {
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    pendingCandidates.current.clear();
    watched.current.clear();
    setStreams({});
    frameUrls.current.forEach((url) => URL.revokeObjectURL(url));
    frameUrls.current.clear();
    setFrames({});
  };

  useEffect(() => {
    void api
      .get<Exam[]>('/sessions/monitorable-exams')
      .then(({ data }) => setExams(data))
      .catch(() => setExams([]));
  }, []);
  useEffect(() => {
    if (!examId) {
      setStudents([]);
      setLoadError(false);
      return;
    }
    let active = true;
    const refreshStudents = async () => {
      try {
        const { data } = await api.get(`/sessions/exam/${examId}/monitor`);
        if (!active) return;
        setLoadError(false);
        const next = data.map((session: any) => ({
          id: session.id as string,
          name: session.student.fullName as string,
          score: session.scoreHistory[0]?.score ?? 0,
          tier: session.scoreHistory[0]?.tier ?? 'LOW',
          tabSwitches: session.events.filter(
            (event: any) =>
              event.type === 'TAB_SWITCH' || event.type === 'FULLSCREEN_EXIT'
          ).length,
        }));
        setStudents(next);
        setExams((current) =>
          current.map((exam) =>
            exam.id === examId
              ? { ...exam, _count: { sessions: next.length } }
              : exam
          )
        );
        next.forEach((student: Student) => {
          if (!watched.current.has(student.id)) {
            watched.current.add(student.id);
            socket.emit('webrtc:watch', { sessionId: student.id });
          }
        });
      } catch {
        if (active) setLoadError(true);
      }
    };
    const joinMonitorRoom = () => socket.emit('monitor:join', { examId });
    socket.on('connect', joinMonitorRoom);
    socket.connect();
    if (socket.connected) joinMonitorRoom();
    void refreshStudents();
    const ready = async ({ sessionId }: { sessionId: string }) => {
      peers.current.get(sessionId)?.close();
      pendingCandidates.current.delete(sessionId);
      const peer = new RTCPeerConnection(rtcConfig);
      peers.current.set(sessionId, peer);
      peer.ontrack = ({ streams: remoteStreams }) =>
        setStreams((current) => ({
          ...current,
          [sessionId]: remoteStreams[0],
        }));
      peer.onicecandidate = ({ candidate }) =>
        candidate &&
        socket.emit('webrtc:signal', {
          sessionId,
          signal: { candidate: candidate.toJSON() },
        });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('webrtc:signal', {
        sessionId,
        signal: { description: peer.localDescription },
      });
    };
    const signal = async ({
      sessionId,
      signal: incoming,
    }: {
      sessionId: string;
      signal: Signal;
    }) => {
      const peer = peers.current.get(sessionId);
      if (!peer) return;
      if (incoming.description) {
        await peer.setRemoteDescription(incoming.description);
        const queued = pendingCandidates.current.get(sessionId) ?? [];
        pendingCandidates.current.delete(sessionId);
        for (const candidate of queued) await peer.addIceCandidate(candidate);
      } else if (incoming.candidate) {
        if (peer.remoteDescription)
          await peer.addIceCandidate(incoming.candidate);
        else {
          const queued = pendingCandidates.current.get(sessionId) ?? [];
          queued.push(incoming.candidate);
          pendingCandidates.current.set(sessionId, queued);
        }
      }
    };
    const update = ({
      sessionId,
      score,
      tier,
      event,
    }: {
      sessionId: string;
      score: number;
      tier: string;
      event: { type: string; intensity?: number };
    }) => {
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? {
                ...student,
                score,
                tier: tier.toUpperCase() as Student['tier'],
                tabSwitches:
                  student.tabSwitches +
                  (['TAB_SWITCH', 'FULLSCREEN_EXIT'].includes(event.type)
                    ? 1
                    : 0),
              }
            : student
        )
      );
      setAlerts((current) =>
        [
          { sessionId, type: event.type, intensity: event.intensity },
          ...current,
        ].slice(0, 8)
      );
    };
    const frame = ({
      sessionId,
      frame: incoming,
      mimeType,
    }: {
      sessionId: string;
      frame: ArrayBuffer | Uint8Array;
      mimeType?: string;
    }) => {
      const previous = frameUrls.current.get(sessionId);
      if (previous) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(
        new Blob([incoming as BlobPart], { type: mimeType ?? 'image/webp' })
      );
      frameUrls.current.set(sessionId, url);
      setFrames((current) => ({ ...current, [sessionId]: url }));
    };
    socket.on('webrtc:ready', ready);
    socket.on('webrtc:signal', signal);
    socket.on('monitor:update', update);
    socket.on('monitor:session-start', refreshStudents);
    socket.on('monitor:session-end', refreshStudents);
    socket.on('screen:frame', frame);
    return () => {
      watched.current.forEach((sessionId) =>
        socket.emit('webrtc:stop', { sessionId })
      );
      socket.off('webrtc:ready', ready);
      socket.off('webrtc:signal', signal);
      socket.off('monitor:update', update);
      socket.off('monitor:session-start', refreshStudents);
      socket.off('monitor:session-end', refreshStudents);
      socket.off('screen:frame', frame);
      socket.off('connect', joinMonitorRoom);
      stopAll();
      socket.disconnect();
      active = false;
    };
  }, [examId]);

  const chooseExam = (id: string) => {
    setSelected(null);
    setParams(id ? { examId: id } : {});
  };
  const selectedStudent = selected
    ? (students.find((student) => student.id === selected.id) ?? selected)
    : null;
  const selectedStream = selectedStudent
    ? streams[selectedStudent.id]
    : undefined;
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Live Monitoring"
      userName="Prof. Nathalie Eglea"
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12.5px] text-text-2">
            <span className="h-2 w-2 rounded-full bg-risk-low" />
            {examId
              ? `${students.length} active student screen${
                  students.length === 1 ? '' : 's'
                }`
              : 'Choose one of your exams to monitor'}
          </div>
          <label className="flex items-center gap-2 text-sm text-text-2">
            Exam
            <select
              value={examId}
              onChange={(event) => chooseExam(event.target.value)}
              className="min-w-64 rounded-lg border border-border bg-surface px-3 py-2 text-text-1"
            >
              <option value="">Select an exam…</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subject.code} — {exam.title} (
                  {exam.status.toLowerCase()}
                  {exam._count.sessions
                    ? `, ${exam._count.sessions} active`
                    : ''}
                  )
                </option>
              ))}
            </select>
          </label>
        </div>
        {!exams.length && (
          <div className="rounded-lg border border-border bg-canvas p-4 text-sm text-text-2">
            No exams have been created for your subjects yet.
          </div>
        )}
        {examId && (
          <>
            <div className="text-sm text-text-2">
              Monitoring{' '}
              <b className="text-text-1">
                {selectedExam
                  ? `${selectedExam.subject.code} — ${selectedExam.title}`
                  : 'selected exam'}
              </b>
              . Student screens appear automatically after they begin the exam.
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              }}
            >
              {students.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelected(student)}
                  className="group relative aspect-video overflow-hidden rounded-lg bg-black text-left shadow-sm"
                >
                  <video
                    ref={(node) => {
                      if (
                        node &&
                        streams[student.id] &&
                        node.srcObject !== streams[student.id]
                      )
                        node.srcObject = streams[student.id];
                    }}
                    autoPlay
                    playsInline
                    className={`h-full w-full object-contain ${streams[student.id] ? '' : 'hidden'}`}
                  />
                  {!streams[student.id] && frames[student.id] && (
                    <img
                      src={frames[student.id]}
                      alt={`${student.name}'s shared screen`}
                      className="h-full w-full object-contain"
                    />
                  )}
                  {!streams[student.id] && !frames[student.id] && (
                    <span className="absolute inset-0 grid place-items-center text-sm text-white/70">
                      <Monitor size={20} className="mr-2" />
                      Connecting to {student.name}…
                    </span>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-sm text-white">
                    <span>
                      {student.name} · Score {student.score} ({student.tier.toLowerCase()} risk) ·{' '}
                      {student.tabSwitches} tab switch
                      {student.tabSwitches === 1 ? '' : 'es'}
                    </span>
                    <Maximize2 size={16} />
                  </span>
                </button>
              ))}
            </div>
            {loadError && (
              <div className="rounded-lg border border-risk-high/30 bg-risk-high/5 p-6 text-sm text-risk-high">
                Live sessions could not be loaded. Check that the backend is
                running, then refresh this page.
              </div>
            )}
            {!loadError && !students.length && (
              <div className="rounded-lg border border-border bg-canvas p-6 text-sm text-text-2">
                No students have started this exam yet.
              </div>
            )}
          </>
        )}
      </div>
      {selectedStudent && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-6">
          <div className="relative flex h-full w-full max-w-7xl flex-col">
            <div className="mb-3 flex items-center justify-between text-white">
              <span>
                {selectedStudent.name} — score {selectedStudent.score} ({selectedStudent.tier.toLowerCase()} risk) ·{' '}
                {selectedStudent.tabSwitches} tab switches
              </span>
              <Button
                variant="ghost"
                icon={X}
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
            </div>
            <div className="grid flex-1 place-items-center overflow-hidden rounded-lg bg-black">
              <video
                ref={(node) => {
                  if (
                    node &&
                    selectedStream &&
                    node.srcObject !== selectedStream
                  )
                    node.srcObject = selectedStream;
                }}
                autoPlay
                playsInline
                className={`max-h-full max-w-full ${selectedStream ? '' : 'hidden'}`}
              />
              {!selectedStream && frames[selectedStudent.id] && (
                <img
                  src={frames[selectedStudent.id]}
                  alt={`${selectedStudent.name}'s shared screen`}
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {!selectedStream && !frames[selectedStudent.id] && (
                <span className="text-sm text-white/70">Connecting…</span>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
