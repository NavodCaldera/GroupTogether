-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "lotId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "fullMarginDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "fullMarginPct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "reducedMarginPct" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "storeCapacity" INTEGER NOT NULL DEFAULT 6000;

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "bulkCost" DECIMAL(14,2) NOT NULL,
    "transportCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wages" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "fullMarginPct" INTEGER NOT NULL,
    "reducedMarginPct" INTEGER NOT NULL,
    "reduceAt" TIMESTAMP(3) NOT NULL,
    "reducedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lot_reducedAt_reduceAt_idx" ON "Lot"("reducedAt", "reduceAt");

-- CreateIndex
CREATE INDEX "Lot_receivedAt_idx" ON "Lot"("receivedAt");

-- CreateIndex
CREATE INDEX "Product_lotId_idx" ON "Product"("lotId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

