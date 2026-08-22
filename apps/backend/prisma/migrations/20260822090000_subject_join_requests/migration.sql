CREATE TYPE "AssessmentType" AS ENUM ('EXAM', 'QUIZ');
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

ALTER TABLE "exams" ADD COLUMN "assessmentType" "AssessmentType" NOT NULL DEFAULT 'EXAM';
ALTER TABLE "questions" ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "subject_join_requests" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "subject_join_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subject_join_requests_subjectId_studentId_key" ON "subject_join_requests"("subjectId", "studentId");
CREATE INDEX "subject_join_requests_subjectId_status_idx" ON "subject_join_requests"("subjectId", "status");
CREATE INDEX "subject_join_requests_studentId_status_idx" ON "subject_join_requests"("studentId", "status");
ALTER TABLE "subject_join_requests" ADD CONSTRAINT "subject_join_requests_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_join_requests" ADD CONSTRAINT "subject_join_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
