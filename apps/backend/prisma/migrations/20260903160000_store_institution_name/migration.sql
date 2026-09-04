ALTER TABLE "dean_profiles" ADD COLUMN "institutionName" TEXT;

UPDATE "dean_profiles" AS profile
SET "institutionName" = registration."institutionName"
FROM "users" AS account
JOIN "institution_registrations" AS registration
  ON registration."email" = account."email"
WHERE profile."userId" = account."id";
