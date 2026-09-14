-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR MANUAL WEIGHBRIDGE SYSTEM
-- Pure manual weighbridge management: Orders -> Bookings -> 1st Weigh -> 2nd Weigh -> Waybill
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE "OrganisationType" AS ENUM ('MINING_COMPANY', 'HAULIER', 'SERVICE_PROVIDER');
CREATE TYPE "UserRole" AS ENUM ('TRANSPORTER', 'OPERATOR', 'ADMIN', 'SECURITY');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'MAINTENANCE', 'EXPIRED_DOCUMENTS');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'COMPLETED', 'EXPIRED');
CREATE TYPE "TransactionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'HELD', 'VOIDED', 'MANUAL_REVIEW');
CREATE TYPE "OrderType" AS ENUM ('DISPATCH', 'RECEIPT');
CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED');

-- 1. Organisations
CREATE TABLE IF NOT EXISTS "organisations" (
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
CREATE INDEX IF NOT EXISTS "organisations_type_is_active_idx" ON "organisations"("type", "is_active");

-- 2. Sites
CREATE TABLE IF NOT EXISTS "sites" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL DEFAULT -25.9610000,
  "longitude" DECIMAL(10,7) NOT NULL DEFAULT 29.5820000,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  "geofence_radius_m" INTEGER NOT NULL DEFAULT 500,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Site Configs
CREATE TABLE IF NOT EXISTS "site_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
  "operating_start" TEXT NOT NULL DEFAULT '05:00',
  "operating_end" TEXT NOT NULL DEFAULT '22:00',
  "max_capacity_kg" INTEGER NOT NULL DEFAULT 80000,
  "stability_threshold_kg" INTEGER NOT NULL DEFAULT 20,
  "auto_approval_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "require_insurance_valid" BOOLEAN NOT NULL DEFAULT FALSE,
  "require_driver_licence_valid" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Users
CREATE TABLE IF NOT EXISTS "users" (
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

-- 5. Vehicles
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "plate" TEXT NOT NULL,
  "plate_normalized" TEXT NOT NULL,
  "make" TEXT NOT NULL DEFAULT 'Generic',
  "model" TEXT NOT NULL DEFAULT 'Hauler',
  "year" INTEGER,
  "vin" TEXT UNIQUE,
  "tare_weight_kg" INTEGER NOT NULL DEFAULT 14500,
  "legal_max_gvw_kg" INTEGER NOT NULL DEFAULT 56000,
  "insurance_expiry" DATE NOT NULL DEFAULT CURRENT_DATE + INTERVAL '1 year',
  "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_tare_weight_kg" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "vehicles_org_plate_unique" UNIQUE ("organisation_id", "plate_normalized")
);

-- 6. Trailers
CREATE TABLE IF NOT EXISTS "trailers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicle_id" UUID REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "trailer_id" TEXT NOT NULL UNIQUE,
  "registration_no" TEXT UNIQUE,
  "type" TEXT,
  "tare_weight_kg" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Drivers
CREATE TABLE IF NOT EXISTS "drivers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "id_number_encrypted" TEXT NOT NULL DEFAULT '',
  "id_number_hash" TEXT NOT NULL UNIQUE,
  "rfid_tag" TEXT NOT NULL UNIQUE,
  "licence_number" TEXT NOT NULL UNIQUE,
  "licence_expiry" DATE NOT NULL DEFAULT CURRENT_DATE + INTERVAL '2 years',
  "blacklist_status" BOOLEAN NOT NULL DEFAULT FALSE,
  "blacklist_reason" TEXT,
  "consent_captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ
);

-- 8. Products, Sources, Destinations
CREATE TABLE IF NOT EXISTS "products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'COAL',
  "standard_density" DECIMAL(6,3),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sources" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "destinations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Weighbridge Orders (Created by Admin)
CREATE TABLE IF NOT EXISTS "weighbridge_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_number" TEXT NOT NULL UNIQUE,
  "type" "OrderType" NOT NULL,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "origin_site_id" UUID REFERENCES "sites"("id") ON DELETE SET NULL,
  "destination_site_id" UUID REFERENCES "sites"("id") ON DELETE SET NULL,
  "source_id" UUID REFERENCES "sources"("id") ON DELETE SET NULL,
  "destination_id" UUID REFERENCES "destinations"("id") ON DELETE SET NULL,
  "product_id" UUID REFERENCES "products"("id") ON DELETE SET NULL,
  "customer_name" TEXT,
  "supplier_name" TEXT,
  "product" TEXT NOT NULL,
  "estimated_mass_kg" INTEGER NOT NULL,
  "stockpile" TEXT,
  "variance_threshold_percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
  "rate_per_ton_zar" DECIMAL(10,2),
  "notes" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Bookings (Linked to Order, generates arrival queue)
CREATE TABLE IF NOT EXISTS "bookings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reference" TEXT NOT NULL UNIQUE,
  "journey_token" TEXT NOT NULL UNIQUE,
  "order_id" UUID REFERENCES "weighbridge_orders"("id") ON DELETE SET NULL,
  "transporter_organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE RESTRICT,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
  "trailer_id" UUID REFERENCES "trailers"("id") ON DELETE SET NULL,
  "driver_id" UUID NOT NULL REFERENCES "drivers"("id") ON DELETE RESTRICT,
  "commodity" TEXT NOT NULL,
  "commodity_description" TEXT,
  "target_tonnage_kg" INTEGER NOT NULL DEFAULT 34000,
  "window_start" TIMESTAMPTZ NOT NULL,
  "window_end" TIMESTAMPTZ NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'APPROVED',
  "approval_reason" TEXT,
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "bookings_site_status_idx" ON "bookings"("site_id", "status");

-- 11. Weighbridge Transactions (Manual 1st Weigh, 2nd Weigh, Waybill)
CREATE TABLE IF NOT EXISTS "weighbridge_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "edge_transaction_id" TEXT NOT NULL UNIQUE,
  "booking_id" UUID NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
  "trailer_id" UUID REFERENCES "trailers"("id") ON DELETE SET NULL,
  "driver_id" UUID NOT NULL REFERENCES "drivers"("id") ON DELETE RESTRICT,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "operator_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "gross_weight_kg" INTEGER NOT NULL,
  "tare_weight_kg" INTEGER NOT NULL,
  "net_weight_kg" INTEGER NOT NULL,
  "commodity" TEXT NOT NULL,
  "overload" BOOLEAN NOT NULL DEFAULT FALSE,
  "overload_variance_kg" INTEGER NOT NULL DEFAULT 0,
  "mine_ticket_number" TEXT,
  "waybill_number" TEXT NOT NULL UNIQUE,
  "confirmation_hash" TEXT UNIQUE,
  "previous_hash" TEXT NOT NULL,
  "integrity_hash" TEXT NOT NULL UNIQUE,
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
  "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "transaction_type" TEXT DEFAULT 'STANDARD',
  "entry_at" TIMESTAMPTZ,
  "exit_at" TIMESTAMPTZ,
  "tare_captured_at" TIMESTAMPTZ,
  "gross_captured_at" TIMESTAMPTZ,
  "turnaround_seconds" INTEGER DEFAULT 600,
  "print_count" INTEGER NOT NULL DEFAULT 0,
  "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Audit Logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "site_id" UUID REFERENCES "sites"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
