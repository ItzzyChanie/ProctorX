-- CreateTable
CREATE TABLE "raise_hand_requests" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "raise_hand_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raise_hand_requests_sessionId_resolvedAt_idx" ON "raise_hand_requests"("sessionId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "raise_hand_requests" ADD CONSTRAINT "raise_hand_requests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
