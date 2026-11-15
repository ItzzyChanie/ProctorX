-- Generalize student-only login sessions to every role (revocable JWTs).
-- Existing student sessions are kept; the one-session-per-student rule moves
-- from a unique index to a row lock in AuthService.issueToken.
ALTER TABLE "student_login_sessions" RENAME TO "login_sessions";
ALTER TABLE "login_sessions" RENAME CONSTRAINT "student_login_sessions_pkey" TO "login_sessions_pkey";
ALTER TABLE "login_sessions" RENAME CONSTRAINT "student_login_sessions_userId_fkey" TO "login_sessions_userId_fkey";
DROP INDEX "student_login_sessions_userId_key";
ALTER INDEX "student_login_sessions_expiresAt_idx" RENAME TO "login_sessions_expiresAt_idx";
CREATE INDEX "login_sessions_userId_idx" ON "login_sessions"("userId");
