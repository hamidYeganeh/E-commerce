ALTER TABLE "Session" ADD COLUMN "authMethod" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD CONSTRAINT "Session_valid_auth_method" CHECK (
  "authMethod" IN ('CUSTOMER', 'STAFF_PASSWORD', 'STAFF_MFA')
  AND ("authMethod" <> 'STAFF_MFA' OR "mfaVerifiedAt" IS NOT NULL)
);
ALTER TABLE "TwoFactor" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TwoFactor" ADD COLUMN "failedVerificationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TwoFactor" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_nonnegative_attempts" CHECK ("failedVerificationCount" >= 0);
