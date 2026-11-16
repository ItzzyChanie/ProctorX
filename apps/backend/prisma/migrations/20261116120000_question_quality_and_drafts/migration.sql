-- New question types: checkboxes (select all that apply) and fill in the blank.
ALTER TYPE "QuestionType" ADD VALUE 'MULTIPLE_RESPONSE';
ALTER TYPE "QuestionType" ADD VALUE 'FILL_IN_THE_BLANK';

-- Per-question difficulty, AI source citation and scoring options.
ALTER TABLE "questions"
  ADD COLUMN "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "allowTypos" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "partialCredit" BOOLEAN NOT NULL DEFAULT true;

-- Existing questions keep their original all-or-nothing scoring so exams
-- already in use are graded the same way for every student.
UPDATE "questions" SET "partialCredit" = false;

-- AI difficulty review report and the source text it checks against.
ALTER TABLE "exams"
  ADD COLUMN "aiReview" JSONB,
  ADD COLUMN "aiReviewedAt" TIMESTAMP(3),
  ADD COLUMN "sourceText" TEXT;
