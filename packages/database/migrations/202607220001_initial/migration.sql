CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "OrganisationType" AS ENUM ('MINING_COMPANY','HAULIER','SERVICE_PROVIDER');
CREATE TYPE "UserRole" AS ENUM ('TRANSPORTER','OPERATOR','ADMIN','SECURITY');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','SUSPENDED','INVITED');
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE','SUSPENDED','MAINTENANCE','EXPIRED_DOCUMENTS');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED','ACTIVE','COMPLETED','EXPIRED');
CREATE TYPE "TransactionStatus" AS ENUM ('IN_PROGRESS','COMPLETED','HELD','VOIDED','MANUAL_REVIEW');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING','SYNCING','SYNCED','FAILED');
CREATE TYPE "GateDirection" AS ENUM ('ENTRY','EXIT');
CREATE TYPE "GateEventType" AS ENUM ('ANPR_CAPTURE','AUTHORISATION_CHECK','GATE_OPEN','GATE_CLOSE','VEHICLE_ENTERED','VEHICLE_EXITED','MANUAL_OVERRIDE');
CREATE TYPE "IncidentType" AS ENUM ('UNAUTHORISED_ACCESS','OVERLOAD','FRAUD_ALERT','SENSOR_FAULT','DRIVER_MISMATCH','ANPR_FAILURE','CLOUD_SYNC_FAILURE','SCALE_FAULT','ROUTE_DEVIATION','CLONE_DETECTION','TARE_DRIFT','CALIBRATION_EXPIRY','POWER_RECOVERY','MANUAL_OVERRIDE');
CREATE TYPE "Severity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED');
CREATE TYPE "HardwareDeviceType" AS ENUM ('SCALE','POSITION_SENSOR','RFID_READER','ANPR_CAMERA','ENTRY_GATE','EXIT_GATE','TRAFFIC_LIGHT','BUZZER','EDGE_DAEMON');
CREATE TYPE "HardwareHealth" AS ENUM ('ONLINE','DEGRADED','OFFLINE','FAULT');
CREATE TYPE "QueueOperation" AS ENUM ('TRANSACTION_RECONCILE','GATE_EVENT_UPLOAD','INCIDENT_UPLOAD','HARDWARE_STATUS_UPLOAD');
CREATE TYPE "NotificationChannel" AS ENUM ('DASHBOARD','EMAIL','SMS','AUDIBLE');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING','SENT','FAILED');

CREATE TABLE "organisations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "registration_no" TEXT UNIQUE,
  "type" "OrganisationType" NOT NULL,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ
);
CREATE INDEX "organisations_type_is_active_idx" ON "organisations"("type","is_active");

CREATE TABLE "sites" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  "geofence_radius_m" INTEGER NOT NULL DEFAULT 500,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sites_organisation_id_is_active_idx" ON "sites"("organisation_id","is_active");

CREATE TABLE "site_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
  "operating_start" TEXT NOT NULL DEFAULT '05:00',
  "operating_end" TEXT NOT NULL DEFAULT '22:00',
  "max_capacity_kg" INTEGER NOT NULL DEFAULT 80000 CHECK ("max_capacity_kg" > 0),
  "stability_threshold_kg" INTEGER NOT NULL DEFAULT 20 CHECK ("stability_threshold_kg" > 0),
  "stability_duration_seconds" INTEGER NOT NULL DEFAULT 3 CHECK ("stability_duration_seconds" > 0),
  "overload_tolerance_percent" DECIMAL(5,2) NOT NULL DEFAULT 5 CHECK ("overload_tolerance_percent" >= 0),
  "positioning_hold_seconds" INTEGER NOT NULL DEFAULT 2 CHECK ("positioning_hold_seconds" > 0),
  "turnaround_threshold_minutes" INTEGER NOT NULL DEFAULT 45 CHECK ("turnaround_threshold_minutes" > 0),
  "journey_window_grace_minutes" INTEGER NOT NULL DEFAULT 120 CHECK ("journey_window_grace_minutes" >= 0),
  "auto_approval_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "require_insurance_valid" BOOLEAN NOT NULL DEFAULT TRUE,
  "require_driver_licence_valid" BOOLEAN NOT NULL DEFAULT TRUE,
  "retention_years" INTEGER NOT NULL DEFAULT 5 CHECK ("retention_years" BETWEEN 1 AND 10),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE SET NULL,
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "phone" TEXT,
  "role" "UserRole" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_login_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ
);
CREATE INDEX "users_organisation_id_role_status_idx" ON "users"("organisation_id","role","status");

