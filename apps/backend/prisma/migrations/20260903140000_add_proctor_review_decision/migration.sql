CREATE TYPE "ProctorReviewDecision" AS ENUM ('PENDING', 'NEGATIVE', 'POSITIVE');

ALTER TABLE "exam_sessions"
ADD COLUMN "proctorReviewDecision" "ProctorReviewDecision" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "proctorReviewedAt" TIMESTAMP(3),
ADD COLUMN "proctorReviewedById" TEXT;

CREATE INDEX "exam_sessions_proctorReviewDecision_idx"
ON "exam_sessions"("proctorReviewDecision");