/**
 * Media helpers for the exam room: screen/camera capture, WebRTC stream
 * quality for the teacher's monitoring grid, audio processing for the voice
 * detector, and the optional Electron lockdown bridge.
 */

export type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

/** Below this RMS level (about -40 dBFS) a chunk is treated as silence. */
export const SILENCE_RMS = 0.01;

export function rms(samples: Float32Array | number[]) {
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
export function toSpeechRate(samples: number[], rate: number) {
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

export type StreamQuality = 'off' | 'thumb' | 'focus';
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

export const applyStreamQuality = async (
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

export const captureEntireScreen = async () => {
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
export const captureCameraFeed = async () => {
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

/** Present only inside the ProctorX desktop (Electron) app. */
export const desktopLockdown = (
  window as Window & { proctorX?: DesktopLockdown }
).proctorX;

export const isStreamQuality = (value: unknown): value is StreamQuality =>
  typeof value === 'string' && value in QUALITY_PRESETS;
