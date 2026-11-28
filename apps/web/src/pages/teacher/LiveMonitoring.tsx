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
  Camera,
  CameraOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hand,
  Maximize2,
  MessageSquare,
  MicOff,
  Monitor,
  MonitorOff,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
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
import {
  autoGrid,
  DEFAULT_PAGE_SIZE,
  FOCUS_QUALITY_MAX_TILES,
  PAGE_SIZE_OPTIONS,
  readPreference,
  savePreference,
  TILE_MIN_WIDTH,
  type TileSize,
} from './monitoring/gridLayout';

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
  /** 'camera' = student is on a phone/tablet streaming the front camera. */
  feedSource: 'screen' | 'camera';
  /** The exam has "Require camera" on. */
  requireCamera: boolean;
  /** missing = no working device (allowed); blocked = student denied access. */
  cameraStatus: DeviceStatus;
  microphoneStatus: DeviceStatus;
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
type DeviceStatus = 'missing' | 'blocked' | null;
const toDeviceStatus = (value: unknown): DeviceStatus =>
  value === 'missing' || value === 'blocked' ? value : null;
type SortKey = 'risk' | 'violations' | 'hand' | 'name';

const CONNECT_TIMEOUT_MS = 10_000;
const DISCONNECT_GRACE_MS = 5_000;
const REFRESH_DEBOUNCE_MS = 600;
const TIER_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
/** Previews arrive every ~1.5 s; past this the camera is shown as paused. */
const FACE_STALE_MS = 6_000;

/**
 * Desktop students on camera-required exams get a face panel beside their
 * screen. Phones/tablets already stream the camera as their main feed.
 */
const hasFacePanel = (student: Pick<Student, 'requireCamera' | 'feedSource'>) =>
  student.requireCamera && student.feedSource === 'screen';

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

/** Small face photo of a desktop student, refreshed every ~1.5 s. */
function FaceView({
  id,
  name,
  faces,
  status,
  compact,
}: {
  id: string;
  name: string;
  faces: FrameStore;
  status?: DeviceStatus;
  compact?: boolean;
}) {
  const face = useSyncExternalStore(
    useCallback((listener) => faces.subscribe(id, listener), [faces, id]),
    () => faces.get(id)
  );
  // A frozen photo must not pass for a live one.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    setStale(false);
    if (!face) return;
    const timer = window.setTimeout(() => setStale(true), FACE_STALE_MS);
    return () => window.clearTimeout(timer);
  }, [face]);
  if (status)
    return (
      <span className="grid h-full w-full place-items-center bg-slate-900 p-1 text-center text-white/70">
        <span className="flex flex-col items-center gap-1">
          <CameraOff size={compact ? 16 : 22} />
          <span className="text-[10px] leading-tight">
            {status === 'missing' ? 'No webcam detected' : 'Camera blocked'}
          </span>
        </span>
      </span>
    );
  return (
    <span className="relative block h-full w-full overflow-hidden bg-slate-900">
      {face ? (
        <img
          src={face}
          alt={`${name}'s camera`}
          className={`h-full w-full object-cover ${stale ? 'opacity-40 grayscale' : ''}`}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-white/60">
          <Camera size={compact ? 16 : 24} />
        </span>
      )}
      {(stale || !face) && !compact && (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white/80">
          {face ? 'Camera paused' : 'Waiting for camera…'}
        </span>
      )}
      {stale && compact && (
        <span className="absolute inset-0 grid place-items-center">
          <CameraOff size={16} className="text-white/80" />
        </span>
      )}
    </span>
  );
}