CREATE TABLE "vehicles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "plate" TEXT NOT NULL,
  "plate_normalized" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER,
  "vin" TEXT UNIQUE,
  "tare_weight_kg" INTEGER NOT NULL CHECK ("tare_weight_kg" > 0),
  "legal_max_gvw_kg" INTEGER NOT NULL CHECK ("legal_max_gvw_kg" > "tare_weight_kg"),
  "insurance_expiry" DATE NOT NULL,
  "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  "anomaly_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "last_tare_weight_kg" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "vehicles_organisation_plate_key" UNIQUE ("organisation_id","plate_normalized")
);
CREATE INDEX "vehicles_plate_normalized_status_idx" ON "vehicles"("plate_normalized","status");
CREATE INDEX "vehicles_insurance_expiry_idx" ON "vehicles"("insurance_expiry");

CREATE TABLE "trailers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicle_id" UUID REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "trailer_id" TEXT NOT NULL UNIQUE,
  "registration_no" TEXT UNIQUE,
  "type" TEXT,
  "tare_weight_kg" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "trailers_vehicle_id_idx" ON "trailers"("vehicle_id");

CREATE TABLE "drivers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "id_number_encrypted" TEXT NOT NULL,
  "id_number_hash" TEXT NOT NULL UNIQUE,
  "rfid_tag" TEXT NOT NULL UNIQUE,
  "photo_url" TEXT,
  "licence_number" TEXT NOT NULL UNIQUE,
  "licence_expiry" DATE NOT NULL,
  "blacklist_status" BOOLEAN NOT NULL DEFAULT FALSE,
  "blacklist_reason" TEXT,
  "consent_captured_at" TIMESTAMPTZ NOT NULL,
  "anomaly_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ
);
CREATE INDEX "drivers_organisation_id_blacklist_status_idx" ON "drivers"("organisation_id","blacklist_status");
CREATE INDEX "drivers_licence_expiry_idx" ON "drivers"("licence_expiry");

CREATE TABLE "bookings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reference" TEXT NOT NULL UNIQUE,
  "journey_token" TEXT NOT NULL UNIQUE,
  "transporter_organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
  "trailer_id" UUID REFERENCES "trailers"("id") ON DELETE SET NULL,
  "driver_id" UUID NOT NULL REFERENCES "drivers"("id") ON DELETE RESTRICT,
  "commodity" TEXT NOT NULL,
  "commodity_description" TEXT,
  "target_tonnage_kg" INTEGER NOT NULL CHECK ("target_tonnage_kg" > 0),
  "window_start" TIMESTAMPTZ NOT NULL,
  "window_end" TIMESTAMPTZ NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "approval_reason" TEXT,
  "rejection_reason" TEXT,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_window_check" CHECK ("window_end" > "window_start")
);
CREATE INDEX "bookings_site_status_window_idx" ON "bookings"("site_id","status","window_start","window_end");
CREATE INDEX "bookings_vehicle_status_idx" ON "bookings"("vehicle_id","status");
CREATE INDEX "bookings_driver_status_idx" ON "bookings"("driver_id","status");
CREATE INDEX "bookings_transporter_created_idx" ON "bookings"("transporter_organisation_id","created_at");

