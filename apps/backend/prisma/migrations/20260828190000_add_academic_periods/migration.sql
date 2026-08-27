CREATE TYPE "Semester" AS ENUM ('FIRST', 'SECOND');
CREATE TYPE "AcademicTerm" AS ENUM ('UNSPECIFIED', 'PRELIMINARY', 'MIDTERM', 'SEMI_FINAL', 'FINAL');
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "academic_periods" (
  "id" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "semester" "Semester" NOT NULL,
  "status" "AcademicPeriodStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_periods_academicYear_semester_key" ON "academic_periods"("academicYear", "semester");
CREATE INDEX "academic_periods_status_idx" ON "academic_periods"("status");

INSERT INTO "academic_periods" ("id", "academicYear", "semester", "status")
VALUES ('academic-period-2026-2027-first', '2026-2027', 'FIRST', 'ACTIVE');

ALTER TABLE "exams" ADD COLUMN "academicPeriodId" TEXT;
ALTER TABLE "exams" ADD COLUMN "term" "AcademicTerm";
UPDATE "exams" SET "academicPeriodId" = 'academic-period-2026-2027-first', "term" = 'PRELIMINARY';
ALTER TABLE "exams" ALTER COLUMN "academicPeriodId" SET NOT NULL;
ALTER TABLE "exams" ALTER COLUMN "term" SET NOT NULL;
CREATE INDEX "exams_academicPeriodId_term_idx" ON "exams"("academicPeriodId", "term");
ALTER TABLE "exams" ADD CONSTRAINT "exams_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
