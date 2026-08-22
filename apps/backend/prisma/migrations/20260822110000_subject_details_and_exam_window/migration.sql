ALTER TABLE "subjects" ADD COLUMN "subjectCode" TEXT;
ALTER TABLE "subjects" ADD COLUMN "schedule" TEXT;
CREATE UNIQUE INDEX "subjects_teacherId_subjectCode_key" ON "subjects"("teacherId", "subjectCode");

ALTER TABLE "exams" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "exams" ADD COLUMN "sourceType" "ExamSourceType" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "exams" ADD COLUMN "externalFormUrl" TEXT;
