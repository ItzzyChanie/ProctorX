CREATE TABLE "subject_sections" (
  "id" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "sectionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subject_sections_subjectId_sectionId_key" ON "subject_sections"("subjectId", "sectionId");
CREATE INDEX "subject_sections_sectionId_idx" ON "subject_sections"("sectionId");
ALTER TABLE "subject_sections" ADD CONSTRAINT "subject_sections_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_sections" ADD CONSTRAINT "subject_sections_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "student_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
