/**
 * How often each student's browser sends a camera frame and an audio sample.
 *
 * At 500 concurrent students, 3 s camera sampling meant ~167 face analyses per
 * second. 10 s keeps detection useful (a behaviour must persist for two
 * samples before it is reported) at a third of the load. Override with
 * FACE_SAMPLE_SECONDS / AUDIO_SAMPLE_SECONDS.
 */
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function seconds(name: string, fallback: number, min: number) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0
    ? clamp(Math.round(configured), min, 60)
    : fallback;
}

export function monitoringIntervals() {
  return {
    faceSampleSeconds: seconds('FACE_SAMPLE_SECONDS', 10, 3),
    audioSampleSeconds: seconds('AUDIO_SAMPLE_SECONDS', 10, 4),
  };
}