CREATE TABLE "weighbridge_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "edge_transaction_id" TEXT NOT NULL UNIQUE,
  "booking_id" UUID NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
  "trailer_id" UUID REFERENCES "trailers"("id") ON DELETE SET NULL,
  "driver_id" UUID NOT NULL REFERENCES "drivers"("id") ON DELETE RESTRICT,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "operator_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "gross_weight_kg" INTEGER NOT NULL CHECK ("gross_weight_kg" >= 0),
  "tare_weight_kg" INTEGER NOT NULL CHECK ("tare_weight_kg" >= 0),
  "net_weight_kg" INTEGER NOT NULL,
  "commodity" TEXT NOT NULL,
  "overload" BOOLEAN NOT NULL DEFAULT FALSE,
  "overload_variance_kg" INTEGER NOT NULL DEFAULT 0,
  "anpr_confidence" DECIMAL(5,4),
  "entry_photo_url" TEXT,
  "scale_photo_url" TEXT,
  "waybill_number" TEXT NOT NULL UNIQUE,
  "confirmation_hash" TEXT UNIQUE,
  "previous_hash" TEXT NOT NULL,
  "integrity_hash" TEXT NOT NULL UNIQUE,
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
  "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "entry_at" TIMESTAMPTZ,
  "captured_at" TIMESTAMPTZ NOT NULL,
  "exit_at" TIMESTAMPTZ,
  "turnaround_seconds" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transactions_net_check" CHECK ("net_weight_kg" = "gross_weight_kg" - "tare_weight_kg"),
  CONSTRAINT "transactions_hash_format" CHECK ("previous_hash" ~ '^[a-f0-9]{64}$' AND "integrity_hash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "transactions_site_captured_idx" ON "weighbridge_transactions"("site_id","captured_at");
CREATE INDEX "transactions_vehicle_captured_idx" ON "weighbridge_transactions"("vehicle_id","captured_at");
CREATE INDEX "transactions_booking_idx" ON "weighbridge_transactions"("booking_id");
CREATE INDEX "transactions_sync_status_idx" ON "weighbridge_transactions"("sync_status");
CREATE INDEX "transactions_commodity_captured_idx" ON "weighbridge_transactions"("commodity","captured_at");

CREATE TABLE "gate_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "booking_id" UUID REFERENCES "bookings"("id") ON DELETE SET NULL,
  "transaction_id" UUID REFERENCES "weighbridge_transactions"("id") ON DELETE SET NULL,
  "vehicle_id" UUID REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "direction" "GateDirection" NOT NULL,
  "event_type" "GateEventType" NOT NULL,
  "plate_read" TEXT,
  "anpr_confidence" DECIMAL(5,4),
  "photo_url" TEXT,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "gate_events_site_occurred_idx" ON "gate_events"("site_id","occurred_at");
CREATE INDEX "gate_events_vehicle_occurred_idx" ON "gate_events"("vehicle_id","occurred_at");

CREATE TABLE "incidents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "booking_id" UUID REFERENCES "bookings"("id") ON DELETE SET NULL,
  "transaction_id" UUID REFERENCES "weighbridge_transactions"("id") ON DELETE SET NULL,
  "vehicle_id" UUID REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "driver_id" UUID REFERENCES "drivers"("id") ON DELETE SET NULL,
  "type" "IncidentType" NOT NULL,
  "severity" "Severity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "anomaly_score" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "resolved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "resolution_notes" TEXT,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "incidents_site_status_severity_created_idx" ON "incidents"("site_id","status","severity","created_at");
CREATE INDEX "incidents_vehicle_type_created_idx" ON "incidents"("vehicle_id","type","created_at");

CREATE TABLE "system_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID REFERENCES "sites"("id") ON DELETE SET NULL,
  "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "before_data" JSONB,
  "after_data" JSONB,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "system_logs_entity_idx" ON "system_logs"("entity_type","entity_id","occurred_at");
CREATE INDEX "system_logs_user_idx" ON "system_logs"("user_id","occurred_at");
CREATE INDEX "system_logs_site_idx" ON "system_logs"("site_id","occurred_at");

CREATE TABLE "hardware_devices" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "device_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "HardwareDeviceType" NOT NULL,
  "serial_number" TEXT,
  "firmware_version" TEXT,
  "configuration" JSONB,
  "last_calibration_date" DATE,
  "calibration_expiry_date" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hardware_devices_site_key" UNIQUE ("site_id","device_key")
);
CREATE INDEX "hardware_devices_site_type_active_idx" ON "hardware_devices"("site_id","type","is_active");
CREATE INDEX "hardware_devices_calibration_expiry_idx" ON "hardware_devices"("calibration_expiry_date");

CREATE TABLE "hardware_status" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "device_id" UUID REFERENCES "hardware_devices"("id") ON DELETE SET NULL,
  "health" "HardwareHealth" NOT NULL,
  "last_seen" TIMESTAMPTZ NOT NULL,
  "sensor_readings" JSONB,
  "connectivity" JSONB,
  "error_code" TEXT,
  "message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "hardware_status_site_last_seen_idx" ON "hardware_status"("site_id","last_seen");
CREATE INDEX "hardware_status_device_last_seen_idx" ON "hardware_status"("device_id","last_seen");

CREATE TABLE "sync_queue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "operation" "QueueOperation" NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL,
  "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sync_queue_site_status_retry_idx" ON "sync_queue"("site_id","status","next_retry_at");

CREATE TABLE "calibration_certificates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "device_id" UUID NOT NULL REFERENCES "hardware_devices"("id") ON DELETE RESTRICT,
  "certificate_number" TEXT NOT NULL UNIQUE,
  "issuing_authority" TEXT NOT NULL,
  "calibrated_at" DATE NOT NULL,
  "expires_at" DATE NOT NULL,
  "document_url" TEXT NOT NULL,
  "accuracy_class" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calibration_dates_check" CHECK ("expires_at" > "calibrated_at")
);
CREATE INDEX "calibration_site_expiry_idx" ON "calibration_certificates"("site_id","expires_at");

CREATE TABLE "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "severity" "Severity" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB,
  "sent_at" TIMESTAMPTZ,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "notifications_user_status_created_idx" ON "notifications"("user_id","status","created_at");
