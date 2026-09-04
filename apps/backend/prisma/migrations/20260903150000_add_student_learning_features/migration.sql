ALTER TABLE "exams"
ADD COLUMN "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "submissions"
ADD COLUMN "teacherFeedback" TEXT;

ALTER TABLE "notifications"
ADD COLUMN "dedupeKey" TEXT,
ADD COLUMN "link" TEXT;

CREATE UNIQUE INDEX "notifications_dedupeKey_key"
ON "notifications"("dedupeKey");