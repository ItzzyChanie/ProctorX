CREATE TABLE "student_sections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "yearLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_sections_program_yearLevel_name_key"
ON "student_sections"("program", "yearLevel", "name");
CREATE INDEX "student_sections_program_yearLevel_idx"
ON "student_sections"("program", "yearLevel");

ALTER TABLE "student_profiles" ADD COLUMN "sectionId" TEXT;

INSERT INTO "student_sections" ("id", "name", "program", "yearLevel") VALUES
('00000000-0000-4000-8000-00000000004a', '4A', 'CS', '4'),
('00000000-0000-4000-8000-00000000004b', '4B', 'CS', '4'),
('00000000-0000-4000-8000-00000000004c', '4C', 'CS', '4');

UPDATE "student_profiles"
SET "program" = 'CS', "yearLevel" = '4', "sectionId" = '00000000-0000-4000-8000-00000000004b'
WHERE "program" IN ('CS', 'BSCS', 'Computer Science')
  AND "yearLevel" IN ('4', 'YEAR_4');

ALTER TABLE "student_profiles"
ADD CONSTRAINT "student_profiles_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "student_sections"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "student_profiles_sectionId_idx" ON "student_profiles"("sectionId");
ALTER TABLE "student_profiles" DROP COLUMN "section";
