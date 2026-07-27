-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('MINE', 'WEIGHBRIDGE', 'DEPOT', 'CUSTOMER_SITE');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DISPATCH', 'RECEIPT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FULFILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "IncidentType" ADD VALUE 'UNDERWEIGHT_EMPTY';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "order_id" UUID;

-- AlterTable
ALTER TABLE "site_configs" ADD COLUMN     "empty_vehicle_max_kg" INTEGER NOT NULL DEFAULT 18500,
ADD COLUMN     "loaded_vehicle_max_kg" INTEGER NOT NULL DEFAULT 70000;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "type" "SiteType" NOT NULL DEFAULT 'MINE';

-- AlterTable
ALTER TABLE "weighbridge_transactions" ADD COLUMN     "driver_decision" TEXT,
ADD COLUMN     "overweight_loaded_flag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "underweight_empty_flag" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "weighbridge_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "site_id" UUID NOT NULL,
    "origin_site_id" UUID,
    "destination_site_id" UUID,
    "customer_name" TEXT,
    "supplier_name" TEXT,
    "product" TEXT NOT NULL,
    "estimated_mass_kg" INTEGER NOT NULL,
    "stockpile" TEXT,
    "variance_threshold_percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "variance_threshold_kg" INTEGER,
    "rate_per_ton_zar" DECIMAL(10,2),
    "notes" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weighbridge_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_orders_order_number_key" ON "weighbridge_orders"("order_number");

-- CreateIndex
CREATE INDEX "weighbridge_orders_status_type_idx" ON "weighbridge_orders"("status", "type");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "weighbridge_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_origin_site_id_fkey" FOREIGN KEY ("origin_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_destination_site_id_fkey" FOREIGN KEY ("destination_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_orders" ADD CONSTRAINT "weighbridge_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
