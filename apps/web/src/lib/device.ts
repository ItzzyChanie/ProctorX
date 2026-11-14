/**
 * Browser capability checks for the proctored exam room.
 *
 * Phone and tablet browsers (Android Chrome, iOS/iPadOS Safari) cannot share
 * the whole screen, and iPhone Safari cannot enter element fullscreen. On those
 * devices the exam runs in "camera-only" mode: the front camera replaces the
 * screen feed for live monitoring and evidence clips, and app/tab switches are
 * still detected through the Page Visibility API.
 */

/** True when the browser can capture the entire screen (desktop browsers). */
export const canShareScreen = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
  // iPadOS reports a desktop UA and exposes getDisplayMedia, but it always
  // rejects; touch-primary devices are treated as mobile.
  !(window.matchMedia?.('(pointer: coarse)').matches && !hasFinePointer());

const hasFinePointer = () =>
  window.matchMedia?.('(any-pointer: fine)').matches ?? false;

/** True when the page can request element fullscreen (not iPhone Safari). */
export const canUseFullscreen = () =>
  typeof document !== 'undefined' &&
  Boolean(document.fullscreenEnabled) &&
  typeof document.documentElement.requestFullscreen === 'function';

/** Camera-only proctoring is used when whole-screen sharing is unavailable. */
export const isCameraOnlyDevice = () => !canShareScreen();

/** Requests fullscreen where supported; never throws on devices without it. */
export const enterFullscreenIfSupported = async () => {
  if (!canUseFullscreen() || document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
};

/** Picks a MediaRecorder container the browser supports (Safari records MP4). */
export const pickRecorderMimeType = () =>
  [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ].find(
    (type) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
  );
