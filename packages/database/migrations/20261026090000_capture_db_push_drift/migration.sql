-- Captures schema changes that earlier reached databases through `prisma db push`
-- without a migration (order pause/resume and fast-track preset weights).
-- Written idempotently so it applies cleanly both to fresh databases and to
-- databases that already received these columns via db push.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "rfid_tag" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "tare_weight_kg" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "weighbridge_orders"
  ADD COLUMN IF NOT EXISTS "preset_gross_weight_kg" INTEGER,
  ADD COLUMN IF NOT EXISTS "preset_tare_weight_kg" INTEGER,
  ADD COLUMN IF NOT EXISTS "use_constant_gross" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "use_constant_tare" BOOLEAN NOT NULL DEFAULT false;
