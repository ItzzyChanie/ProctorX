-- The old teacher_profiles.department column stored the faculty title/position.
ALTER TABLE "teacher_profiles" RENAME COLUMN "department" TO "title";

CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "teacher_profiles" ADD COLUMN "departmentId" TEXT;

CREATE UNIQUE INDEX "departments_institutionId_code_key"
  ON "departments"("institutionId", "code");
CREATE UNIQUE INDEX "departments_institutionId_name_key"
  ON "departments"("institutionId", "name");
CREATE INDEX "departments_institutionId_isActive_idx"
  ON "departments"("institutionId", "isActive");
CREATE INDEX "teacher_profiles_departmentId_idx"
  ON "teacher_profiles"("departmentId");

ALTER TABLE "teacher_profiles"
  ADD CONSTRAINT "teacher_profiles_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
