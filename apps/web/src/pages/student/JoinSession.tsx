import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  Mic,
  Minus,
  Monitor,
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
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
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
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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
    onError: () =>
      setNotice(
        'That subject code is invalid, already enrolled, or already requested.'
      ),
  });
  const recorder = useRef<MediaRecorder | null>(null);
  const suppressIncidentRef = useRef(false);
  const endingRecordingRef = useRef(false);
  const recordingUploads = useRef<Promise<unknown>>(Promise.resolve());
  const screenStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
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
      await document.documentElement.requestFullscreen();
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
      suppressIncidentRef.current = false;
      endingRecordingRef.current = false;
      setExam(joined);
      setPreview(undefined);
      setSelectedSubject(undefined);
      setFullscreenLost(false);
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen();
      setNotice(
        'The assessment room could not be entered. Allow fullscreen and try again.'
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
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const closePeer = () => {
      peer.current?.close();
      peer.current = null;
      pendingCandidates.splice(0);
    };
    const watch = () => {
      const stream = screenStream.current;
      if (!stream) return;
      closePeer();
      const connection = new RTCPeerConnection(rtcConfig);
      peer.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      connection.onicecandidate = ({ candidate }) =>
        candidate &&
        socket.emit('webrtc:signal', {
          sessionId: id,
          signal: { candidate: candidate.toJSON() },
        });
      socket.emit('webrtc:ready', { sessionId: id });
    };
    const signal = async (incoming: Signal) => {
      const connection = peer.current;
      if (!connection) return;
      if (incoming.description) {
        await connection.setRemoteDescription(incoming.description);
        while (pendingCandidates.length)
          await connection.addIceCandidate(pendingCandidates.shift()!);
        if (incoming.description.type === 'offer') {
          await connection.setLocalDescription(await connection.createAnswer());
          socket.emit('webrtc:signal', {
            sessionId: id,
            signal: { description: connection.localDescription },
          });
        }
      } else if (incoming.candidate) {
        if (connection.remoteDescription)
          await connection.addIceCandidate(incoming.candidate);
        else pendingCandidates.push(incoming.candidate);
      }
    };
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
    const warn = (message: { message: string }) => setNotice(message.message);
    const lock = (message: { locked: boolean }) => setLocked(message.locked);
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
      socket.emit('student:join', { sessionId: id, examId });
    socket.on('connect', joinStudentRoom);
    socket.on('student:warn', warn);
    socket.on('student:lock', lock);
    socket.on('student:exam-ended', examEnded);
    socket.on('webrtc:request', watch);
    socket.on('webrtc:signal', signal);
    socket.on('webrtc:stop', closePeer);
    socket.connect();
    if (socket.connected) joinStudentRoom();
    void (async () => {
      try {
        // React Strict Mode immediately cleans up its first development-only
        // effect pass. Yield once so that pass cannot open a second picker.
        await Promise.resolve();
        if (!active) return;
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen();
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
        const displaySurface = screen
          .getVideoTracks()[0]
          ?.getSettings().displaySurface;
        if (displaySurface !== 'monitor') {
          screen.getTracks().forEach((track) => track.stop());
          throw new Error('The entire screen must be shared.');
        }
        if (!active) {
          screen.getTracks().forEach((track) => track.stop());
          return;
        }
        screenStream.current = screen;
        await screen
          .getVideoTracks()[0]
          ?.applyConstraints({ frameRate: { ideal: 15, max: 20 } })
          .catch(() => undefined);
        // A teacher can request the stream while the screen-picker is open.
        // Start signaling now that capture is actually available.
        watch();
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
                  sessionId: id,
                  frame: await blob.arrayBuffer(),
                  mimeType: blob.type,
                });
              } finally {
                frameEncoding = false;
              }
            },
            'image/webp',
            0.45
          );
        };
        sendScreenFrame();
        // WebRTC is the primary live feed. This low-rate image is only a resilient
        // fallback when peer-to-peer video is unavailable.
        timers.current.push(window.setInterval(sendScreenFrame, 500));
        const preferredMimeType = [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp8',
          'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type));
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
          form.append('clip', segment.blob, `${phase.toLowerCase()}.webm`);
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
          if (!active || screen.getVideoTracks()[0]?.readyState !== 'live') return;
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
              blob: new Blob(chunks, { type: 'video/webm' }),
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
            setNotice('The incident was recorded, but its evidence clip could not be linked.');
            return;
          }
          const occurredAtMs = +new Date(response.data.occurredAt);
          const incidentIndex = completedSegments.findIndex(
            (segment) =>
              +segment.startedAt <= occurredAtMs && occurredAtMs <= +segment.endedAt
          );
          if (incidentIndex >= 0) {
            const incident = completedSegments[incidentIndex];
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
        screen.getVideoTracks()[0]?.addEventListener(
          'ended',
          () => {
            if (active)
              setNotice(
                'Screen sharing stopped, so screen recording has also stopped.'
              );
          },
          { once: true }
        );
        if (exam.exam.requireCamera) {
          cameraStream.current = await navigator.mediaDevices.getUserMedia({
            video: { frameRate: { ideal: 15, max: 20 } },
            audio: false,
          });
          const video = document.createElement('video');
          video.srcObject = cameraStream.current;
          video.muted = true;
          await video.play().catch((error: DOMException) => {
            if (error.name !== 'AbortError') throw error;
          });
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
          timers.current.push(window.setInterval(sample, 3000));
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
            const samples = pcm.splice(0),
              rate = context.sampleRate;
            if (!samples.length || ![8000, 16000, 32000, 48000].includes(rate))
              return;
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
          timers.current.push(window.setInterval(sample, 4000));
        }
      } catch {
        if (active)
          setNotice(
            'Required screen, camera, or microphone permission was not granted.'
          );
      }
    })();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      socket.off('connect', joinStudentRoom);
      socket.off('student:warn', warn);
      socket.off('student:lock', lock);
      socket.off('student:exam-ended', examEnded);
      socket.off('webrtc:request', watch);
      socket.off('webrtc:signal', signal);
      socket.off('webrtc:stop', closePeer);
      timers.current.forEach(window.clearInterval);
      timers.current = [];
      audioContext.current?.close();
      closePeer();
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      [
        screenStream.current,
        cameraStream.current,
        microphoneStream.current,
      ].forEach((stream) =>
        stream?.getTracks().forEach((track) => track.stop())
      );
      socket.disconnect();
    };
  }, [exam, submitted]);

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
        // A temporary disconnect intentionally pauses the persisted timer.
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
    } catch {
      setNotice('Your answers could not be submitted. Please try again.');
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
              {joinRequests.data.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="flex justify-between py-2 text-sm"
                >
                  <span>{request.subject.name}</span>
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
                    <p className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-violet-900">
                      <Clock3 className="shrink-0 text-violet-600" size={18} />
                      <span>
                        A {preview.durationMinutes}-minute timer appears inside
                        the room and begins only after you enter fullscreen.
                        Fullscreen exits and tab switches do not pause it. Your
                        saved time resumes after an accidental shutdown, but the
                        scheduled closing time remains the final deadline.
                      </span>
                    </p>
                    <p className="flex gap-2">
                      <Monitor className="shrink-0 text-brand" size={18} />
                      This assessment is monitored and will enter fullscreen
                      automatically. Leaving fullscreen blocks the exam and is
                      recorded.
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
        {notice && (
          <div className="mb-4 rounded bg-amber-100 p-3">{notice}</div>
        )}
        {(locked || nativeBlocked) && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 text-xl text-white">
            {nativeBlocked ? 'Close prohibited applications to continue.' : 'Exam locked by teacher.'}
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
            <div className="sticky top-0 z-20 mx-auto mb-5 max-w-5xl rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg backdrop-blur sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
                    ProctorX secure exam room
                  </div>
                  <h1 className="text-xl font-black text-slate-900">
                    {exam.exam.title}
                  </h1>
                  {exam.exam.instructions && (
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      {exam.exam.instructions}
                    </p>
                  )}
                </div>
                <div
                  className={`min-w-44 rounded-2xl px-5 py-3 text-center text-white shadow-lg ${remainingSeconds <= 60 ? 'animate-pulse bg-gradient-to-r from-rose-600 to-red-500' : remainingSeconds <= 300 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}
                >
                  <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
                    <Clock3 size={14} /> Time remaining
                  </div>
                  <div className="mt-1 font-mono text-2xl font-black tabular-nums">
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
                    className="h-[calc(100vh-190px)] min-h-[600px] w-full"
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
