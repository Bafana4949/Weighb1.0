-- CreateEnum
CREATE TYPE "WeighbridgeTopology" AS ENUM ('BIDIRECTIONAL_SINGLE', 'DUAL_ENTRY_EXIT');

-- AlterTable
ALTER TABLE "hardware_devices" ADD COLUMN     "lane_id" UUID;

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "default_currency" TEXT DEFAULT 'ZAR',
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "onboarded_at" TIMESTAMP(3),
ADD COLUMN     "onboarded_by_id" UUID,
ADD COLUMN     "physical_address" TEXT,
ADD COLUMN     "postal_address" TEXT,
ADD COLUMN     "tax_number" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'Africa/Johannesburg',
ADD COLUMN     "trading_name" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "topology" "WeighbridgeTopology" NOT NULL DEFAULT 'BIDIRECTIONAL_SINGLE';

-- CreateTable
CREATE TABLE "lanes" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "lane_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "GateDirection",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lanes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lanes_site_id_lane_number_key" ON "lanes"("site_id", "lane_number");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_tax_number_key" ON "organisations"("tax_number");

-- AddForeignKey
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_onboarded_by_id_fkey" FOREIGN KEY ("onboarded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lanes" ADD CONSTRAINT "lanes_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_devices" ADD CONSTRAINT "hardware_devices_lane_id_fkey" FOREIGN KEY ("lane_id") REFERENCES "lanes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

