-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INBOUND', 'OUTBOUND', 'DELIVERY', 'COLLECTION', 'FIRST_WEIGH', 'SECOND_WEIGH', 'GROSS_ONLY', 'TARE_ONLY', 'INTERNAL_TRANSFER');

-- CreateEnum
CREATE TYPE "RfidCredentialType" AS ENUM ('DRIVER', 'TRUCK');

-- CreateEnum
CREATE TYPE "RfidCredentialStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOST', 'STOLEN', 'EXPIRED', 'REPLACED', 'BLOCKED');

-- AlterEnum
ALTER TYPE "HardwareDeviceType" ADD VALUE 'PRINTER';

-- AlterTable
ALTER TABLE "weighbridge_orders" ADD COLUMN     "destination_id" UUID,
ADD COLUMN     "product_id" UUID,
ADD COLUMN     "source_id" UUID;

-- AlterTable
ALTER TABLE "weighbridge_transactions" ADD COLUMN     "gross_captured_at" TIMESTAMP(3),
ADD COLUMN     "mine_ticket_mass" INTEGER,
ADD COLUMN     "mine_ticket_number" TEXT,
ADD COLUMN     "tare_captured_at" TIMESTAMP(3),
ADD COLUMN     "transaction_type" "TransactionType";

-- CreateTable
CREATE TABLE "mining_company_transporters" (
    "id" UUID NOT NULL,
    "mining_company_id" UUID NOT NULL,
    "transporter_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mining_company_transporters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "category" TEXT,
    "unit_of_measure" TEXT DEFAULT 'TONNE',
    "minimum_allowed_weight" INTEGER,
    "maximum_allowed_weight" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfid_credentials" (
    "id" UUID NOT NULL,
    "uid" TEXT NOT NULL,
    "display_code" TEXT,
    "credential_type" "RfidCredentialType" NOT NULL,
    "organisation_id" UUID NOT NULL,
    "site_id" UUID,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "status" "RfidCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "replacement_reason" TEXT,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfid_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighbridge_installations" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "topology" "WeighbridgeTopology" NOT NULL DEFAULT 'BIDIRECTIONAL_SINGLE',
    "max_capacity_kg" INTEGER NOT NULL,
    "weight_unit" TEXT NOT NULL DEFAULT 'kg',
    "lane_count" INTEGER NOT NULL DEFAULT 1,
    "entry_exit_config" TEXT,
    "installation_date" DATE,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weighbridge_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_rosters" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "trailer1_id" UUID,
    "trailer2_id" UUID,
    "driver_id" UUID NOT NULL,
    "roster_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mining_company_transporters_mining_company_id_transporter_i_key" ON "mining_company_transporters"("mining_company_id", "transporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_organisation_id_code_key" ON "sources"("organisation_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "destinations_organisation_id_code_key" ON "destinations"("organisation_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "products_organisation_id_code_key" ON "products"("organisation_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_credentials_uid_key" ON "rfid_credentials"("uid");

-- CreateIndex
CREATE INDEX "rfid_credentials_uid_status_idx" ON "rfid_credentials"("uid", "status");

-- CreateIndex
CREATE INDEX "rfid_credentials_organisation_id_credential_type_idx" ON "rfid_credentials"("organisation_id", "credential_type");

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_installations_site_id_key" ON "weighbridge_installations"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_installations_code_key" ON "weighbridge_installations"("code");

-- CreateIndex
CREATE INDEX "weighbridge_installations_organisation_id_idx" ON "weighbridge_installations"("organisation_id");

-- CreateIndex
CREATE INDEX "fleet_rosters_organisation_id_roster_date_idx" ON "fleet_rosters"("organisation_id", "roster_date");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_rosters_vehicle_id_roster_date_key" ON "fleet_rosters"("vehicle_id", "roster_date");

-- AddForeignKey
ALTER TABLE "mining_company_transporters" ADD CONSTRAINT "mining_company_transporters_mining_company_id_fkey" FOREIGN KEY ("mining_company_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mining_company_transporters" ADD CONSTRAINT "mining_company_transporters_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_credentials" ADD CONSTRAINT "rfid_credentials_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "rfid_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_installations" ADD CONSTRAINT "weighbridge_installations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_installations" ADD CONSTRAINT "weighbridge_installations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_rosters" ADD CONSTRAINT "fleet_rosters_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_rosters" ADD CONSTRAINT "fleet_rosters_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_rosters" ADD CONSTRAINT "fleet_rosters_trailer1_id_fkey" FOREIGN KEY ("trailer1_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_rosters" ADD CONSTRAINT "fleet_rosters_trailer2_id_fkey" FOREIGN KEY ("trailer2_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_rosters" ADD CONSTRAINT "fleet_rosters_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
