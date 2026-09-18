import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Applying partial unique index: one_active_weighment_per_booking...");
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_weighment_per_booking
      ON weighbridge_transactions (booking_id) WHERE status = 'IN_PROGRESS';
  `);
  console.log("✓ Partial unique index one_active_weighment_per_booking applied successfully!");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
