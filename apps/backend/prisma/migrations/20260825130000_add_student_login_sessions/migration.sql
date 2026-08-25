CREATE TABLE "student_login_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_login_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_login_sessions_userId_key" ON "student_login_sessions"("userId");
CREATE INDEX "student_login_sessions_expiresAt_idx" ON "student_login_sessions"("expiresAt");
ALTER TABLE "student_login_sessions" ADD CONSTRAINT "student_login_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
