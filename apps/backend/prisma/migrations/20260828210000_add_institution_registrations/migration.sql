CREATE TYPE "InstitutionRegistrationStatus" AS ENUM (
  'EMAIL_VERIFICATION_PENDING',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "institution_registrations" (
  "id" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "institutionName" TEXT NOT NULL,
  "collegeDepartmentName" TEXT NOT NULL,
  "schoolType" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "employeeId" TEXT,
  "officialTitle" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "internalRole" TEXT NOT NULL DEFAULT 'INSTITUTION_ADMINISTRATOR',
  "status" "InstitutionRegistrationStatus" NOT NULL DEFAULT 'EMAIL_VERIFICATION_PENDING',
  "authorityConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
  "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
  "verificationCodeHash" TEXT,
  "verificationExpiresAt" TIMESTAMP(3),
  "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  "emailVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "institution_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institution_registrations_referenceNumber_key" ON "institution_registrations"("referenceNumber");
CREATE UNIQUE INDEX "institution_registrations_email_key" ON "institution_registrations"("email");
CREATE INDEX "institution_registrations_status_createdAt_idx" ON "institution_registrations"("status", "createdAt");
