ALTER TABLE "exam_sessions"
ADD COLUMN "timerStartedAt" TIMESTAMP(3),
ADD COLUMN "activeStartedAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "remainingSeconds" INTEGER;

CREATE INDEX "exam_sessions_status_lastHeartbeatAt_idx"
ON "exam_sessions"("status", "lastHeartbeatAt");
