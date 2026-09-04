ALTER TABLE "exam_sessions"
ADD COLUMN "studentActivityArchivedAt" TIMESTAMP(3);

CREATE INDEX "exam_sessions_studentId_studentActivityArchivedAt_idx"
ON "exam_sessions"("studentId", "studentActivityArchivedAt");