-- CreateEnum
CREATE TYPE "ServiceOrderCategory" AS ENUM ('HARDWARE', 'SOFTWARE', 'NETWORK', 'ANPR', 'SCALE', 'GATE', 'PRINTER', 'REPORTING', 'USER_ACCESS', 'CALIBRATION', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceOrderSource" AS ENUM ('PLATFORM_ADMIN', 'CLIENT_USER', 'AUTOMATED_ALERT');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "site_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ServiceOrderCategory" NOT NULL,
    "priority" "ServiceOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "source" "ServiceOrderSource" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "device_id" UUID,
    "transaction_id" UUID,
    "incident_id" UUID,
    "due_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_comments" (
    "id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_order_number_key" ON "service_orders"("order_number");

-- CreateIndex
CREATE INDEX "service_orders_organisation_id_status_created_at_idx" ON "service_orders"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "service_orders_assigned_to_id_status_idx" ON "service_orders"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "service_order_comments_service_order_id_created_at_idx" ON "service_order_comments"("service_order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_code_key" ON "organisations"("code");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_comments" ADD CONSTRAINT "service_order_comments_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_comments" ADD CONSTRAINT "service_order_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

