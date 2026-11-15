import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  EyeOff,
  LogIn,
  Mic,
  Minus,
  Monitor,
  MonitorOff,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { DEFAULT_RTC_CONFIG, getRtcConfig } from '../../lib/rtc';
import {
  enterFullscreenIfSupported,
  isCameraOnlyDevice,
  pickRecorderMimeType,
} from '../../lib/device';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

/** Below this RMS level (about -40 dBFS) a chunk is treated as silence. */
const SILENCE_RMS = 0.01;

function rms(samples: Float32Array | number[]) {
  let sum = 0;
  for (let index = 0; index < samples.length; index++)
    sum += samples[index]! * samples[index]!;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Downsamples to 16 kHz (enough for speech, and a rate the server's voice
 * detector accepts) by averaging, cutting each upload to a third at 48 kHz.
 * Returns rate 0 when the capture rate cannot be converted.
 */
function toSpeechRate(samples: number[], rate: number) {
  if (rate === 8000 || rate === 16000) return { samples, rate };
  if (rate % 16000 !== 0) return { samples: [], rate: 0 };
  const factor = rate / 16000;
  const out = new Array<number>(Math.floor(samples.length / factor));
  for (let index = 0; index < out.length; index++) {
    let sum = 0;
    for (let offset = 0; offset < factor; offset++)
      sum += samples[index * factor + offset]!;
    out[index] = sum / factor;
  }
  return { samples: out, rate: 16000 };
}

/** Server explanation for expected refusals (time is up, attempt locked). */
function conflictMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const status = error.response?.status;
  const message = error.response?.data?.message;
  return (status === 409 || status === 403) && typeof message === 'string'
    ? message
    : undefined;
}
type Answer = {
  responseText?: string;
  selectedOptionIds?: string[];
  enumerationAnswers?: string[];
};
type StudentSubject = {
  id: string;
  code: string;
  subjectCode?: string;
  schedule?: string;
  name: string;
  teacher: { fullName: string };
  exams: {
    assessmentType: 'EXAM' | 'QUIZ';
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    endsAt: string | null;
    sessions: { endedAt: string }[];
  }[];
};
type StreamQuality = 'off' | 'thumb' | 'focus';
// Grid tiles are ~300px wide, so thumbnails are capped at 540p / 5 fps; only
// the student the teacher has enlarged is sent at full quality.
const QUALITY_PRESETS: Record<
  StreamQuality,
  {
    active: boolean;
    maxBitrate: number;
    maxFramerate: number;
    maxHeight: number;
  }
> = {
  off: { active: false, maxBitrate: 100_000, maxFramerate: 1, maxHeight: 360 },
  thumb: { active: true, maxBitrate: 250_000, maxFramerate: 5, maxHeight: 540 },
  focus: {
    active: true,
    maxBitrate: 2_500_000,
    maxFramerate: 15,
    maxHeight: 0,
  },
};
const applyStreamQuality = async (
  connection: RTCPeerConnection,
  quality: StreamQuality
) => {
  const sender = connection
    .getSenders()
    .find((candidate) => candidate.track?.kind === 'video');
  if (!sender) return;
  const parameters = sender.getParameters();
  // Encodings only exist once negotiation is done; applied again afterwards.
  if (!parameters.encodings?.length) return;
  const preset = QUALITY_PRESETS[quality];
  const height = sender.track?.getSettings().height ?? 0;
  parameters.encodings[0] = {
    ...parameters.encodings[0],
    active: preset.active,
    maxBitrate: preset.maxBitrate,
    maxFramerate: preset.maxFramerate,
    scaleResolutionDownBy:
      preset.maxHeight && height > preset.maxHeight
        ? height / preset.maxHeight
        : 1,
  };
  await sender.setParameters(parameters).catch(() => undefined);
};
const captureEntireScreen = async () => {
  const screen = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'monitor',
      frameRate: { ideal: 15, max: 20 },
    },
    audio: false,
    monitorTypeSurfaces: 'include',
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions);
  const track = screen.getVideoTracks()[0];
  if (track?.getSettings().displaySurface !== 'monitor') {
    screen.getTracks().forEach((item) => item.stop());
    throw new Error('The entire screen must be shared.');
  }
  // Screens are mostly text: keep resolution sharp, drop frames instead.
  track.contentHint = 'detail';
  await track
    .applyConstraints({ frameRate: { ideal: 15, max: 20 } })
    .catch(() => undefined);
  return screen;
};
/** Camera-only mode (phones/tablets): the front camera stands in for the screen. */
const captureCameraFeed = async () => {
  const camera = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 20 },
    },
    audio: false,
  });
  const track = camera.getVideoTracks()[0];
  if (track) track.contentHint = 'motion';
  return camera;
};
type DesktopLockdown = {
  startLockdown(policy: {
    mode: 'BLACKLIST' | 'WHITELIST';
    list: string[];
  }): Promise<{ platform: string }>;
  stopLockdown(): Promise<void>;
  onViolation(callback: (apps: string[]) => void): () => void;
  onFocusLost(callback: () => void): () => void;
};
const desktopLockdown = (window as Window & { proctorX?: DesktopLockdown })
  .proctorX;
const roomCodeSchema = z.string().trim().min(1).max(32);
const QUESTIONS_PER_PAGE = 10;
const enumerationEntries = (question: any, answer?: Answer) =>
  answer?.enumerationAnswers ??
  Array.from(
    { length: Math.max(1, question.enumerationAnswerCount ?? 1) },
    () => ''
  );
const parseEnumerationResponse = (responseText?: string) => {
  if (!responseText) return undefined;
  try {
    const parsed: unknown = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return responseText.split(/\r?\n/u);
  }
};
const hasAnswer = (question: any, answer?: Answer) =>
  question.type === 'MULTIPLE_CHOICE'
    ? Boolean(answer?.selectedOptionIds?.length)
    : question.type === 'ENUMERATION'
      ? Boolean(answer?.enumerationAnswers?.some((value) => value.trim()))
      : Boolean(answer?.responseText?.trim());
