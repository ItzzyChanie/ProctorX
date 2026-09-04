ALTER TABLE "subject_join_requests"
ADD COLUMN "studentHiddenAt" TIMESTAMP(3);

CREATE INDEX "subject_join_requests_studentId_studentHiddenAt_idx"
ON "subject_join_requests"("studentId", "studentHiddenAt");