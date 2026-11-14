import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hand,
  Maximize2,
  MessageSquare,
  Monitor,
  MonitorOff,
  RotateCcw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { DEFAULT_RTC_CONFIG, getRtcConfig } from '../../lib/rtc';
import { socket } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';

type Student = {
  id: string;
  name: string;
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  tabSwitches: number;
  eventCount: number;
  connected: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED';
  screenSharing: boolean;
  raisedHand: boolean;
  remainingSeconds: number;
  extraTimeSeconds: number;
  section: string;
  latestWarning?: { id: string; acknowledgedAt: string | null };
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
/** live = WebRTC video, fallback = periodic image frames over the socket. */
type Link = 'connecting' | 'live' | 'fallback';
type Quality = 'off' | 'thumb' | 'focus';
type SortKey = 'risk' | 'violations' | 'hand' | 'name';

const CONNECT_TIMEOUT_MS = 10_000;
const DISCONNECT_GRACE_MS = 5_000;
const REFRESH_DEBOUNCE_MS = 600;
const TILE_MIN_WIDTH = { S: 200, M: 300, L: 440 } as const;
const TIER_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

/**
 * Fallback frames bypass React state of the page: each tile subscribes to its
 * own student, so a new frame re-renders one tile instead of the whole grid.
 */
class FrameStore {
  private urls = new Map<string, string>();
  private listeners = new Map<string, Set<() => void>>();
  get = (id: string) => this.urls.get(id);
  set(id: string, url?: string) {
    const previous = this.urls.get(id);
    if (previous) URL.revokeObjectURL(previous);
    if (url) this.urls.set(id, url);
    else this.urls.delete(id);
    this.listeners.get(id)?.forEach((listener) => listener());
  }
  subscribe(id: string, listener: () => void) {
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => {
      set.delete(listener);
    };
  }
  clear() {
    [...this.urls.keys()].forEach((id) => this.set(id));
  }
}

function ScreenView({
  id,
  name,
  stream,
  live,
  frames,
  fit,
  placeholder,
}: {
  id: string;
  name: string;
  stream?: MediaStream;
  live: boolean;
  frames: FrameStore;
  fit: string;
  placeholder: ReactNode;
}) {
  const frame = useSyncExternalStore(
    useCallback((listener) => frames.subscribe(id, listener), [frames, id]),
    () => frames.get(id)
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = Boolean(stream) && live;
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== (stream ?? null))
      video.srcObject = stream ?? null;
  }, [stream]);
  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`${fit} ${showVideo ? '' : 'hidden'}`}
      />
      {!showVideo && frame && (
        <img src={frame} alt={`${name}'s shared screen`} className={fit} />
      )}
      {!showVideo && !frame && placeholder}
    </>
  );
}

