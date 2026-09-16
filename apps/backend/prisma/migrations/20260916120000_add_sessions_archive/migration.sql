ALTER TABLE "exams" ADD COLUMN "sessionsArchivedAt" TIMESTAMP(3);

CREATE INDEX "exams_sessionsArchivedAt_idx" ON "exams"("sessionsArchivedAt");
