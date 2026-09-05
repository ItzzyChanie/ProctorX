-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "generated_reports" ADD COLUMN "staleAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "exams"
ADD COLUMN "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "randomizeOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "versionGroupId" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "exams"
SET "versionGroupId" = "id",
    "publishedAt" = CASE WHEN "status" = 'PUBLISHED' THEN "createdAt" ELSE NULL END;

ALTER TABLE "exams" ALTER COLUMN "versionGroupId" SET NOT NULL;

-- AlterTable
ALTER TABLE "exam_sessions"
ADD COLUMN "extraTimeSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "questionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "optionOrder" JSONB,
ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resumeAuthorizedAt" TIMESTAMP(3),
ADD COLUMN "integrityArchivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "exam_student_overrides" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "extraTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_student_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "correctAnswer" JSONB,
    "rubric" TEXT,
    "options" JSONB,
    "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "source" "ExamSourceType" NOT NULL DEFAULT 'MANUAL',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctor_reviews" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "previousDecision" "ProctorReviewDecision" NOT NULL,
    "decision" "ProctorReviewDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proctor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctor_warnings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    CONSTRAINT "proctor_warnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exams_versionGroupId_version_key" ON "exams"("versionGroupId", "version");
CREATE UNIQUE INDEX "exam_student_overrides_examId_studentId_key" ON "exam_student_overrides"("examId", "studentId");
CREATE INDEX "exam_student_overrides_studentId_idx" ON "exam_student_overrides"("studentId");
CREATE INDEX "question_bank_items_teacherId_archivedAt_idx" ON "question_bank_items"("teacherId", "archivedAt");
CREATE INDEX "question_bank_items_subjectId_idx" ON "question_bank_items"("subjectId");
CREATE INDEX "proctor_reviews_sessionId_createdAt_idx" ON "proctor_reviews"("sessionId", "createdAt");
CREATE INDEX "proctor_warnings_sessionId_sentAt_idx" ON "proctor_warnings"("sessionId", "sentAt");

-- AddForeignKey
ALTER TABLE "exam_student_overrides" ADD CONSTRAINT "exam_student_overrides_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_student_overrides" ADD CONSTRAINT "exam_student_overrides_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proctor_reviews" ADD CONSTRAINT "proctor_reviews_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_reviews" ADD CONSTRAINT "proctor_reviews_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proctor_warnings" ADD CONSTRAINT "proctor_warnings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proctor_warnings" ADD CONSTRAINT "proctor_warnings_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
