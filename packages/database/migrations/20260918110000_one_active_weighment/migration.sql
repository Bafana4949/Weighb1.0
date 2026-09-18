-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_weighment_per_booking" ON "weighbridge_transactions"("booking_id") WHERE status = 'IN_PROGRESS';
