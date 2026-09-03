CREATE TYPE "SubmissionMode" AS ENUM ('MANUAL', 'AUTO_TIMEOUT');

ALTER TABLE "submissions"
ADD COLUMN "mode" "SubmissionMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "submissions_deletedAt_submittedAt_idx"
ON "submissions"("deletedAt", "submittedAt");
