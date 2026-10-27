ALTER TABLE "StockOffer" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "GiftOrderStatus" AS ENUM ('RESERVED', 'READY', 'DISPATCHED', 'DELIVERED', 'ISSUE', 'CANCELLED');
CREATE TABLE "GiftSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "User"("id"),
  "amount" DECIMAL(14,2) NOT NULL,
  "reference" TEXT NOT NULL,
  "settledById" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GiftOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offerId" TEXT NOT NULL REFERENCES "StockOffer"("id"),
  "cartId" TEXT NOT NULL REFERENCES "GroupCart"("id") ON DELETE CASCADE,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id"),
  "status" "GiftOrderStatus" NOT NULL DEFAULT 'RESERVED',
  "retailValue" DECIMAL(14,2) NOT NULL,
  "partnerPrice" DECIMAL(14,2) NOT NULL,
  "recipientName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "authorizedById" TEXT NOT NULL,
  "courier" TEXT,
  "tracking" TEXT,
  "issue" TEXT,
  "paidAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "billApprovedAt" TIMESTAMP(3),
  "billApprovedById" TEXT,
  "settlementId" TEXT REFERENCES "GiftSettlement"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GiftOrder_offerId_status_idx" ON "GiftOrder"("offerId", "status");
CREATE INDEX "GiftOrder_cartId_recipientId_idx" ON "GiftOrder"("cartId", "recipientId");
CREATE INDEX "GiftOrder_settlementId_idx" ON "GiftOrder"("settlementId");
CREATE INDEX "GiftSettlement_brandId_paidAt_idx" ON "GiftSettlement"("brandId", "paidAt");
