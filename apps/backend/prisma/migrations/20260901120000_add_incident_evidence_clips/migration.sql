CREATE TYPE "EvidenceClipStatus" AS ENUM ('UPLOADING', 'COMPLETE', 'FAILED');
CREATE TYPE "EvidenceClipPhase" AS ENUM ('BEFORE', 'AFTER');

CREATE TABLE "evidence_clips" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "phase" "EvidenceClipPhase" NOT NULL,
  "storagePath" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "fileSizeBytes" BIGINT NOT NULL,
  "status" "EvidenceClipStatus" NOT NULL DEFAULT 'UPLOADING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_clips_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "evidence_clips_eventId_phase_key" ON "evidence_clips"("eventId", "phase");
CREATE INDEX "evidence_clips_sessionId_startedAt_idx" ON "evidence_clips"("sessionId", "startedAt");
ALTER TABLE "evidence_clips" ADD CONSTRAINT "evidence_clips_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_clips" ADD CONSTRAINT "evidence_clips_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "proctoring_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;