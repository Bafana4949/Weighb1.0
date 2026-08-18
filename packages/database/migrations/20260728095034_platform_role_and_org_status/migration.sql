-- CreateEnum
CREATE TYPE "ClientOrganisationStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPPORT');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "status" "ClientOrganisationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" "PlatformRole";

-- CreateIndex
CREATE INDEX "users_platform_role_idx" ON "users"("platform_role");

-- DataMigration: backfill platform_role for the existing super-admin convention
-- (role = ADMIN and organisation_id IS NULL). Idempotent, safe to re-run.
UPDATE "users" SET "platform_role" = 'PLATFORM_SUPER_ADMIN'
WHERE "role" = 'ADMIN' AND "organisation_id" IS NULL AND "platform_role" IS NULL;
