-- CreateEnum
CREATE TYPE "VehicleAssignmentRelationship" AS ENUM ('OWNER', 'PRIMARY_CONTRACTOR', 'SUBCONTRACTOR', 'TEMPORARY_ASSIGNMENT', 'THIRD_PARTY_HAULIER');

-- CreateEnum
CREATE TYPE "VehicleAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "vehicle_transporter_assignments" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "transporter_organisation_id" UUID NOT NULL,
    "relationship_type" "VehicleAssignmentRelationship" NOT NULL DEFAULT 'SUBCONTRACTOR',
    "contract_reference" TEXT,
    "notes" TEXT,
    "status" "VehicleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_transporter_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_transporter_assignments_vehicle_id_status_idx" ON "vehicle_transporter_assignments"("vehicle_id", "status");

-- CreateIndex
CREATE INDEX "vehicle_transporter_assignments_transporter_organisation_id_idx" ON "vehicle_transporter_assignments"("transporter_organisation_id", "status");

-- AddForeignKey
ALTER TABLE "vehicle_transporter_assignments" ADD CONSTRAINT "vehicle_transporter_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transporter_assignments" ADD CONSTRAINT "vehicle_transporter_assignments_transporter_organisation_i_fkey" FOREIGN KEY ("transporter_organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_transporter_assignments" ADD CONSTRAINT "vehicle_transporter_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

