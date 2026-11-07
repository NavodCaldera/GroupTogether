-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "checkoutKey" TEXT;

-- CreateIndex
CREATE INDEX "Order_buyerId_checkoutKey_idx" ON "Order"("buyerId", "checkoutKey");
