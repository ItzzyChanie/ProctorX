ALTER TABLE "users" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "student_sections" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "academic_periods" ADD COLUMN "institutionId" TEXT;

-- Preserve all legacy records under the original (oldest) Dean.
WITH original_dean AS (
  SELECT "id" FROM "users" WHERE "role" = 'DEAN' ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "users" SET "institutionId" = (SELECT "id" FROM original_dean)
WHERE "institutionId" IS NULL;

WITH original_dean AS (
  SELECT "id" FROM "users" WHERE "role" = 'DEAN' ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "student_sections" SET "institutionId" = (SELECT "id" FROM original_dean)
WHERE "institutionId" IS NULL;

WITH original_dean AS (
  SELECT "id" FROM "users" WHERE "role" = 'DEAN' ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "academic_periods" SET "institutionId" = (SELECT "id" FROM original_dean)
WHERE "institutionId" IS NULL;

-- Every Dean created through verified institutional registration owns a
-- separate institution, including registrations completed before this migration.
UPDATE "users" AS u SET "institutionId" = u."id"
FROM "institution_registrations" AS r
WHERE u."email" = r."email" AND u."role" = 'DEAN' AND r."status" = 'APPROVED';

DROP INDEX IF EXISTS "student_sections_program_yearLevel_name_key";
DROP INDEX IF EXISTS "academic_periods_academicYear_semester_key";
CREATE INDEX "users_institutionId_role_idx" ON "users"("institutionId", "role");
CREATE INDEX "student_sections_institutionId_idx" ON "student_sections"("institutionId");
CREATE UNIQUE INDEX "student_sections_institutionId_program_yearLevel_name_key" ON "student_sections"("institutionId", "program", "yearLevel", "name");
CREATE INDEX "academic_periods_institutionId_idx" ON "academic_periods"("institutionId");
CREATE UNIQUE INDEX "academic_periods_institutionId_academicYear_semester_key" ON "academic_periods"("institutionId", "academicYear", "semester");