const Tile = memo(function Tile({
  student,
  stream,
  link,
  frames,
  onOpen,
  onVisible,
}: {
  student: Student;
  stream?: MediaStream;
  link?: Link;
  frames: FrameStore;
  onOpen: (id: string) => void;
  onVisible: (id: string, visible: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Off-screen tiles ask the student to pause their encoder entirely.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisible(student.id, Boolean(entry?.isIntersecting)),
      { rootMargin: '150px' }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      onVisible(student.id, false);
    };
  }, [student.id, onVisible]);
  const live = link === 'live';
  const notSharing = student.connected && !student.screenSharing;
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(student.id)}
      className={`group relative aspect-video overflow-hidden rounded-lg border-[3px] bg-black text-left shadow-sm ${
        notSharing
          ? 'border-red-500'
          : student.eventCount === 0
            ? 'border-transparent'
            : student.tier === 'HIGH'
              ? 'border-red-500'
              : 'border-amber-400'
      }`}
    >
      <span className="absolute left-2 top-2 z-10 flex flex-wrap gap-1.5">
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold text-white ${student.connected ? 'bg-emerald-600' : 'bg-slate-600'}`}
        >
          {student.connected ? (
            <Wifi className="inline" size={11} />
          ) : (
            <WifiOff className="inline" size={11} />
          )}{' '}
          {student.connectionStatus.toLowerCase()}
        </span>
        {student.connected && link === 'fallback' && (
          <span
            className="rounded-full bg-amber-600 px-2 py-1 text-[10px] font-bold text-white"
            title="Peer-to-peer video is unavailable; showing periodic snapshots."
          >
            snapshot mode
          </span>
        )}
        {student.raisedHand && (
          <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">
            <Hand className="inline" size={11} /> raised hand
          </span>
        )}
        {student.eventCount > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white">
            <AlertTriangle className="inline" size={11} /> {student.eventCount}
          </span>
        )}
      </span>
      <ScreenView
        id={student.id}
        name={student.name}
        stream={stream}
        live={live}
        frames={frames}
        fit="h-full w-full object-contain"
        placeholder={
          <span className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-white/70">
            <span className="flex items-center">
              <Monitor size={20} className="mr-2" />
              {student.connected
                ? `Connecting to ${student.name}…`
                : `${student.name} is offline`}
            </span>
          </span>
        }
      />
      {notSharing && (
        <span className="absolute inset-0 z-[5] grid place-items-center bg-red-950/80 px-4 text-center text-sm font-semibold text-white">
          <span className="flex items-center">
            <MonitorOff size={18} className="mr-2" />
            Screen sharing stopped
          </span>
        </span>
      )}
      <span className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-sm text-white">
        <span className="truncate">
          {student.name} · Score {student.score} ({student.tier.toLowerCase()}{' '}
          risk) · {student.tabSwitches} tab switch
          {student.tabSwitches === 1 ? '' : 'es'} · {student.section}
        </span>
        <Maximize2 size={16} className="shrink-0" />
      </span>
    </button>
  );
});

export default function LiveMonitoring() {
  const user = useAuthStore((state) => state.user);
  const canFlagStudent = useAuthStore(
    (state) => state.user?.permissions?.FLAG_STUDENT !== false
  );
  const [params, setParams] = useSearchParams();
  const examId = params.get('examId') ?? '';
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [links, setLinks] = useState<Record<string, Link>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState('');
  const [connectionFilter, setConnectionFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [specialFilter, setSpecialFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('risk');
  const [tileSize, setTileSize] = useState<keyof typeof TILE_MIN_WIDTH>('M');
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(0);
  const [warningMessage, setWarningMessage] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [actionMessage, setActionMessage] = useState('');
  const [frames] = useState(() => new FrameStore());
  const selectedRef = useRef<string | null>(null);
  const visibleRef = useRef(new Set<string>());
  const syncRef = useRef<(id: string) => void>(() => undefined);
  const selectedExam = exams.find((exam) => exam.id === examId);

  useEffect(() => {
    const previous = selectedRef.current;
    selectedRef.current = selectedId;
    if (previous) syncRef.current(previous);
    if (selectedId) syncRef.current(selectedId);
  }, [selectedId]);
  const onVisible = useCallback((id: string, visible: boolean) => {
    if (visible) visibleRef.current.add(id);
    else visibleRef.current.delete(id);
    syncRef.current(id);
  }, []);
  const openStudent = useCallback((id: string) => {
    setActionMessage('');
    setSelectedId(id);
  }, []);

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
    let joined = false;
    let rtcConfig = DEFAULT_RTC_CONFIG;
    void getRtcConfig().then((config) => {
      rtcConfig = config;
    });
    const peers = new Map<string, RTCPeerConnection>();
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
    const watched = new Set<string>();
    const live = new Set<string>();
    const fallbackWanted = new Set<string>();
    const fallbackSent = new Set<string>();
    const qualitySent = new Map<string, Quality>();
    const retries = new Map<string, number>();
    const timers = new Map<string, number>();

    const clearTimer = (key: string) => {
      const timer = timers.get(key);
      if (timer !== undefined) window.clearTimeout(timer);
      timers.delete(key);
    };
    const setTimer = (key: string, ms: number, run: () => void) => {
      clearTimer(key);
      timers.set(
        key,
        window.setTimeout(() => {
          timers.delete(key);
          if (active) run();
        }, ms)
      );
    };
    const setLink = (id: string, link?: Link) =>
      setLinks((current) => {
        if (current[id] === link) return current;
        const next = { ...current };
        if (link) next[id] = link;
        else delete next[id];
        return next;
      });

    // Reconcile what this viewer asks of each student: encoder quality for
    // the WebRTC feed and whether image frames are needed at all.
    const sync = (id: string) => {
      if (!joined || !watched.has(id)) return;
      const shown = selectedRef.current === id || visibleRef.current.has(id);
      const wantFrames = fallbackWanted.has(id) && shown;
      if (wantFrames !== fallbackSent.has(id)) {
        if (wantFrames) fallbackSent.add(id);
        else fallbackSent.delete(id);
        socket.emit('screen:fallback', { sessionId: id, enabled: wantFrames });
      }
      if (live.has(id)) {
        const quality: Quality =
          selectedRef.current === id
            ? 'focus'
            : visibleRef.current.has(id)
              ? 'thumb'
              : 'off';
        if (qualitySent.get(id) !== quality) {
          qualitySent.set(id, quality);
          socket.emit('webrtc:quality', { sessionId: id, quality });
        }
      }
    };
    syncRef.current = sync;

    const closePeer = (id: string) => {
      peers.get(id)?.close();
      peers.delete(id);
      pendingCandidates.delete(id);
      live.delete(id);
      qualitySent.delete(id);
      clearTimer(`grace:${id}`);
      setStreams((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    };
    const enterFallback = (id: string) => {
      fallbackWanted.add(id);
      setLink(id, 'fallback');
      sync(id);
    };
    const requestStream = (id: string) => {
      if (!joined || !watched.has(id)) return;
      socket.emit('webrtc:watch', { sessionId: id });
      setTimer(`connect:${id}`, CONNECT_TIMEOUT_MS, () => {
        if (!live.has(id)) enterFallback(id);
      });
    };
    const peerFailed = (id: string) => {
      closePeer(id);
      enterFallback(id);
      const attempt = (retries.get(id) ?? 0) + 1;
      retries.set(id, attempt);
      setTimer(
        `retry:${id}`,
        Math.min(30_000, 2_000 * 2 ** (attempt - 1)),
        () => requestStream(id)
      );
    };
    const watch = (id: string) => {
      if (watched.has(id)) return;
      watched.add(id);
      setLink(id, 'connecting');
      requestStream(id);
    };
    const unwatch = (id: string) => {
      if (!watched.has(id)) return;
      watched.delete(id);
      closePeer(id);
      fallbackWanted.delete(id);
      fallbackSent.delete(id);
      retries.delete(id);
      clearTimer(`connect:${id}`);
      clearTimer(`retry:${id}`);
      setLink(id);
      frames.set(id);
      if (socket.connected) socket.emit('webrtc:unwatch', { sessionId: id });
    };

    let refreshSeq = 0;
    const refreshStudents = async () => {
      const seq = ++refreshSeq;
      try {
        const { data } = await api.get(`/sessions/exam/${examId}/monitor`);
        // Drop responses that were overtaken by a newer refresh.
        if (!active || seq !== refreshSeq) return;
        setLoadError(false);
        const next: Student[] = data.map((session: any) => ({
          id: session.id as string,
          name: session.student.fullName as string,
          score: session.scoreHistory[0]?.score ?? 0,
          tier: session.scoreHistory[0]?.tier ?? 'LOW',
          tabSwitches: session.tabSwitchCount ?? 0,
          eventCount: session.eventCount ?? 0,
          connected: Boolean(session.connected),
          connectionStatus: session.connectionStatus,
          screenSharing: Boolean(session.screenSharing),
          raisedHand: Boolean(session.raisedHand),
          remainingSeconds: session.remainingSeconds ?? 0,
          extraTimeSeconds: session.extraTimeSeconds ?? 0,
          section:
            session.student.studentProfile?.section?.name ?? 'Unassigned',
          latestWarning: session.proctorWarnings?.[0],
        }));
        setStudents(next);
        setExams((current) =>
          current.map((exam) =>
            exam.id === examId
              ? {
                  ...exam,
                  _count: {
                    sessions: next.filter((student) => student.connected)
                      .length,
                  },
                }
              : exam
          )
        );
        const ids = new Set(next.map((student) => student.id));
        next.forEach((student) => watch(student.id));
        [...watched].filter((id) => !ids.has(id)).forEach(unwatch);
      } catch {
        if (active && seq === refreshSeq) setLoadError(true);
      }
    };
    // Many students join at once at exam start; coalesce into one request.
    const scheduleRefresh = () =>
      setTimer('refresh', REFRESH_DEBOUNCE_MS, () => void refreshStudents());

    const joinMonitorRoom = () =>
      socket.emit('monitor:join', { examId }, (response?: { ok: boolean }) => {
        if (!active) return;
        if (!response?.ok) {
          setLoadError(true);
          return;
        }
        joined = true;
        // Server-side watch rooms are lost with the old socket, and students
        // already closed the peers of the old viewer id: request again.
        fallbackSent.clear();
        watched.forEach((id) => {
          closePeer(id);
          requestStream(id);
        });
        scheduleRefresh();
      });
    const onDisconnect = () => {
      joined = false;
    };

    const ready = async ({ sessionId: id }: { sessionId: string }) => {
      if (!watched.has(id)) return;
      closePeer(id);
      const peer = new RTCPeerConnection(rtcConfig);
      peers.set(id, peer);
      const current = () => peers.get(id) === peer;
      // Without a receiving transceiver the offer has no media section and
      // the student's screen track can never be negotiated.
      peer.addTransceiver('video', { direction: 'recvonly' });
      peer.ontrack = ({ track, streams: remoteStreams }) => {
        if (!current()) return;
        const stream = remoteStreams[0] ?? new MediaStream([track]);
        setStreams((existing) => ({ ...existing, [id]: stream }));
        track.addEventListener('ended', () => current() && peerFailed(id));
      };
      peer.onicecandidate = ({ candidate }) =>
        candidate &&
        socket.emit('webrtc:signal', {
          sessionId: id,
          signal: { candidate: candidate.toJSON() },
        });
      peer.onconnectionstatechange = () => {
        if (!current()) return;
        switch (peer.connectionState) {
          case 'connected':
            clearTimer(`grace:${id}`);
            clearTimer(`connect:${id}`);
            clearTimer(`retry:${id}`);
            live.add(id);
            retries.delete(id);
            fallbackWanted.delete(id);
            setLink(id, 'live');
            sync(id);
            break;
          case 'disconnected':
            setTimer(`grace:${id}`, DISCONNECT_GRACE_MS, () => {
              if (current()) peerFailed(id);
            });
            break;
          case 'failed':
            peerFailed(id);
            break;
        }
      };
      setTimer(`connect:${id}`, CONNECT_TIMEOUT_MS, () => {
        if (current() && !live.has(id)) peerFailed(id);
      });
      try {
        await peer.setLocalDescription(await peer.createOffer());
        if (!current()) return;
        socket.emit('webrtc:signal', {
          sessionId: id,
          signal: { description: peer.localDescription },
        });
      } catch {
        if (current()) peerFailed(id);
      }
    };
    const signal = async ({
      sessionId: id,
      signal: incoming,
    }: {
      sessionId: string;
      signal: Signal;
    }) => {
      const peer = peers.get(id);
      if (!peer) return;
      try {
        if (incoming.description) {
          await peer.setRemoteDescription(incoming.description);
          const queued = pendingCandidates.get(id) ?? [];
          pendingCandidates.delete(id);
          for (const candidate of queued) await peer.addIceCandidate(candidate);
        } else if (incoming.candidate) {
          if (peer.remoteDescription)
            await peer.addIceCandidate(incoming.candidate);
          else {
            const queued = pendingCandidates.get(id) ?? [];
            queued.push(incoming.candidate);
            pendingCandidates.set(id, queued);
          }
        }
      } catch {
        if (peers.get(id) === peer) peerFailed(id);
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
      event: { type: string };
    }) =>
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
                eventCount: student.eventCount + 1,
              }
            : student
        )
      );
    const sessionEnded = ({ sessionId }: { sessionId: string }) => {
      // The student is gone: don't keep showing a frozen last video frame.
      closePeer(sessionId);
      clearTimer(`connect:${sessionId}`);
      clearTimer(`retry:${sessionId}`);
      setLink(sessionId, 'connecting');
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? {
                ...student,
                connected: false,
                connectionStatus: 'DISCONNECTED',
                screenSharing: false,
              }
            : student
        )
      );
      scheduleRefresh();
    };
    const screenState = ({
      sessionId,
      sharing,
    }: {
      sessionId: string;
      sharing: boolean;
    }) =>
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? { ...student, screenSharing: sharing }
            : student
        )
      );
    const timeAdjusted = ({
      sessionId,
      remainingSeconds,
      extraTimeSeconds,
    }: {
      sessionId: string;
      remainingSeconds: number;
      extraTimeSeconds: number;
    }) =>
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? { ...student, remainingSeconds, extraTimeSeconds }
            : student
        )
      );
    const warningAcknowledged = ({
      sessionId,
      warningId,
      acknowledgedAt,
    }: {
      sessionId: string;
      warningId: string;
      acknowledgedAt: string;
    }) =>
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId && student.latestWarning?.id === warningId
            ? {
                ...student,
                latestWarning: { id: warningId, acknowledgedAt },
              }
            : student
        )
      );
    const frame = ({
      sessionId,
      frame: incoming,
      mimeType,
    }: {
      sessionId: string;
      frame: ArrayBuffer | Uint8Array;
      mimeType?: string;
    }) => {
      if (!active || !watched.has(sessionId) || live.has(sessionId)) return;
      frames.set(
        sessionId,
        URL.createObjectURL(
          new Blob([incoming as BlobPart], { type: mimeType ?? 'image/webp' })
        )
      );
    };

    socket.on('connect', joinMonitorRoom);
    socket.on('disconnect', onDisconnect);
    socket.on('webrtc:ready', ready);
    socket.on('webrtc:signal', signal);
    socket.on('monitor:update', update);
    socket.on('monitor:session-start', scheduleRefresh);
    socket.on('monitor:session-end', sessionEnded);
    socket.on('monitor:screen-state', screenState);
    socket.on('monitor:time-adjusted', timeAdjusted);
    socket.on('monitor:warning-acknowledged', warningAcknowledged);
    socket.on('screen:frame', frame);
    socket.connect();
    if (socket.connected) joinMonitorRoom();
    void refreshStudents();
    return () => {
      active = false;
      [...watched].forEach(unwatch);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      socket.off('connect', joinMonitorRoom);
      socket.off('disconnect', onDisconnect);
      socket.off('webrtc:ready', ready);
      socket.off('webrtc:signal', signal);
      socket.off('monitor:update', update);
      socket.off('monitor:session-start', scheduleRefresh);
      socket.off('monitor:session-end', sessionEnded);
      socket.off('monitor:screen-state', screenState);
      socket.off('monitor:time-adjusted', timeAdjusted);
      socket.off('monitor:warning-acknowledged', warningAcknowledged);
      socket.off('screen:frame', frame);
      syncRef.current = () => undefined;
      frames.clear();
      setStreams({});
      setLinks({});
      socket.disconnect();
    };
  }, [examId, frames]);

  const chooseExam = (id: string) => {
    setSelectedId(null);
    setPage(0);
    setParams(id ? { examId: id } : {});
  };
  const selectedStudent = selectedId
    ? students.find((student) => student.id === selectedId)
    : undefined;
  const sections = useMemo(
    () => [...new Set(students.map((student) => student.section))].sort(),
    [students]
  );
  const visibleStudents = useMemo(() => {
    const filtered = students.filter(
      (student) =>
        (!riskFilter || student.tier === riskFilter) &&
        (!connectionFilter || student.connectionStatus === connectionFilter) &&
        (!sectionFilter || student.section === sectionFilter) &&
        (!specialFilter ||
          (specialFilter === 'HAND'
            ? student.raisedHand
            : specialFilter === 'VIOLATION'
              ? student.eventCount > 0
              : specialFilter === 'SCREEN_OFF'
                ? student.connected && !student.screenSharing
                : true))
    );
    const byName = (a: Student, b: Student) => a.name.localeCompare(b.name);
    const comparators: Record<SortKey, (a: Student, b: Student) => number> = {
      risk: (a, b) =>
        Number(b.connected && !b.screenSharing) -
          Number(a.connected && !a.screenSharing) ||
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        b.score - a.score ||
        byName(a, b),
      violations: (a, b) => b.eventCount - a.eventCount || byName(a, b),
      hand: (a, b) =>
        Number(b.raisedHand) - Number(a.raisedHand) || byName(a, b),
      name: byName,
    };
    return filtered.sort(comparators[sortBy]);
  }, [
    students,
    riskFilter,
    connectionFilter,
    sectionFilter,
    specialFilter,
    sortBy,
  ]);
  useEffect(() => {
    setPage(0);
  }, [riskFilter, connectionFilter, sectionFilter, specialFilter, pageSize]);
  const pageCount = pageSize
    ? Math.max(1, Math.ceil(visibleStudents.length / pageSize))
    : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const pageStudents = pageSize
    ? visibleStudents.slice(
        currentPage * pageSize,
        (currentPage + 1) * pageSize
      )
    : visibleStudents;
  const connectedCount = students.filter((student) => student.connected).length;

  const sendWarning = async () => {
    if (!selectedStudent || !warningMessage.trim()) return;
    try {
      const { data } = await api.post(
        `/sessions/${selectedStudent.id}/warnings`,
        { message: warningMessage.trim() }
      );
      setStudents((current) =>
        current.map((student) =>
          student.id === selectedStudent.id
            ? { ...student, latestWarning: data }
            : student
        )
      );
      setWarningMessage('');
      setActionMessage('Private warning sent.');
    } catch {
      setActionMessage('Warning could not be sent.');
    }
  };
  const addTime = async () => {
    if (!selectedStudent) return;
    try {
      await api.patch(`/sessions/${selectedStudent.id}/extra-time`, {
        minutes: extraMinutes,
      });
      setActionMessage(
        `Added ${extraMinutes} minutes for ${selectedStudent.name}.`
      );
    } catch {
      setActionMessage('Extra time could not be added.');
    }
  };
  const resumeStudent = async () => {
    if (!selectedStudent) return;
    try {
      await api.post(`/sessions/${selectedStudent.id}/resume`);
      setActionMessage('Resume authorization sent.');
    } catch {
      setActionMessage('This attempt could not be resumed.');
    }
  };
  const selectClass =
    'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-1';
  return (
    <DashboardLayout
      role="teacher"
      pageTitle="Live Monitoring"
      userName={user?.fullName ?? 'Professor'}
      userTag="College of Computer Studies"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[12.5px] text-text-2">
            <span className="h-2 w-2 rounded-full bg-risk-low" />
            {examId
              ? `${connectedCount} connected · ${students.length} active attempt${
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
            <div className="grid gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <select
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value)}
                className={selectClass}
              >
                <option value="">All risk levels</option>
                <option value="LOW">Low risk</option>
                <option value="MEDIUM">Medium risk</option>
                <option value="HIGH">High risk</option>
              </select>
              <select
                value={connectionFilter}
                onChange={(event) => setConnectionFilter(event.target.value)}
                className={selectClass}
              >
                <option value="">All connections</option>
                <option value="CONNECTED">Connected</option>
                <option value="DISCONNECTED">Disconnected</option>
              </select>
              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                className={selectClass}
              >
                <option value="">All sections</option>
                {sections.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
              <select
                value={specialFilter}
                onChange={(event) => setSpecialFilter(event.target.value)}
                className={selectClass}
              >
                <option value="">All students</option>
                <option value="HAND">Raised hand</option>
                <option value="VIOLATION">Has violation</option>
                <option value="SCREEN_OFF">Not sharing screen</option>
              </select>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
                className={selectClass}
                aria-label="Sort"
              >
                <option value="risk">Sort: highest risk first</option>
                <option value="violations">Sort: most violations</option>
                <option value="hand">Sort: raised hands first</option>
                <option value="name">Sort: name</option>
              </select>
              <select
                value={tileSize}
                onChange={(event) =>
                  setTileSize(event.target.value as keyof typeof TILE_MIN_WIDTH)
                }
                className={selectClass}
                aria-label="Tile size"
              >
                <option value="S">Small tiles</option>
                <option value="M">Medium tiles</option>
                <option value="L">Large tiles</option>
              </select>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className={selectClass}
                aria-label="Tiles per page"
              >
                <option value={12}>12 per page</option>
                <option value={24}>24 per page</option>
                <option value={48}>48 per page</option>
                <option value={0}>Show all</option>
              </select>
              <Button
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  setRiskFilter('');
                  setConnectionFilter('');
                  setSectionFilter('');
                  setSpecialFilter('');
                  setSortBy('risk');
                }}
              >
                Reset
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-3">
              <p>
                Showing {pageStudents.length} of {visibleStudents.length}{' '}
                matching ({students.length} total). Off-screen tiles are paused
                to save bandwidth.
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    icon={ChevronLeft}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Prev
                  </Button>
                  <span>
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <Button
                    variant="ghost"
                    icon={ChevronRight}
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${TILE_MIN_WIDTH[tileSize]}px), 1fr))`,
              }}
            >
              {pageStudents.map((student) => (
                <Tile
                  key={student.id}
                  student={student}
                  stream={streams[student.id]}
                  link={links[student.id]}
                  frames={frames}
                  onOpen={openStudent}
                  onVisible={onVisible}
                />
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
                {selectedStudent.name} — score {selectedStudent.score} (
                {selectedStudent.tier.toLowerCase()} risk) ·{' '}
                {selectedStudent.tabSwitches} tab switches
                {links[selectedStudent.id] === 'fallback' && ' · snapshot mode'}
              </span>
              <Button
                variant="ghost"
                icon={X}
                onClick={() => setSelectedId(null)}
              >
                Close
              </Button>
            </div>
            <div className="mb-3 grid gap-3 rounded-xl bg-white/10 p-3 text-white lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Private warning
                </label>
                <div className="flex gap-2">
                  <input
                    value={warningMessage}
                    onChange={(event) => setWarningMessage(event.target.value)}
                    maxLength={500}
                    placeholder="Message shown over the fullscreen exam"
                    className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/50"
                  />
                  <Button
                    icon={MessageSquare}
                    disabled={!canFlagStudent || !warningMessage.trim()}
                    onClick={() => void sendWarning()}
                  >
                    Send
                  </Button>
                </div>
                {selectedStudent.latestWarning && (
                  <p className="mt-1 text-xs text-white/70">
                    Latest warning:{' '}
                    {selectedStudent.latestWarning.acknowledgedAt
                      ? 'acknowledged'
                      : 'waiting for acknowledgment'}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Grant extra time to this student
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={extraMinutes}
                    onChange={(event) =>
                      setExtraMinutes(
                        Math.max(
                          1,
                          Math.min(240, Number(event.target.value) || 1)
                        )
                      )
                    }
                    className="w-24 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white"
                  />
                  <Button
                    icon={Clock3}
                    disabled={!canFlagStudent}
                    onClick={() => void addTime()}
                  >
                    Add minutes
                  </Button>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  {Math.floor(selectedStudent.extraTimeSeconds / 60)} extra
                  minutes granted ·{' '}
                  {Math.ceil(selectedStudent.remainingSeconds / 60)} minutes
                  remaining
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Connection recovery
                </label>
                <Button
                  icon={RotateCcw}
                  disabled={!canFlagStudent}
                  onClick={() => void resumeStudent()}
                >
                  Authorize resume
                </Button>
                <p className="mt-1 text-xs text-white/70">
                  {selectedStudent.connected
                    ? 'Student is connected.'
                    : 'The attempt will resume when the student reconnects.'}
                </p>
              </div>
              {actionMessage && (
                <p className="text-xs text-amber-200 lg:col-span-3">
                  {actionMessage}
                </p>
              )}
              {!canFlagStudent && (
                <p className="text-xs font-semibold text-amber-200 lg:col-span-3">
                  Student controls restricted by your dean.
                </p>
              )}
            </div>
            <div className="relative grid flex-1 place-items-center overflow-hidden rounded-lg bg-black">
              <ScreenView
                id={selectedStudent.id}
                name={selectedStudent.name}
                stream={streams[selectedStudent.id]}
                live={links[selectedStudent.id] === 'live'}
                frames={frames}
                fit="max-h-full max-w-full object-contain"
                placeholder={
                  <span className="text-sm text-white/70">
                    {selectedStudent.connected
                      ? 'Connecting…'
                      : 'Student is offline.'}
                  </span>
                }
              />
              {selectedStudent.connected && !selectedStudent.screenSharing && (
                <span className="absolute inset-0 grid place-items-center bg-red-950/80 text-white">
                  <span className="flex items-center font-semibold">
                    <MonitorOff size={20} className="mr-2" />
                    This student has stopped sharing their screen.
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
