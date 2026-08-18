-- AlterTable
ALTER TABLE "weighbridge_transactions" ADD COLUMN     "lane_id" UUID;

-- AddForeignKey
ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_lane_id_fkey" FOREIGN KEY ("lane_id") REFERENCES "lanes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

