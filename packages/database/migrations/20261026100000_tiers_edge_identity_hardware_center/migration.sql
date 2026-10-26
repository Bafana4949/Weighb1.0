-- CreateEnum
CREATE TYPE "OperatingTier" AS ENUM ('MANUAL', 'SEMI_AUTOMATIC', 'FULLY_AUTOMATIC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HardwareDeviceType" ADD VALUE 'NFC_READER';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'QR_SCANNER';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'CCTV_CAMERA';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'CONTROLLER';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'KIOSK';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'NETWORK_DEVICE';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'UPS';
ALTER TYPE "HardwareDeviceType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "hardware_devices" ADD COLUMN     "connection_type" TEXT,
ADD COLUMN     "is_simulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_health" "HardwareHealth",
ADD COLUMN     "last_message" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3),
ADD COLUMN     "last_test_result" JSONB,
ADD COLUMN     "last_tested_at" TIMESTAMP(3),
ADD COLUMN     "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "licensed_tier" "OperatingTier" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "site_configs" ADD COLUMN     "allowed_workflows" TEXT[] DEFAULT ARRAY['DISPATCH', 'RECEIPT', 'KNOWN_TARE']::TEXT[];

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "edge_failed_sync" INTEGER,
ADD COLUMN     "edge_key_hash" TEXT,
ADD COLUMN     "edge_key_issued_at" TIMESTAMP(3),
ADD COLUMN     "edge_key_prefix" TEXT,
ADD COLUMN     "edge_last_seen_at" TIMESTAMP(3),
ADD COLUMN     "edge_mqtt_connected" BOOLEAN,
ADD COLUMN     "edge_pending_sync" INTEGER,
ADD COLUMN     "edge_simulated" BOOLEAN,
ADD COLUMN     "edge_version" TEXT,
ADD COLUMN     "feature_overrides" JSONB,
ADD COLUMN     "operating_tier" "OperatingTier" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "system_logs" ADD COLUMN     "actor_role" TEXT,
ADD COLUMN     "organisation_id" UUID,
ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "hardware_profiles" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" "OperatingTier" NOT NULL,
    "devices" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hardware_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hardware_profiles_organisation_id_name_key" ON "hardware_profiles"("organisation_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sites_edge_key_hash_key" ON "sites"("edge_key_hash");

-- CreateIndex
CREATE INDEX "system_logs_organisation_id_occurred_at_idx" ON "system_logs"("organisation_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "hardware_profiles" ADD CONSTRAINT "hardware_profiles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: attribute existing audit entries to a company so company admins can
-- see their own history (site owner first, then the acting user's company).
UPDATE "system_logs" l SET "organisation_id" = s."organisation_id"
  FROM "sites" s WHERE l."site_id" = s."id" AND l."organisation_id" IS NULL;
UPDATE "system_logs" l SET "organisation_id" = u."organisation_id"
  FROM "users" u WHERE l."user_id" = u."id" AND l."organisation_id" IS NULL AND u."organisation_id" IS NOT NULL;

-- Backfill: existing devices report from their last recorded status row.
UPDATE "hardware_devices" d SET "last_health" = h."health", "last_seen_at" = h."last_seen", "last_message" = h."message"
  FROM (SELECT DISTINCT ON ("device_id") "device_id", "health", "last_seen", "message"
          FROM "hardware_status" WHERE "device_id" IS NOT NULL
          ORDER BY "device_id", "last_seen" DESC) h
  WHERE d."id" = h."device_id";
