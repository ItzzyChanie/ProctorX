-- Notes (not violations) recorded when a required camera or microphone is
-- missing or broken on the student's device.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CAMERA_UNAVAILABLE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MICROPHONE_UNAVAILABLE';

-- Webcam evidence parts, merged beside the screen into the centered clip.
ALTER TYPE "EvidenceClipPhase" ADD VALUE IF NOT EXISTS 'CAMERA_PREVIOUS';
ALTER TYPE "EvidenceClipPhase" ADD VALUE IF NOT EXISTS 'CAMERA_INCIDENT';
ALTER TYPE "EvidenceClipPhase" ADD VALUE IF NOT EXISTS 'CAMERA_FOLLOWING';
