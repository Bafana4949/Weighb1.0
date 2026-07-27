-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_approved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_site_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_trailer_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_transporter_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "calibration_certificates" DROP CONSTRAINT "calibration_certificates_device_id_fkey";

-- DropForeignKey
ALTER TABLE "calibration_certificates" DROP CONSTRAINT "calibration_certificates_site_id_fkey";

-- DropForeignKey
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "gate_events" DROP CONSTRAINT "gate_events_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "gate_events" DROP CONSTRAINT "gate_events_site_id_fkey";

-- DropForeignKey
ALTER TABLE "gate_events" DROP CONSTRAINT "gate_events_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "gate_events" DROP CONSTRAINT "gate_events_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "hardware_devices" DROP CONSTRAINT "hardware_devices_site_id_fkey";

-- DropForeignKey
ALTER TABLE "hardware_status" DROP CONSTRAINT "hardware_status_device_id_fkey";

-- DropForeignKey
ALTER TABLE "hardware_status" DROP CONSTRAINT "hardware_status_site_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_resolved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_site_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "site_configs" DROP CONSTRAINT "site_configs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "sync_queue" DROP CONSTRAINT "sync_queue_site_id_fkey";

-- DropForeignKey
ALTER TABLE "system_logs" DROP CONSTRAINT "system_logs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "system_logs" DROP CONSTRAINT "system_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "trailers" DROP CONSTRAINT "trailers_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_operator_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_site_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_trailer_id_fkey";

-- DropForeignKey
ALTER TABLE "weighbridge_transactions" DROP CONSTRAINT "weighbridge_transactions_vehicle_id_fkey";

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "window_start" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "window_end" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "approved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "calibration_certificates" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "consent_captured_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gate_events" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hardware_devices" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hardware_status" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "last_seen" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "resolved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organisations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site_configs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sync_queue" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "next_retry_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "system_logs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trailers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "weighbridge_transactions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "entry_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "captured_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "exit_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_transporter_organisation_id_fkey" FOREIGN KEY ("transporter_organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "weighbridge_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "weighbridge_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_devices" ADD CONSTRAINT "hardware_devices_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_status" ADD CONSTRAINT "hardware_status_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_status" ADD CONSTRAINT "hardware_status_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "hardware_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_certificates" ADD CONSTRAINT "calibration_certificates_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_certificates" ADD CONSTRAINT "calibration_certificates_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "hardware_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "bookings_driver_status_idx" RENAME TO "bookings_driver_id_status_idx";

-- RenameIndex
ALTER INDEX "bookings_site_status_window_idx" RENAME TO "bookings_site_id_status_window_start_window_end_idx";

-- RenameIndex
ALTER INDEX "bookings_transporter_created_idx" RENAME TO "bookings_transporter_organisation_id_created_at_idx";

-- RenameIndex
ALTER INDEX "bookings_vehicle_status_idx" RENAME TO "bookings_vehicle_id_status_idx";

-- RenameIndex
ALTER INDEX "calibration_site_expiry_idx" RENAME TO "calibration_certificates_site_id_expires_at_idx";

-- RenameIndex
ALTER INDEX "gate_events_site_occurred_idx" RENAME TO "gate_events_site_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "gate_events_vehicle_occurred_idx" RENAME TO "gate_events_vehicle_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "hardware_devices_calibration_expiry_idx" RENAME TO "hardware_devices_calibration_expiry_date_idx";

-- RenameIndex
ALTER INDEX "hardware_devices_site_key" RENAME TO "hardware_devices_site_id_device_key_key";

-- RenameIndex
ALTER INDEX "hardware_devices_site_type_active_idx" RENAME TO "hardware_devices_site_id_type_is_active_idx";

-- RenameIndex
ALTER INDEX "hardware_status_device_last_seen_idx" RENAME TO "hardware_status_device_id_last_seen_idx";

-- RenameIndex
ALTER INDEX "hardware_status_site_last_seen_idx" RENAME TO "hardware_status_site_id_last_seen_idx";

-- RenameIndex
ALTER INDEX "incidents_site_status_severity_created_idx" RENAME TO "incidents_site_id_status_severity_created_at_idx";

-- RenameIndex
ALTER INDEX "incidents_vehicle_type_created_idx" RENAME TO "incidents_vehicle_id_type_created_at_idx";

-- RenameIndex
ALTER INDEX "notifications_user_status_created_idx" RENAME TO "notifications_user_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "sync_queue_site_status_retry_idx" RENAME TO "sync_queue_site_id_status_next_retry_at_idx";

-- RenameIndex
ALTER INDEX "system_logs_entity_idx" RENAME TO "system_logs_entity_type_entity_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "system_logs_site_idx" RENAME TO "system_logs_site_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "system_logs_user_idx" RENAME TO "system_logs_user_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "vehicles_organisation_plate_key" RENAME TO "vehicles_organisation_id_plate_normalized_key";

-- RenameIndex
ALTER INDEX "transactions_booking_idx" RENAME TO "weighbridge_transactions_booking_id_idx";

-- RenameIndex
ALTER INDEX "transactions_commodity_captured_idx" RENAME TO "weighbridge_transactions_commodity_captured_at_idx";

-- RenameIndex
ALTER INDEX "transactions_site_captured_idx" RENAME TO "weighbridge_transactions_site_id_captured_at_idx";

-- RenameIndex
ALTER INDEX "transactions_sync_status_idx" RENAME TO "weighbridge_transactions_sync_status_idx";

-- RenameIndex
ALTER INDEX "transactions_vehicle_captured_idx" RENAME TO "weighbridge_transactions_vehicle_id_captured_at_idx";
