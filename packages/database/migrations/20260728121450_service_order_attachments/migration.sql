-- CreateTable
CREATE TABLE "service_order_attachments" (
    "id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_order_attachments_service_order_id_created_at_idx" ON "service_order_attachments"("service_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "service_order_attachments" ADD CONSTRAINT "service_order_attachments_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_attachments" ADD CONSTRAINT "service_order_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

