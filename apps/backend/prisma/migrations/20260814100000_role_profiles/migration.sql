-- Move role-specific attributes out of the shared authentication table.
CREATE TABLE "dean_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "college" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dean_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teacher_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT,
    "yearLevel" TEXT,
    "program" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dean_profiles_userId_key" ON "dean_profiles"("userId");
CREATE UNIQUE INDEX "dean_profiles_employeeId_key" ON "dean_profiles"("employeeId");
CREATE UNIQUE INDEX "teacher_profiles_userId_key" ON "teacher_profiles"("userId");
CREATE UNIQUE INDEX "teacher_profiles_employeeId_key" ON "teacher_profiles"("employeeId");
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");
CREATE UNIQUE INDEX "student_profiles_studentId_key" ON "student_profiles"("studentId");

ALTER TABLE "dean_profiles" ADD CONSTRAINT "dean_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reuse the existing user UUID as the profile primary key, so no database UUID extension is required.
INSERT INTO "dean_profiles" ("id", "userId", "employeeId", "createdAt", "updatedAt")
SELECT "id", "id", "employeeId", "createdAt", "updatedAt"
FROM "users" WHERE "role" = 'DEAN';

INSERT INTO "teacher_profiles" ("id", "userId", "employeeId", "createdAt", "updatedAt")
SELECT "id", "id", "employeeId", "createdAt", "updatedAt"
FROM "users" WHERE "role" = 'TEACHER';

INSERT INTO "student_profiles" ("id", "userId", "studentId", "yearLevel", "program", "createdAt", "updatedAt")
SELECT "id", "id", "studentId", "yearLevel", "program", "createdAt", "updatedAt"
FROM "users" WHERE "role" = 'STUDENT';

DROP INDEX "users_studentId_key";
DROP INDEX "users_employeeId_key";
ALTER TABLE "users"
  DROP COLUMN "studentId",
  DROP COLUMN "yearLevel",
  DROP COLUMN "program",
  DROP COLUMN "employeeId";
