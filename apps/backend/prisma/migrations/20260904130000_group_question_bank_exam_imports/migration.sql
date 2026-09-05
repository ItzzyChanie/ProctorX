ALTER TABLE "question_bank_items"
ADD COLUMN "sourceExamId" TEXT;

CREATE INDEX "question_bank_items_sourceExamId_archivedAt_idx"
ON "question_bank_items"("sourceExamId", "archivedAt");

ALTER TABLE "question_bank_items"
ADD CONSTRAINT "question_bank_items_sourceExamId_fkey"
FOREIGN KEY ("sourceExamId") REFERENCES "exams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