const Tile = memo(function Tile({
  student,
  stream,
  link,
  frames,
  faces,
  onOpen,
  onVisible,
}: {
  student: Student;
  stream?: MediaStream;
  link?: Link;
  frames: FrameStore;
  faces: FrameStore;
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
  const face = hasFacePanel(student);
  // Overlays sit over the screen side so they never cover the face.
  const overlayLeft = face ? 'left-[30%]' : 'left-0';
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
      <span
        className={`absolute ${face ? 'left-[calc(30%+0.5rem)]' : 'left-2'} right-2 top-2 z-10 flex flex-wrap gap-1.5`}
      >
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
        {student.feedSource === 'camera' && (
          <span
            className="rounded-full bg-sky-600 px-2 py-1 text-[10px] font-bold text-white"
            title="This student is on a phone or tablet. Screen sharing is not available there, so the front camera is streamed instead."
          >
            <Smartphone className="inline" size={11} /> mobile · camera
          </span>
        )}
        {student.requireCamera && student.cameraStatus && (
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold text-white ${student.cameraStatus === 'blocked' ? 'bg-red-600' : 'bg-slate-600'}`}
            title={
              student.cameraStatus === 'blocked'
                ? 'The student blocked camera access. Their exam is paused until they allow it.'
                : 'No working camera on this device. The student was allowed to continue; face checks are skipped.'
            }
          >
            <CameraOff className="inline" size={11} />{' '}
            {student.cameraStatus === 'blocked' ? 'camera blocked' : 'no camera'}
          </span>
        )}
        {student.microphoneStatus && (
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold text-white ${student.microphoneStatus === 'blocked' ? 'bg-red-600' : 'bg-slate-600'}`}
            title={
              student.microphoneStatus === 'blocked'
                ? 'The student blocked microphone access. Their exam is paused until they allow it.'
                : 'No working microphone on this device. The student was allowed to continue; voice checks are skipped.'
            }
          >
            <MicOff className="inline" size={11} />{' '}
            {student.microphoneStatus === 'blocked' ? 'mic blocked' : 'no mic'}
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
      <span className="absolute inset-0 flex">
        {face && (
          <span className="h-full w-[30%] shrink-0 border-r border-white/15">
            <FaceView
              id={student.id}
              name={student.name}
              faces={faces}
              status={student.cameraStatus}
            />
          </span>
        )}
        <span className="relative block h-full min-w-0 flex-1">
          <ScreenView
            id={student.id}
            name={student.name}
            stream={stream}
            live={live}
            frames={frames}
            // Selfie-camera feeds are cropped to fill the tile (the face is
            // centred); screens are never cropped so no edge is hidden.
            fit={`h-full w-full ${
              student.feedSource === 'camera' ? 'object-cover' : 'object-contain'
            }`}
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
                {student.feedSource === 'camera'
                  ? 'Camera feed stopped'
                  : 'Screen sharing stopped'}
              </span>
            </span>
          )}
        </span>
      </span>
      <span className={`absolute bottom-0 ${overlayLeft} right-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-sm text-white`}
      >
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
  // Remembered per teacher browser; AUTO sizes tiles to fill the page.
  const [tileSize, setTileSize] = useState<TileSize>(() =>
    readPreference<TileSize>(
      'proctorx.monitor.tileSize',
      ['AUTO', 'S', 'M', 'L'],
      'AUTO'
    )
  );
  // Phones: filters fold behind a single button so the feeds stay in view.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(() =>
    readPreference<number>(
      'proctorx.monitor.pageSize',
      [...PAGE_SIZE_OPTIONS, 0],
      DEFAULT_PAGE_SIZE
    )
  );
  const [page, setPage] = useState(0);
  const [warningMessage, setWarningMessage] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [actionMessage, setActionMessage] = useState('');
  const [frames] = useState(() => new FrameStore());
  const [faces] = useState(() => new FrameStore());
  const selectedRef = useRef<string | null>(null);
  const visibleRef = useRef(new Set<string>());
  // True when only a few tiles are on screen: they get full-quality video.
  const largeTilesRef = useRef(false);
  const gridObserver = useRef<ResizeObserver | null>(null);
  // Callback ref: observe the wall whenever it mounts (it appears only once an
  // exam is chosen) without re-creating the observer on every render.
  const gridRef = useCallback((element: HTMLDivElement | null) => {
    gridObserver.current?.disconnect();
    gridObserver.current = null;
    if (!element) return;
    gridObserver.current = new ResizeObserver(([entry]) =>
      setGridWidth(Math.round(entry?.contentRect.width ?? 0))
    );
    gridObserver.current.observe(element);
  }, []);
  const [gridWidth, setGridWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    () => window.innerHeight
  );
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
    // The student's id for the current connection; other ids are stale.
    const peerIds = new Map<string, string>();
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
    const watched = new Set<string>();
    const live = new Set<string>();
    const fallbackWanted = new Set<string>();
    const fallbackSent = new Set<string>();
    // Students whose tile has a face panel, and those we asked for previews.
    const faceCapable = new Set<string>();
    const faceSent = new Set<string>();
    let examRequiresCamera = false;
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
      const wantFace = faceCapable.has(id) && shown;
      if (wantFace !== faceSent.has(id)) {
        if (wantFace) faceSent.add(id);
        else faceSent.delete(id);
        socket.emit('face:preview', { sessionId: id, enabled: wantFace });
      }
      if (live.has(id)) {
        const quality: Quality =
          selectedRef.current === id ||
          (visibleRef.current.has(id) && largeTilesRef.current)
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
      peerIds.delete(id);
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
      faceCapable.delete(id);
      faceSent.delete(id);
      retries.delete(id);
      clearTimer(`connect:${id}`);
      clearTimer(`retry:${id}`);
      setLink(id);
      frames.set(id);
      faces.set(id);
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
          feedSource: session.feedSource === 'camera' ? 'camera' : 'screen',
          requireCamera: Boolean(session.requireCamera),
          cameraStatus: toDeviceStatus(session.cameraStatus),
          microphoneStatus: toDeviceStatus(session.microphoneStatus),
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
        // The same for every attempt of this exam.
        examRequiresCamera = next.some((student) => student.requireCamera);
        next.forEach((student) => {
          if (hasFacePanel(student) && !student.cameraStatus)
            faceCapable.add(student.id);
          else faceCapable.delete(student.id);
          sync(student.id);
        });
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
        faceSent.clear();
        watched.forEach((id) => {
          closePeer(id);
          requestStream(id);
        });
        scheduleRefresh();
      });
    const onDisconnect = () => {
      joined = false;
    };

    const ready = async ({
      sessionId: id,
      peerId,
    }: {
      sessionId: string;
      peerId?: string;
    }) => {
      if (!watched.has(id) || !peerId) return;
      closePeer(id);
      const peer = new RTCPeerConnection(rtcConfig);
      peers.set(id, peer);
      peerIds.set(id, peerId);
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
        current() &&
        socket.emit('webrtc:signal', {
          sessionId: id,
          peerId,
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
          peerId,
          signal: { description: peer.localDescription },
        });
      } catch {
        if (current()) peerFailed(id);
      }
    };
    const signal = async ({
      sessionId: id,
      peerId,
      signal: incoming,
    }: {
      sessionId: string;
      peerId?: string;
      signal: Signal;
    }) => {
      const peer = peers.get(id);
      // An answer or candidate from a replaced connection would break this
      // one and start a reconnect loop: ignore it.
      if (!peer || peerIds.get(id) !== peerId) return;
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
      // null while the AI scorer is unavailable (the event is still shown);
      // a later update without an event carries the recomputed score.
      score: number | null;
      tier: string | null;
      event?: { type: string };
    }) =>
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? {
                ...student,
                ...(score !== null && tier
                  ? {
                      score,
                      tier: tier.toUpperCase() as Student['tier'],
                    }
                  : {}),
                tabSwitches:
                  student.tabSwitches +
                  (event &&
                  ['TAB_SWITCH', 'FULLSCREEN_EXIT'].includes(event.type)
                    ? 1
                    : 0),
                eventCount: student.eventCount + (event ? 1 : 0),
              }
            : student
        )
      );
    const sessionEnded = ({ sessionId }: { sessionId: string }) => {
      // The student is gone: don't keep showing a frozen last video frame.
      closePeer(sessionId);
      faces.set(sessionId);
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
      source,
      camera,
      microphone,
    }: {
      sessionId: string;
      sharing: boolean;
      source?: 'screen' | 'camera';
      camera?: string | null;
      microphone?: string | null;
    }) => {
      const feedSource = source === 'camera' ? 'camera' : 'screen';
      const cameraStatus = toDeviceStatus(camera);
      if (watched.has(sessionId)) {
        // No webcam: nothing to fetch, the panel just says so.
        if (
          hasFacePanel({ requireCamera: examRequiresCamera, feedSource }) &&
          !cameraStatus
        )
          faceCapable.add(sessionId);
        else faceCapable.delete(sessionId);
        sync(sessionId);
      }
      setStudents((current) =>
        current.map((student) =>
          student.id === sessionId
            ? {
                ...student,
                screenSharing: sharing,
                feedSource,
                cameraStatus,
                microphoneStatus: toDeviceStatus(microphone),
              }
            : student
        )
      );
    };
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
    const faceFrame = ({
      sessionId,
      frame: incoming,
    }: {
      sessionId: string;
      frame: ArrayBuffer | Uint8Array;
    }) => {
      if (!active || !faceSent.has(sessionId)) return;
      faces.set(
        sessionId,
        URL.createObjectURL(
          new Blob([incoming as BlobPart], { type: 'image/jpeg' })
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
    socket.on('face:frame', faceFrame);
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
      socket.off('face:frame', faceFrame);
      syncRef.current = () => undefined;
      frames.clear();
      faces.clear();
      setStreams({});
      setLinks({});
      socket.disconnect();
    };
  }, [examId, frames, faces]);

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
  // Few tiles on screen: switch their feeds to full quality (and back).
  const largeTiles =
    pageStudents.length > 0 && pageStudents.length <= FOCUS_QUALITY_MAX_TILES;
  useEffect(() => {
    if (largeTilesRef.current === largeTiles) return;
    largeTilesRef.current = largeTiles;
    visibleRef.current.forEach((id) => syncRef.current(id));
  }, [largeTiles]);
  useEffect(
    () => savePreference('proctorx.monitor.pageSize', pageSize),
    [pageSize]
  );
  useEffect(
    () => savePreference('proctorx.monitor.tileSize', tileSize),
    [tileSize]
  );
  // The window height bounds small walls so they fit without scrolling.
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const layout =
    tileSize === 'AUTO'
      ? autoGrid(pageStudents.length, gridWidth, viewportHeight)
      : null;
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
              className="w-full rounded-lg sm:w-auto sm:min-w-64 border border-border bg-surface px-3 py-2 text-text-1"
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
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text-1 sm:hidden"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={16} /> Filters, sort & layout
                {[
                  riskFilter,
                  connectionFilter,
                  sectionFilter,
                  specialFilter,
                ].filter(Boolean).length > 0 && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">
                    {
                      [
                        riskFilter,
                        connectionFilter,
                        sectionFilter,
                        specialFilter,
                      ].filter(Boolean).length
                    }
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <div
              className={`${filtersOpen ? 'grid' : 'hidden'} gap-2 rounded-xl border border-border bg-surface p-3 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8`}
            >
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
                  setTileSize(event.target.value as TileSize)
                }
                className={selectClass}
                aria-label="Tile size"
              >
                <option value="AUTO">Auto-fit tiles</option>
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
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size === 1
                      ? '1 screen per page'
                      : `${size} screens per page`}
                  </option>
                ))}
                <option value={0}>Show all screens</option>
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
                matching ({students.length} total). Screens on other pages are
                paused to save bandwidth.
                {largeTiles &&
                  ` With ${FOCUS_QUALITY_MAX_TILES} or fewer screens per page, each is shown at full quality.`}
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
            {/* Measure the full-width wrapper, never the grid itself: the grid
                gets a maxWidth from that measurement, and observing the element
                being resized made the layout oscillate (visible flicker). */}
            <div ref={gridRef} className="w-full">
              <div
                className="mx-auto grid w-full gap-3"
                style={
                  layout
                    ? {
                        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                        maxWidth: layout.maxWidth,
                      }
                    : {
                        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${TILE_MIN_WIDTH[tileSize as keyof typeof TILE_MIN_WIDTH]}px), 1fr))`,
                      }
                }
              >
                {pageStudents.map((student) => (
                  <Tile
                    key={student.id}
                    student={student}
                    stream={streams[student.id]}
                    link={links[student.id]}
                    frames={frames}
                    faces={faces}
                    onOpen={openStudent}
                    onVisible={onVisible}
                  />
                ))}
              </div>
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
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-2 sm:p-6">
          <div className="relative flex h-full w-full max-w-7xl flex-col overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-2 text-white sm:items-center">
              <span className="min-w-0 text-sm sm:text-base">
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
            <div className="order-last mb-3 grid gap-3 rounded-xl bg-white/10 p-3 text-white lg:order-none lg:grid-cols-3">
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
            <div className="mb-3 flex min-h-[38dvh] flex-1 gap-2 overflow-hidden lg:mb-0 lg:min-h-0">
              {hasFacePanel(selectedStudent) && (
                // Face on the left, much smaller than the screen beside it.
                <div className="flex w-[22%] min-w-[96px] max-w-[320px] shrink-0 flex-col gap-1">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-lg">
                    <FaceView
                      id={selectedStudent.id}
                      name={selectedStudent.name}
                      faces={faces}
                      status={selectedStudent.cameraStatus}
                    />
                  </div>
                  <p className="text-[11px] text-white/60">
                    Camera · updates every few seconds
                  </p>
                </div>
              )}
              <div className="relative grid min-w-0 flex-1 place-items-center overflow-hidden rounded-lg bg-black">
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
                {selectedStudent.connected &&
                  !selectedStudent.screenSharing && (
                    <span className="absolute inset-0 grid place-items-center bg-red-950/80 text-white">
                      <span className="flex items-center font-semibold">
                        <MonitorOff size={20} className="mr-2" />
                        {selectedStudent.feedSource === 'camera'
                          ? "This student's camera feed has stopped."
                          : 'This student has stopped sharing their screen.'}
                      </span>
                    </span>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
