-- Partial credit can award fractions of a point (e.g. 2 of 3 blanks on a
-- 2-point question = 1.33), so scores are stored as decimals. Existing whole
-- numbers are kept exactly.
ALTER TABLE "answers" ALTER COLUMN "awardedPoints" TYPE DOUBLE PRECISION;
ALTER TABLE "submissions" ALTER COLUMN "totalScore" TYPE DOUBLE PRECISION;
