-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('TEST', 'BULK');

-- AlterTable
ALTER TABLE "StockOffer" ADD COLUMN     "kind" "OfferKind" NOT NULL DEFAULT 'BULK',
ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceChange_productId_at_idx" ON "PriceChange"("productId", "at");

-- CreateIndex
CREATE INDEX "StockOffer_productId_idx" ON "StockOffer"("productId");

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOffer" ADD CONSTRAINT "StockOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing product starts its price history at its current price, from when it was created.
INSERT INTO "PriceChange" ("id", "productId", "price", "at")
SELECT 'pc_' || md5(random()::text || "id"), "id", "price", "createdAt" FROM "Product";
