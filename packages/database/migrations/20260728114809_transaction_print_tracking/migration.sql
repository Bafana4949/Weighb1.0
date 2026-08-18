-- AlterTable
ALTER TABLE "weighbridge_transactions" ADD COLUMN     "last_printed_by_id" UUID,
ADD COLUMN     "print_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "printed_at" TIMESTAMP(3);

