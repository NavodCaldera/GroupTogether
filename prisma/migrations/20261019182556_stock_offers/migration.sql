-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('IN_REVIEW', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "StockOffer" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockOffer_sellerId_createdAt_idx" ON "StockOffer"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "StockOffer_status_createdAt_idx" ON "StockOffer"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StockOffer" ADD CONSTRAINT "StockOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