const submissionAnswer = (question: any, answer?: Answer) => ({
  questionId: question.id,
  responseText:
    question.type === 'ENUMERATION'
      ? JSON.stringify(
          (answer?.enumerationAnswers ?? [])
            .map((value) => value.trim())
            .filter(Boolean)
        )
      : answer?.responseText,
  selectedOptionIds: answer?.selectedOptionIds,
});
const formatCountdown = (total: number) => {
  const safe = Math.max(0, total);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

const answerSchema = z.object({
  questionId: z.string().min(1).max(128),
  responseText: z.string().max(5000).optional(),
  selectedOptionIds: z.array(z.string().min(1).max(128)).max(1).optional(),
});

export default function JoinSession() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [exam, setExam] = useState<any>();
  const [notice, setNotice] = useState('');
  const [locked, setLocked] = useState(false);
  const [nativeBlocked, setNativeBlocked] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<{
    totalScore: number | null;
    maxScore: number;
    gradeStatus: string;
  }>();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [activeWarning, setActiveWarning] = useState<{
    id: string;
    message: string;
    sentAt: string;
  }>();
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved'
  );
  const [submissionReason, setSubmissionReason] = useState<
    'submitted' | 'timeout'
  >('submitted');
  const [selectedSubject, setSelectedSubject] = useState<StudentSubject>();
  const [preview, setPreview] = useState<any>();
  const [consent, setConsent] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [screenShareLost, setScreenShareLost] = useState(false);
  const [multipleDisplays, setMultipleDisplays] = useState(false);
  const [captureAttempt, setCaptureAttempt] = useState(0);
  // Phones/tablets cannot share the screen: proctor through the camera instead.
  const [cameraOnly] = useState(isCameraOnlyDevice);
  const restartScreenShare = useRef<(() => Promise<void>) | null>(null);
  const mySubjects = useQuery({
    queryKey: ['student-subjects'],
    queryFn: async () =>
      (await api.get<StudentSubject[]>('/subjects/mine')).data,
    refetchInterval: 15_000,
  });
  const joinRequests = useQuery({
    queryKey: ['my-subject-join-requests'],
    queryFn: async () =>
      (await api.get<any[]>('/subjects/join-requests/mine')).data,
    refetchInterval: 15_000,
  });
  const requestSubject = useMutation({
    mutationFn: () =>
      api.post('/subjects/join', { code: subjectCode.trim().toUpperCase() }),
    onSuccess: () => {
      setSubjectCode('');
      setNotice(
        'Request sent. Your teacher must approve it before you can enter the subject.'
      );
      void queryClient.invalidateQueries({
        queryKey: ['my-subject-join-requests'],
      });
    },
    onError: (error) =>
      setNotice(
        axios.isAxiosError(error)
          ? (error.response?.data?.message ??
              'Could not send the join request.')
          : 'Could not send the join request.'
      ),
  });
  const hideJoinRequest = useMutation({
    mutationFn: (requestId: string) =>
      api.patch(`/subjects/join-requests/${requestId}/hide`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['my-subject-join-requests'],
      }),
    onError: () => setNotice('Could not hide that join request.'),
  });
  const recorder = useRef<MediaRecorder | null>(null);
  const suppressIncidentRef = useRef(false);
  const endingRecordingRef = useRef(false);
  const recordingUploads = useRef<Promise<unknown>>(Promise.resolve());
  const screenStream = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const timers = useRef<number[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const join = async () => {
    const parsed = roomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setNotice('Enter a valid room code.');
      return;
    }
    try {
      const data = (
        await api.post('/sessions/preview', {
          roomCode: parsed.data.toUpperCase(),
        })
      ).data;
      if (selectedSubject && data.subject.id !== selectedSubject.id)
        return setNotice(
          'That assessment code belongs to a different subject.'
        );
      setPreview(data);
      setNotice('');
    } catch {
      setNotice('No available published assessment matches this code.');
    }
  };
  const enterExam = async () => {
    if (!consent)
      return setNotice(
        'Confirm that you understand the monitoring requirements.'
      );
    try {
      if (cameraOnly) await enterFullscreenIfSupported();
      else await document.documentElement.requestFullscreen();
      const joined = (
        await api.post('/sessions/join', {
          roomCode: code.trim().toUpperCase(),
        })
      ).data;
      setAnswers(
        Object.fromEntries(
          (joined.savedAnswers ?? []).map((answer: any) => [
            answer.questionId,
            {
              responseText: answer.responseText,
              selectedOptionIds: answer.selectedOptionIds,
              enumerationAnswers:
                joined.exam.questions.find(
                  (question: any) => question.id === answer.questionId
                )?.type === 'ENUMERATION'
                  ? parseEnumerationResponse(answer.responseText)
                  : undefined,
            },
          ])
        )
      );
      setRemainingSeconds(
        joined.session.remainingSeconds ?? joined.exam.durationMinutes * 60
      );
      setLocked(Boolean(joined.session.isLocked));
      setActiveWarning(joined.pendingWarning ?? undefined);
      suppressIncidentRef.current = false;
      endingRecordingRef.current = false;
      setExam(joined);
      setPreview(undefined);
      setSelectedSubject(undefined);
      setFullscreenLost(false);
    } catch (error) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setNotice(
        conflictMessage(error) ??
          (cameraOnly
            ? 'The assessment room could not be entered. Check your connection and try again.'
            : 'The assessment room could not be entered. Allow fullscreen and try again.')
      );
    }
  };

  useEffect(() => {
    if (!exam || submitted) return;
    let active = true;
    const id = exam.session.id as string;
    const examId = exam.exam.id as string;
    // Sampling can race with automatic submission. A completed session correctly
    // returns 403, so contain that expected response instead of leaking an
    // unhandled promise rejection into the exam room.
    const postInBackground = (url: string, body: unknown) =>
      api.post(url, body).catch(() => undefined);
    const send = (type: string) =>
      postInBackground(`/sessions/${id}/events`, { type });
    let captureEvidence = (type: 'TAB_SWITCH' | 'FULLSCREEN_EXIT') =>
      send(type).then(() => undefined);
    let rtcConfig = DEFAULT_RTC_CONFIG;
    void getRtcConfig().then((config) => {
      rtcConfig = config;
    });
    // One peer connection per viewer, so several teachers / tabs can watch.
    type Viewer = {
      connection: RTCPeerConnection;
      quality: StreamQuality;
      pending: RTCIceCandidateInit[];
    };
    const viewers = new Map<string, Viewer>();
    const requestedViewers = new Set<string>();
    let fallbackEnabled = false;
    const closeViewer = (viewerId: string) => {
      viewers.get(viewerId)?.connection.close();
      viewers.delete(viewerId);
    };
    const createPeer = (viewerId: string) => {
      const stream = screenStream.current;
      if (!stream) return;
      closeViewer(viewerId);
      const connection = new RTCPeerConnection(rtcConfig);
      const viewer: Viewer = { connection, quality: 'thumb', pending: [] };
      viewers.set(viewerId, viewer);
      stream
        .getVideoTracks()
        .forEach((track) => connection.addTrack(track, stream));
      connection.onicecandidate = ({ candidate }) =>
        candidate &&
        socket.emit('webrtc:signal', {
          viewerId,
          signal: { candidate: candidate.toJSON() },
        });
      connection.onconnectionstatechange = () => {
        if (
          connection.connectionState === 'failed' &&
          viewers.get(viewerId) === viewer
        )
          closeViewer(viewerId);
      };
      socket.emit('webrtc:ready', { viewerId });
    };
    const watch = ({ viewerId }: { viewerId?: string }) => {
      if (!viewerId) return;
      requestedViewers.add(viewerId);
      // No-op while the screen picker is still open; replayed after capture.
      createPeer(viewerId);
    };
    const stopViewer = ({ viewerId }: { viewerId?: string }) => {
      if (!viewerId) return;
      requestedViewers.delete(viewerId);
      closeViewer(viewerId);
    };
    const setQuality = ({
      viewerId,
      quality,
    }: {
      viewerId?: string;
      quality?: StreamQuality;
    }) => {
      const viewer = viewerId ? viewers.get(viewerId) : undefined;
      if (!viewer || !quality || !(quality in QUALITY_PRESETS)) return;
      viewer.quality = quality;
      void applyStreamQuality(viewer.connection, quality);
    };
    const setFallback = ({ enabled }: { enabled?: boolean }) => {
      fallbackEnabled = Boolean(enabled);
    };
    const signal = async ({
      viewerId,
      signal: incoming,
    }: {
      viewerId?: string;
      signal: Signal;
    }) => {
      const viewer = viewerId ? viewers.get(viewerId) : undefined;
      if (!viewer || !viewerId) return;
      const { connection } = viewer;
      try {
        if (incoming.description) {
          await connection.setRemoteDescription(incoming.description);
          while (viewer.pending.length)
            await connection.addIceCandidate(viewer.pending.shift()!);
          if (incoming.description.type === 'offer') {
            await connection.setLocalDescription(
              await connection.createAnswer()
            );
            socket.emit('webrtc:signal', {
              viewerId,
              signal: { description: connection.localDescription },
            });
            await applyStreamQuality(connection, viewer.quality);
          }
        } else if (incoming.candidate) {
          if (connection.remoteDescription)
            await connection.addIceCandidate(incoming.candidate);
          else viewer.pending.push(incoming.candidate);
        }
      } catch {
        // The teacher notices the failed peer and requests a new one.
        if (viewers.get(viewerId) === viewer) closeViewer(viewerId);
      }
    };
    const announceSharing = () =>
      socket.emit('screen:state', {
        sharing:
          screenStream.current?.getVideoTracks()[0]?.readyState === 'live',
        source: cameraOnly ? 'camera' : 'screen',
      });
    let displaysReported = false;
    // Window Management API (Chromium): isExtended is true when more than one
    // display is attached, which the single-monitor screen share cannot see.
    const displayScreen = window.screen as Screen &
      Partial<EventTarget> & { isExtended?: boolean };
    const checkDisplays = () => {
      const extended = Boolean(displayScreen.isExtended);
      setMultipleDisplays(extended);
      if (extended && !displaysReported && !suppressIncidentRef.current) {
        displaysReported = true;
        void send('MULTIPLE_DISPLAYS');
      }
      if (!extended) displaysReported = false;
    };
    checkDisplays();
    displayScreen.addEventListener?.('change', checkDisplays);
    timers.current.push(
      window.setInterval(() => {
        if (socket.connected) socket.emit('student:heartbeat');
      }, 5000)
    );
    let lastTabSwitchAt = 0;
    let monitoringArmed = false;
    const reportTabSwitch = () => {
      const now = Date.now();
      if (now - lastTabSwitchAt < 1000) return;
      lastTabSwitchAt = now;
      if (!suppressIncidentRef.current) void captureEvidence('TAB_SWITCH');
    };
    const visibility = () => document.hidden && reportTabSwitch();
    const fullscreen = () => {
      const exited = !document.fullscreenElement;
      setFullscreenLost(exited);
      if (exited && monitoringArmed && !suppressIncidentRef.current)
        void captureEvidence('FULLSCREEN_EXIT');
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    const warn = (message: { id: string; message: string; sentAt: string }) =>
      setActiveWarning(message);
    const lock = (message: { locked: boolean }) => setLocked(message.locked);
    const timeAdjusted = (message: { remainingSeconds: number }) => {
      setRemainingSeconds(message.remainingSeconds);
      setNotice('Your teacher granted additional exam time.');
    };
    const resume = () => {
      setLocked(false);
      setNotice('Your teacher authorized this attempt to resume.');
    };
    const examEnded = async (message: { message?: string }) => {
      setNotice(message.message ?? 'This assessment has ended.');
      setLocked(false);
      setExam(undefined);
      setAnswers({});
      setQuestionIndex(0);
      if (document.fullscreenElement) await document.exitFullscreen();
      void queryClient.invalidateQueries({ queryKey: ['student-subjects'] });
    };
    const joinStudentRoom = () =>
      socket.emit('student:join', { sessionId: id, examId }, () =>
        announceSharing()
      );
    socket.on('connect', joinStudentRoom);
    socket.on('student:warn', warn);
    socket.on('student:lock', lock);
    socket.on('student:time-adjusted', timeAdjusted);
    socket.on('student:resume', resume);
    socket.on('student:exam-ended', examEnded);
    socket.on('webrtc:request', watch);
    socket.on('webrtc:signal', signal);
    socket.on('webrtc:stop', stopViewer);
    socket.on('webrtc:quality', setQuality);
    socket.on('screen:fallback', setFallback);
    socket.connect();
    if (socket.connected) joinStudentRoom();
    void (async () => {
      try {
        // React Strict Mode immediately cleans up its first development-only
        // effect pass. Yield once so that pass cannot open a second picker.
        await Promise.resolve();
        if (!active) return;
        if (cameraOnly) await enterFullscreenIfSupported();
        else if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen();
        const captureFeed = cameraOnly ? captureCameraFeed : captureEntireScreen;
        let screen = await captureFeed();
        if (!active) {
          screen.getTracks().forEach((track) => track.stop());
          return;
        }
        screenStream.current = screen;
        setScreenShareLost(false);
        announceSharing();
        // A teacher can request the stream while the screen-picker is open.
        // Start signaling now that capture is actually available.
        requestedViewers.forEach(createPeer);
        const screenVideo = document.createElement('video');
        screenVideo.srcObject = screen;
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        await screenVideo.play().catch((error: DOMException) => {
          if (error.name !== 'AbortError') throw error;
        });
        const screenCanvas = document.createElement('canvas');
        let frameEncoding = false;
        const sendScreenFrame = () => {
          if (
            !fallbackEnabled ||
            frameEncoding ||
            !active ||
            !socket.connected ||
            screenVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          )
            return;
          const sourceWidth = screenVideo.videoWidth;
          const sourceHeight = screenVideo.videoHeight;
          if (!sourceWidth || !sourceHeight) return;
          const width = Math.min(sourceWidth, 720);
          const height = Math.round((sourceHeight / sourceWidth) * width);
          screenCanvas.width = width;
          screenCanvas.height = height;
          screenCanvas
            .getContext('2d')
            ?.drawImage(screenVideo, 0, 0, width, height);
          frameEncoding = true;
          screenCanvas.toBlob(
            async (blob) => {
              try {
                if (!blob || !active || !socket.connected) return;
                socket.volatile.emit('screen:frame', {
                  frame: await blob.arrayBuffer(),
                  mimeType: blob.type,
                });
              } finally {
                frameEncoding = false;
              }
            },
            // Safari cannot encode WebP; camera frames compress well as JPEG.
            cameraOnly ? 'image/jpeg' : 'image/webp',
            cameraOnly ? 0.6 : 0.45
          );
        };
        sendScreenFrame();
        // WebRTC is the primary live feed. These low-rate images are only sent
        // while the server reports a viewer whose peer connection failed.
        timers.current.push(window.setInterval(sendScreenFrame, 1000));
        const preferredMimeType = pickRecorderMimeType();
        type Segment = { blob: Blob; startedAt: Date; endedAt: Date };
        type PendingEvidence = {
          eventId: string;
          occurredAtMs: number;
          previous: Segment | null;
          incidentSegmentCaptured: boolean;
        };
        let pendingEvidence: PendingEvidence[] = [];
        const completedSegments: Segment[] = [];
        let recordingErrorShown = false;
        const uploadClip = (
          eventId: string,
          phase: 'PREVIOUS' | 'INCIDENT' | 'FOLLOWING',
          segment: Segment
        ) => {
          const form = new FormData();
          form.append('eventId', eventId);
          form.append('phase', phase);
          form.append('startedAt', segment.startedAt.toISOString());
          form.append('endedAt', segment.endedAt.toISOString());
          const extension = segment.blob.type.includes('mp4') ? 'mp4' : 'webm';
          form.append(
            'clip',
            segment.blob,
            `${phase.toLowerCase()}.${extension}`
          );
          recordingUploads.current = recordingUploads.current
            .then(() => api.post(`/sessions/${id}/evidence-clips`, form))
            .catch(() => {
              if (active && !recordingErrorShown) {
                recordingErrorShown = true;
                setNotice('An incident evidence clip could not be saved.');
              }
            });
        };
        const uploadIncidentSegment = (
          pending: PendingEvidence,
          incident: Segment
        ) => {
          if (pending.previous)
            uploadClip(pending.eventId, 'PREVIOUS', pending.previous);
          uploadClip(pending.eventId, 'INCIDENT', incident);
        };
        const recordSegment = () => {
          if (!active || screen.getVideoTracks()[0]?.readyState !== 'live')
            return;
          const startedAt = new Date();
          const chunks: Blob[] = [];
          const segmentRecorder = new MediaRecorder(screen, {
            ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
            videoBitsPerSecond: 1_200_000,
          });
          recorder.current = segmentRecorder;
          segmentRecorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          segmentRecorder.onstop = () => {
            const segment: Segment = {
              blob: new Blob(chunks, {
                type: (segmentRecorder.mimeType || 'video/webm').split(';')[0]!,
              }),
              startedAt,
              endedAt: new Date(),
            };
            const stillPending: PendingEvidence[] = [];
            for (const pending of pendingEvidence) {
              if (pending.incidentSegmentCaptured) {
                uploadClip(pending.eventId, 'FOLLOWING', segment);
                continue;
              }
              const containsEvent =
                +segment.startedAt <= pending.occurredAtMs &&
                pending.occurredAtMs <= +segment.endedAt;
              if (containsEvent) {
                uploadIncidentSegment(pending, segment);
                if (!endingRecordingRef.current)
                  stillPending.push({
                    ...pending,
                    incidentSegmentCaptured: true,
                  });
              } else {
                stillPending.push(pending);
              }
            }
            pendingEvidence = stillPending;
            completedSegments.push(segment);
            if (completedSegments.length > 2) completedSegments.shift();
            if (!endingRecordingRef.current) recordSegment();
          };
          segmentRecorder.start();
          window.setTimeout(() => {
            if (segmentRecorder.state === 'recording') segmentRecorder.stop();
          }, 10_000);
        };
        captureEvidence = async (type) => {
          const response = await api
            .post(`/sessions/${id}/events`, { type })
            .catch((error: { response?: { status?: number } }) => {
              if (error.response?.status !== 403)
                setNotice('The monitoring incident could not be saved.');
              return undefined;
            });
          if (!response) return;
          if (!response.data?.eventId || !response.data?.occurredAt) {
            setNotice(
              'The incident was recorded, but its evidence clip could not be linked.'
            );
            return;
          }
          const occurredAtMs = +new Date(response.data.occurredAt);
          const incidentIndex = completedSegments.findIndex(
            (segment) =>
              +segment.startedAt <= occurredAtMs &&
              occurredAtMs <= +segment.endedAt
          );
          if (incidentIndex >= 0) {
            const incident = completedSegments[incidentIndex]!;
            const previous = completedSegments[incidentIndex - 1] ?? null;
            const pending: PendingEvidence = {
              eventId: response.data.eventId,
              occurredAtMs,
              previous,
              incidentSegmentCaptured: true,
            };
            uploadIncidentSegment(pending, incident);
            pendingEvidence.push(pending);
            return;
          }
          pendingEvidence.push({
            eventId: response.data.eventId,
            occurredAtMs,
            previous: completedSegments.at(-1) ?? null,
            incidentSegmentCaptured: false,
          });
        };
        recordSegment();
        const onScreenEnded = () => {
          if (!active) return;
          announceSharing();
          setScreenShareLost(true);
          if (!suppressIncidentRef.current) void send('SCREEN_SHARE_STOPPED');
        };
        screen
          .getVideoTracks()[0]
          ?.addEventListener('ended', onScreenEnded, { once: true });
        restartScreenShare.current = async () => {
          const next = await captureFeed();
          if (!active) {
            next.getTracks().forEach((track) => track.stop());
            return;
          }
          screen.getTracks().forEach((track) => track.stop());
          screen = next;
          screenStream.current = next;
          const track = next.getVideoTracks()[0];
          // Swap the track in place: no renegotiation, teachers keep watching.
          await Promise.all(
            [...viewers.values()].map(async (viewer) => {
              const sender = viewer.connection
                .getSenders()
                .find((candidate) => candidate.track?.kind === 'video');
              await sender?.replaceTrack(track ?? null).catch(() => undefined);
              await applyStreamQuality(viewer.connection, viewer.quality);
            })
          );
          screenVideo.srcObject = next;
          await screenVideo.play().catch(() => undefined);
          track?.addEventListener('ended', onScreenEnded, { once: true });
          announceSharing();
          setScreenShareLost(false);
          if (recorder.current?.state !== 'recording') recordSegment();
        };
        if (exam.exam.requireCamera) {
          // In camera-only mode the proctoring feed already is the camera;
          // phones often refuse to open the same camera twice.
          let video = screenVideo;
          if (!cameraOnly) {
            cameraStream.current = await navigator.mediaDevices.getUserMedia({
              video: { frameRate: { ideal: 15, max: 20 } },
              audio: false,
            });
            video = document.createElement('video');
            video.srcObject = cameraStream.current;
            video.muted = true;
            video.playsInline = true;
            await video.play().catch((error: DOMException) => {
              if (error.name !== 'AbortError') throw error;
            });
          }
          const sample = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const form = new FormData();
                  form.append('frame', blob, 'frame.jpg');
                  void postInBackground(`/sessions/${id}/camera-sample`, form);
                }
              },
              'image/jpeg',
              0.75
            );
          };
          sample();
          timers.current.push(
            window.setInterval(
              sample,
              (exam.exam.monitoring?.faceSampleSeconds ?? 10) * 1000
            )
          );
        }
        if (exam.exam.requireMicrophone) {
          microphoneStream.current = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          const context = new AudioContext({ sampleRate: 48000 });
          audioContext.current = context;
          const source = context.createMediaStreamSource(
            microphoneStream.current
          );
          const processor = context.createScriptProcessor(4096, 1, 1);
          const pcm: number[] = [];
          processor.onaudioprocess = (event) =>
            pcm.push(...event.inputBuffer.getChannelData(0));
          source.connect(processor);
          processor.connect(context.destination);
          const sample = () => {
            const captured = pcm.splice(0);
            const { samples, rate } = toSpeechRate(captured, context.sampleRate);
            // Only send audio that could contain speech; the server's voice
            // detector still makes the decision. Saves ~95% of uploads.
            if (!samples.length || !rate || rms(samples) < SILENCE_RMS) return;
            const data = new ArrayBuffer(44 + samples.length * 2),
              view = new DataView(data),
              write = (offset: number, text: string) =>
                [...text].forEach((char, index) =>
                  view.setUint8(offset + index, char.charCodeAt(0))
                );
            write(0, 'RIFF');
            view.setUint32(4, 36 + samples.length * 2, true);
            write(8, 'WAVEfmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, rate, true);
            view.setUint32(28, rate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            write(36, 'data');
            view.setUint32(40, samples.length * 2, true);
            samples.forEach((sample, index) =>
              view.setInt16(
                44 + index * 2,
                Math.max(-1, Math.min(1, sample)) * 32767,
                true
              )
            );
            const form = new FormData();
            form.append(
              'chunk',
              new Blob([data], { type: 'audio/wav' }),
              'sample.wav'
            );
            void postInBackground(`/sessions/${id}/audio-sample`, form);
          };
          timers.current.push(
            window.setInterval(
              sample,
              (exam.exam.monitoring?.audioSampleSeconds ?? 10) * 1000
            )
          );
        }
      } catch {
        if (!active) return;
        setNotice(
          cameraOnly
            ? 'Camera access is required to take this assessment on a phone or tablet. Allow camera (and microphone if asked) in your browser settings.'
            : 'Required screen, camera, or microphone permission was not granted.'
        );
        if (!screenStream.current) {
          // Without a screen share the attempt cannot be proctored: block the
          // exam and let the student retry (re-runs this effect).
          setScreenShareLost(true);
          restartScreenShare.current = async () =>
            setCaptureAttempt((attempt) => attempt + 1);
        }
      }
    })();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      socket.off('connect', joinStudentRoom);
      socket.off('student:warn', warn);
      socket.off('student:lock', lock);
      socket.off('student:time-adjusted', timeAdjusted);
      socket.off('student:resume', resume);
      socket.off('student:exam-ended', examEnded);
      socket.off('webrtc:request', watch);
      socket.off('webrtc:signal', signal);
      socket.off('webrtc:stop', stopViewer);
      socket.off('webrtc:quality', setQuality);
      socket.off('screen:fallback', setFallback);
      displayScreen.removeEventListener?.('change', checkDisplays);
      restartScreenShare.current = null;
      timers.current.forEach(window.clearInterval);
      timers.current = [];
      audioContext.current?.close();
      [...viewers.keys()].forEach(closeViewer);
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      [
        screenStream.current,
        cameraStream.current,
        microphoneStream.current,
      ].forEach((stream) =>
        stream?.getTracks().forEach((track) => track.stop())
      );
      screenStream.current = null;
      socket.disconnect();
    };
  }, [exam, submitted, captureAttempt, cameraOnly]);

  useEffect(() => {
    if (!exam || submitted || !desktopLockdown) return;
    let violationPending = false;
    void desktopLockdown
      .startLockdown({
        mode: exam.exam.appPolicyMode,
        list: exam.exam.appPolicyList ?? [],
      })
      .catch(() =>
        setNotice(
          'Desktop lockdown could not start. Close the exam and check system permissions.'
        )
      );
    const removeViolation = desktopLockdown.onViolation((applications) => {
      if (!applications.length) {
        setNativeBlocked(false);
        return;
      }
      setNativeBlocked(true);
      if (violationPending) return;
      violationPending = true;
      setNotice(`Close prohibited application(s): ${applications.join(', ')}`);
      void api
        .post(`/sessions/${exam.session.id}/events`, {
          type: 'BLACKLISTED_APP',
          metadata: { applications, seconds: 2.5 },
        })
        .finally(() => {
          violationPending = false;
        });
    });
    const removeFocusLost = desktopLockdown.onFocusLost(() => {
      setFullscreenLost(true);
    });
    return () => {
      removeViolation();
      removeFocusLost();
      void desktopLockdown.stopLockdown();
    };
  }, [exam, submitted]);
  useEffect(() => {
    if (!exam || submitted) return;
    const timer = window.setInterval(
      () => setRemainingSeconds((value) => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [exam, submitted]);

  useEffect(() => {
    if (!exam || submitted || exam.exam.sourceType === 'GOOGLE_FORMS_IMPORT')
      return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const payload = {
        answers: exam.exam.questions.map((question: any) =>
          submissionAnswer(question, answers[question.id])
        ),
      };
      void api
        .post(`/sessions/${exam.session.id}/draft`, payload)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, exam, submitted]);

  useEffect(() => {
    if (!exam || submitted) return;
    let busy = false;
    const heartbeat = async () => {
      if (busy) return;
      busy = true;
      try {
        const { data } = await api.post(
          `/sessions/${exam.session.id}/heartbeat`
        );
        setRemainingSeconds(data.remainingSeconds);
        if (data.expired) {
          setSubmissionReason('timeout');
          setScore(data.result);
          setSubmitted(true);
          setFullscreenLost(false);
          if (document.fullscreenElement) await document.exitFullscreen();
          void queryClient.invalidateQueries({
            queryKey: ['student-subjects'],
          });
        }
      } catch {
        // Offline: the server-side countdown keeps running (wall clock); the
        // local timer keeps ticking and resyncs on the next heartbeat.
      } finally {
        busy = false;
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 5000);
    return () => window.clearInterval(timer);
  }, [exam, queryClient, submitted]);
  const submit = async () => {
    const unanswered = exam.exam.questions.findIndex((question: any) => {
      if (!question.isRequired) return false;
      const answer = answers[question.id];
      if (question.type === 'ENUMERATION') {
        const entries = enumerationEntries(question, answer);
        return !entries.length || entries.some((value) => !value.trim());
      }
      return !hasAnswer(question, answer);
    });
    if (unanswered >= 0) {
      setQuestionIndex(Math.floor(unanswered / QUESTIONS_PER_PAGE));
      setNotice('Answer all required questions before submitting.');
      return;
    }
    const payload = {
      answers: exam.exam.questions.map((question: any) =>
        submissionAnswer(question, answers[question.id])
      ),
    };
    const parsed = z
      .object({ answers: z.array(answerSchema) })
      .safeParse(payload);
    if (!parsed.success) {
      setNotice('One or more answers are invalid.');
      return;
    }
    try {
      const activeRecorder = recorder.current;
      if (activeRecorder && activeRecorder.state !== 'inactive') {
        const stopped = new Promise<void>((resolve) =>
          activeRecorder.addEventListener('stop', () => resolve(), {
            once: true,
          })
        );
        activeRecorder.stop();
        await stopped;
        await recordingUploads.current;
      }
      const response = await api.post(
        `/sessions/${exam.session.id}/submit`,
        parsed.data
      );
      const result = response.data;
      setFullscreenLost(false);
      if (document.fullscreenElement) await document.exitFullscreen();
      void queryClient.invalidateQueries({ queryKey: ['student-subjects'] });
      setSubmissionReason('submitted');
      setScore(result);
      setSubmitted(true);
    } catch (error) {
      // 409 "time is up" / 403 "locked" come from the server; the next
      // heartbeat picks up an auto-submitted result.
      setNotice(
        conflictMessage(error) ??
          'Your answers could not be submitted. Please try again.'
      );
    }
  };
  if (!exam)
    return (
      <DashboardLayout role="student" pageTitle="Join Session">
        {notice && (
          <div
            role="status"
            className={`mb-4 rounded border p-3 text-sm font-medium ${
              notice.startsWith('Request sent.') ||
              notice.includes('submitted successfully')
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-red-300 bg-red-50 text-red-700'
            }`}
          >
            {notice}
          </div>
        )}
        <Card>
          <CardHeader
            title="Join a subject"
            subtitle="Enter the code from your teacher. Enrollment starts only after approval."
          />
          <input
            value={subjectCode}
            onChange={(event) =>
              setSubjectCode(event.target.value.toUpperCase())
            }
            placeholder="Subject join code"
            maxLength={30}
            className="my-4 w-full rounded border p-3"
          />
          <Button
            disabled={requestSubject.isPending || !subjectCode.trim()}
            onClick={() => requestSubject.mutate()}
            icon={LogIn}
          >
            {requestSubject.isPending ? 'Sending…' : 'Request to join'}
          </Button>
          {!!joinRequests.data?.length && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs font-bold uppercase text-text-3">
                Recent requests
              </div>
              {joinRequests.data.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
                >
                  <span>{request.subject.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        request.status === 'APPROVED'
                          ? 'text-risk-low'
                          : request.status === 'DECLINED'
                            ? 'text-risk-high'
                            : 'text-amber-600'
                      }
                    >
                      {request.status.toLowerCase()}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-border p-2 text-text-3 transition hover:border-blue-600 hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={hideJoinRequest.isPending}
                      onClick={() => hideJoinRequest.mutate(request.id)}
                      aria-label={`Hide ${request.subject.name} join request`}
                      title="Hide request"
                    >
                      <EyeOff size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="mt-5" padded={false}>
          <div className="p-6">
            <CardHeader
              title="My Subjects"
              subtitle="Enter an assessment room from one of your approved subjects."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-y border-border bg-surface-2 text-xs uppercase text-text-3">
                <tr>
                  <th className="p-4 text-left">Subject</th>
                  <th className="p-4 text-left">Teacher</th>
                  <th className="p-4 text-left">Assessment Available</th>
                  <th className="p-4 text-left">Status</th>
                  <th className="p-4 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {mySubjects.data?.map((subject) => {
                  const latest = subject.exams[0];
                  const completed = !!latest?.sessions.length;
                  const available =
                    !!latest &&
                    latest.status === 'PUBLISHED' &&
                    (!latest.endsAt || new Date(latest.endsAt) > new Date());
                  return (
                    <tr
                      key={subject.id}
                      className="border-b border-border text-left"
                    >
                      <td className="p-4 text-left font-semibold">
                        {subject.subjectCode} - {subject.name}
                        {subject.schedule ? ` | ${subject.schedule}` : ''}
                      </td>
                      <td className="p-4 text-left">
                        {subject.teacher.fullName}
                      </td>
                      <td className="p-4 text-left">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            available
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {available ? '1 Exam/Quiz' : 'No Exam/Quiz'}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            completed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {completed
                            ? 'Exam/Quiz Taken'
                            : 'Exam/Quiz Not yet taken'}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <Button
                          disabled={!available || completed}
                          onClick={() => {
                            setSelectedSubject(subject);
                            setCode('');
                            setPreview(undefined);
                            setConsent(false);
                          }}
                          icon={LogIn}
                        >
                          Join
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!mySubjects.isLoading && !mySubjects.data?.length && (
            <p className="p-6 text-sm text-text-2">No approved subjects yet.</p>
          )}
        </Card>
        {selectedSubject && (
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
            <Card className="w-full max-w-xl">
              <div className="flex justify-between">
                <CardHeader
                  title={`Join ${selectedSubject.subjectCode} - ${selectedSubject.name}`}
                  subtitle="Use the assessment code provided by your teacher."
                />
                <button onClick={() => setSelectedSubject(undefined)}>
                  <span className="sr-only">Close</span>×
                </button>
              </div>
              {!preview ? (
                <div className="space-y-4">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded border border-border p-3"
                    placeholder="Exam or quiz code"
                    maxLength={32}
                  />
                  <div className="flex justify-end">
                    <Button onClick={() => void join()}>Continue</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-brand-soft p-4">
                    <b>{preview.title}</b>
                    <p className="mt-1 text-sm">
                      {preview.assessmentType === 'QUIZ' ? 'Quiz' : 'Exam'} ·{' '}
                      {preview.questionCount} items
                    </p>
                  </div>
                  <div className="space-y-3 text-sm">
                    {cameraOnly && (
                      <p className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900">
                        <Camera className="shrink-0 text-sky-600" size={18} />
                        <span>
                          <b>Phone/tablet mode.</b> Screen sharing is not
                          available on mobile browsers, so your front camera
                          is used for live monitoring and evidence instead. Keep
                          your face visible and stay in this browser tab —
                          switching apps or tabs is recorded.
                        </span>
                      </p>
                    )}
                    <p className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-violet-900">
                      <Clock3 className="shrink-0 text-violet-600" size={18} />
                      <span>
                        A {preview.durationMinutes}-minute timer appears inside
                        the room and begins once you enter the room.
                        Fullscreen exits and tab switches do not pause it. Your
                        saved time resumes after an accidental shutdown, but the
                        scheduled closing time remains the final deadline.
                      </span>
                    </p>
                    <p className="flex gap-2">
                      <Monitor className="shrink-0 text-brand" size={18} />
                      {cameraOnly
                        ? 'This assessment is monitored. Fullscreen is used where your browser supports it, and leaving it is recorded.'
                        : 'This assessment is monitored and will enter fullscreen automatically. Leaving fullscreen blocks the exam and is recorded.'}
                    </p>
                    <p className="flex gap-2">
                      <Camera className="shrink-0 text-brand" size={18} />
                      {preview.requireCamera
                        ? 'Your camera will capture monitoring samples.'
                        : 'Camera monitoring is not required.'}
                    </p>
                    <p className="flex gap-2">
                      <Mic className="shrink-0 text-brand" size={18} />
                      {preview.requireMicrophone
                        ? 'Microphone audio will be analyzed for voice activity.'
                        : 'Microphone monitoring is not required.'}
                    </p>
                    <p className="flex gap-2">
                      <AlertTriangle
                        className="shrink-0 text-amber-600"
                        size={18}
                      />
                      Tab switching, fullscreen exits, prohibited apps, and
                      other configured cheating signals may be recorded.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      By checking this, I understand that this assessment is
                      monitored and I agree to enter the exam room.
                    </span>
                  </label>
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      onClick={() => setPreview(undefined)}
                    >
                      Back
                    </Button>
                    <Button
                      icon={ShieldCheck}
                      disabled={!consent}
                      onClick={() => void enterExam()}
                    >
                      Enter Exam Room
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </DashboardLayout>
    );
  return (
    <DashboardLayout role="student" pageTitle="Exam">
      <div className="fixed inset-0 z-50 overflow-auto bg-gradient-to-br from-slate-50 via-violet-50 to-cyan-50 p-4 sm:p-6">
        {activeWarning && (
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="private-warning-title"
          >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
              <AlertTriangle className="mb-3 text-amber-600" size={34} />
              <h2 id="private-warning-title" className="text-xl font-bold">
                Private message from your teacher
              </h2>
              <p className="my-4 whitespace-pre-wrap rounded-xl bg-amber-50 p-4 text-sm leading-6">
                {activeWarning.message}
              </p>
              <Button
                onClick={() => {
                  const warning = activeWarning;
                  setActiveWarning(undefined);
                  void api
                    .post(
                      `/sessions/${exam.session.id}/warnings/${warning.id}/acknowledge`
                    )
                    .catch(() =>
                      setNotice('Warning acknowledgment could not be sent.')
                    );
                }}
              >
                I understand
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded bg-amber-100 p-3">{notice}</div>
        )}
        {(locked || nativeBlocked) && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 text-xl text-white">
            {nativeBlocked
              ? 'Close prohibited applications to continue.'
              : 'Exam locked by teacher.'}
          </div>
        )}
        {exam && !submitted && (screenShareLost || multipleDisplays) && (
          <div className="fixed inset-0 z-[65] grid place-items-center bg-black/85 p-6 text-center text-white">
            <div className="max-w-md">
              <MonitorOff className="mx-auto mb-3" size={38} />
              <h2 className="text-xl font-bold">
                {screenShareLost
                  ? cameraOnly
                    ? 'Camera is required'
                    : 'Screen sharing is required'
                  : 'Disconnect extra displays'}
              </h2>
              <p className="my-3 text-sm text-white/80">
                {screenShareLost
                  ? cameraOnly
                    ? 'On phones and tablets your camera is used for monitoring. It is not active and your teacher has been notified. Turn your camera on to continue.'
                    : 'Your screen is not being shared and your teacher has been notified. Share your entire screen to continue.'
                  : 'More than one display is connected. Only one screen can be monitored, so disconnect or turn off the other displays to continue. This was reported to your teacher.'}
              </p>
              {screenShareLost && (
                <Button
                  onClick={async () => {
                    try {
                      await restartScreenShare.current?.();
                    } catch {
                      setNotice(
                        cameraOnly
                          ? 'Allow camera access in your browser settings to continue.'
                          : 'You must share your entire screen to continue.'
                      );
                    }
                  }}
                >
                  {cameraOnly ? 'Turn camera on' : 'Share entire screen'}
                </Button>
              )}
            </div>
          </div>
        )}
        {fullscreenLost && !submitted && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-6 text-center text-white">
            <div>
              <Monitor className="mx-auto mb-3" size={38} />
              <h2 className="text-xl font-bold">Fullscreen is required</h2>
              <p className="my-3 text-sm text-white/80">
                Your fullscreen exit was recorded. Re-enter fullscreen to
                continue.
              </p>
              <Button
                onClick={async () => {
                  try {
                    await document.documentElement.requestFullscreen();
                    setFullscreenLost(false);
                  } catch {
                    setNotice('Fullscreen permission is required to continue.');
                  }
                }}
              >
                Return to fullscreen
              </Button>
            </div>
          </div>
        )}
        {submitted ? (
          <div className="grid min-h-full place-items-center text-center">
            <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-8 shadow-2xl backdrop-blur sm:p-10">
              <div className="absolute -right-16 -top-16 h-44 w-44 animate-pulse rounded-full bg-violet-300/40 blur-3xl" />
              <div className="absolute -bottom-20 -left-16 h-48 w-48 animate-pulse rounded-full bg-cyan-300/40 blur-3xl" />
              <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-lg">
                {submissionReason === 'timeout' ? (
                  <Clock3 size={38} />
                ) : (
                  <Trophy size={38} />
                )}
              </div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-700">
                <Sparkles size={14} /> Assessment complete
              </div>
              <h1 className="mt-3 text-3xl font-black text-slate-900">
                {submissionReason === 'timeout'
                  ? 'Time is up'
                  : 'Great work - submitted!'}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {submissionReason === 'timeout'
                  ? 'Your latest saved answers were submitted automatically when the timer reached zero.'
                  : 'Your responses are safely recorded. You may now leave the exam room.'}
              </p>
              {score?.gradeStatus === 'TEACHER_CONFIRMED' &&
                score.maxScore > 0 && (
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-6 text-emerald-900">
                    <div className="text-sm font-semibold">Automatic score</div>
                    <div className="mt-1 text-4xl font-black">
                      {score.totalScore} / {score.maxScore}
                    </div>
                    <div className="mt-2 text-sm text-emerald-700">
                      {Math.round(
                        ((score.totalScore ?? 0) / score.maxScore) * 100
                      )}
                      % of the available points
                    </div>
                  </div>
                )}
              {score?.gradeStatus !== 'TEACHER_CONFIRMED' && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  Your objective responses are saved. A teacher will review
                  written answers before your final score is released.
                </div>
              )}
              <Button
                className="mt-7"
                onClick={() => {
                  setExam(undefined);
                  setSubmitted(false);
                  setScore(undefined);
                  setAnswers({});
                  setQuestionIndex(0);
                }}
              >
                Return to My Subjects
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-20 mx-auto mb-4 max-w-5xl rounded-2xl border border-white/80 bg-white/90 p-3 shadow-lg backdrop-blur sm:mb-5 sm:p-5">
              <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
                    ProctorX secure exam room{cameraOnly ? ' · mobile' : ''}
                  </div>
                  <h1 className="line-clamp-2 text-base font-black text-slate-900 sm:text-xl">
                    {exam.exam.title}
                  </h1>
                  {exam.exam.instructions && (
                    <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-slate-600 sm:line-clamp-none sm:text-sm">
                      {exam.exam.instructions}
                    </p>
                  )}
                </div>
                <div
                  className={`shrink-0 rounded-2xl px-3 py-2 text-center sm:min-w-44 sm:px-5 sm:py-3 text-white shadow-lg ${remainingSeconds <= 60 ? 'animate-pulse bg-gradient-to-r from-rose-600 to-red-500' : remainingSeconds <= 300 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}
                >
                  <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
                    <Clock3 size={14} />
                    <span className="hidden sm:inline">Time remaining</span>
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black tabular-nums sm:mt-1 sm:text-2xl">
                    {formatCountdown(remainingSeconds)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs">
                <span className="font-semibold text-slate-600">
                  {
                    exam.exam.questions.filter((question: any) =>
                      hasAnswer(question, answers[question.id])
                    ).length
                  }{' '}
                  of {exam.exam.questions.length} answered
                </span>
                <span
                  className={
                    saveState === 'error'
                      ? 'font-semibold text-red-600'
                      : 'font-semibold text-emerald-600'
                  }
                >
                  {saveState === 'saving'
                    ? 'Saving answers?'
                    : saveState === 'error'
                      ? 'Autosave interrupted?reconnecting?'
                      : 'All answers saved'}
                </span>
              </div>
            </div>
            {exam.exam.sourceType === 'GOOGLE_FORMS_IMPORT' &&
            exam.exam.externalFormUrl ? (
              <div className="mx-auto max-w-5xl">
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <iframe
                    title={exam.exam.title}
                    src={exam.exam.externalFormUrl}
                    className="h-[calc(100dvh-190px)] min-h-[480px] w-full"
                    sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <a
                    className="text-sm font-semibold text-brand underline"
                    href={exam.exam.externalFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open form in a new tab if it does not load
                  </a>
                  <Button onClick={() => void submit()}>
                    I submitted the Google Form
                  </Button>
                </div>
                <p className="mt-2 text-xs text-text-2">
                  Submit inside Google Forms first, then use the button above to
                  complete your monitored ProctorX session.
                </p>
              </div>
            ) : (
              <>
                <fieldset
                  disabled={locked || nativeBlocked}
                  className="mx-auto max-w-5xl space-y-5"
                >
                  {exam.exam.questions
                    .slice(
                      questionIndex * QUESTIONS_PER_PAGE,
                      (questionIndex + 1) * QUESTIONS_PER_PAGE
                    )
                    .map((question: any, pageOffset: number) => (
                      <div
                        key={question.id}
                        className={`group overflow-hidden rounded-2xl border bg-white/95 p-5 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl sm:p-6 ${
                          hasAnswer(question, answers[question.id])
                            ? 'border-emerald-300 ring-1 ring-emerald-100'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-5">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-black text-white shadow-md">
                            {questionIndex * QUESTIONS_PER_PAGE +
                              pageOffset +
                              1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">
                                {question.type.replaceAll('_', ' ')}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {question.points}{' '}
                                {question.points === 1 ? 'point' : 'points'}
                              </span>
                              {question.isRequired && (
                                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">
                                  Required
                                </span>
                              )}
                            </div>
                            <h2 className="text-base font-bold leading-7 text-slate-900 sm:text-lg">
                              {question.prompt}
                            </h2>
                          </div>
                        </div>
                        {question.options?.map(
                          (option: any, optionIndex: number) => (
                            <label
                              key={option.id}
                              className={`mb-3 flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-all sm:text-base ${
                                answers[question.id]?.selectedOptionIds?.[0] ===
                                option.id
                                  ? 'border-violet-500 bg-violet-50 text-violet-950 shadow-sm ring-2 ring-violet-100'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/50'
                              }`}
                            >
                              <input
                                type="radio"
                                className="sr-only"
                                checked={
                                  answers[question.id]
                                    ?.selectedOptionIds?.[0] === option.id
                                }
                                onChange={() =>
                                  setAnswers((current) => ({
                                    ...current,
                                    [question.id]: {
                                      selectedOptionIds: [option.id],
                                    },
                                  }))
                                }
                                name={question.id}
                              />
                              <span
                                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${answers[question.id]?.selectedOptionIds?.[0] === option.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                              >
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span className="flex-1">{option.label}</span>
                              <span
                                className={`h-5 w-5 rounded-full border-2 p-1 ${answers[question.id]?.selectedOptionIds?.[0] === option.id ? 'border-violet-600' : 'border-slate-300'}`}
                              >
                                {answers[question.id]
                                  ?.selectedOptionIds?.[0] === option.id && (
                                  <span className="block h-full w-full rounded-full bg-violet-600" />
                                )}
                              </span>
                            </label>
                          )
                        )}
                        {question.type === 'ENUMERATION' && (
                          <div className="space-y-3">
                            {enumerationEntries(
                              question,
                              answers[question.id]
                            ).map((value, entryIndex, entries) => (
                              <div
                                key={entryIndex}
                                className="flex items-center gap-2"
                              >
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-100 text-sm font-bold text-cyan-800">
                                  {entryIndex + 1}
                                </span>
                                <input
                                  value={value}
                                  onChange={(event) =>
                                    setAnswers((current) => {
                                      const next = [...entries];
                                      next[entryIndex] = event.target.value;
                                      return {
                                        ...current,
                                        [question.id]: {
                                          enumerationAnswers: next,
                                        },
                                      };
                                    })
                                  }
                                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                                  placeholder={`Answer ${entryIndex + 1}`}
                                />
                                <button
                                  type="button"
                                  aria-label={`Remove answer ${entryIndex + 1}`}
                                  disabled={entries.length === 1}
                                  onClick={() =>
                                    setAnswers((current) => ({
                                      ...current,
                                      [question.id]: {
                                        enumerationAnswers: entries.filter(
                                          (_, index) => index !== entryIndex
                                        ),
                                      },
                                    }))
                                  }
                                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  <Minus size={17} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: {
                                    enumerationAnswers: [
                                      ...enumerationEntries(
                                        question,
                                        current[question.id]
                                      ),
                                      '',
                                    ],
                                  },
                                }))
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                            >
                              <Plus size={16} /> Add another answer
                            </button>
                            <p className="text-xs text-slate-500">
                              Answer order does not matter. Each entry is
                              checked separately.
                            </p>
                          </div>
                        )}
                        {question.type === 'IDENTIFICATION' && (
                          <input
                            value={answers[question.id]?.responseText ?? ''}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: {
                                  responseText: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                            placeholder="Type your answer here..."
                          />
                        )}
                        {question.type === 'ESSAY' && (
                          <div>
                            <textarea
                              value={answers[question.id]?.responseText ?? ''}
                              onChange={(event) =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: {
                                    responseText: event.target.value,
                                  },
                                }))
                              }
                              className="min-h-48 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-base leading-7 text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                              placeholder="Develop your answer clearly and support it with relevant details..."
                            />
                            <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                              <span>Your response is saved automatically.</span>
                              <span>
                                {answers[question.id]?.responseText?.length ??
                                  0}{' '}
                                characters
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </fieldset>
                <div className="sticky bottom-4 z-10 mx-auto mt-6 flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-xl backdrop-blur">
                  <Button
                    variant="ghost"
                    icon={ChevronLeft}
                    disabled={questionIndex === 0}
                    onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}
                  >
                    Back
                  </Button>
                  <span className="text-sm text-text-2">
                    Page {questionIndex + 1} of{' '}
                    {Math.ceil(exam.exam.questions.length / QUESTIONS_PER_PAGE)}
                  </span>
                  {questionIndex <
                  Math.ceil(exam.exam.questions.length / QUESTIONS_PER_PAGE) -
                    1 ? (
                    <Button
                      icon={ChevronRight}
                      onClick={() => {
                        setNotice('');
                        setQuestionIndex((i) => i + 1);
                      }}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button onClick={() => void submit()}>
                      Submit{' '}
                      {exam.exam.assessmentType === 'QUIZ' ? 'quiz' : 'exam'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
