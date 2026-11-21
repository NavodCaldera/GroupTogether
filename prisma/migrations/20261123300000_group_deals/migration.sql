-- DEC-029, DEAL-001..003: group deals with quantity price tiers. Buyers pay tier 1; the sweep
-- settles each deal once at the highest tier reached and credits the difference as DEAL_REBATE
-- tokens.

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'LIVE', 'CLOSED', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TokenKind" ADD VALUE 'DEAL_REBATE';

-- The rebate is a positive kind. Compared as text: a new enum value cannot be used as an enum
-- literal in the migration that adds it.
ALTER TABLE "TokenEntry" DROP CONSTRAINT "TokenEntry_amount_sign";
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_amount_sign" CHECK (
  ("kind"::text IN ('RETURN','RELEASE','LATE_PAYMENT','ORDER_CANCEL','AGENT_FEE','COURIER_REPAY','MISSING_ITEM','DEPOSIT_RETURN','TRANSFER_IN','DEAL_REBATE') AND "amount" > 0)
  OR ("kind"::text IN ('HOLD','TRANSFER_OUT','FEE_CLAWBACK') AND "amount" < 0)
  OR ("kind"::text = 'SPEND' AND "amount" = 0)
);

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "finalFactoryPrice" DECIMAL(14,2),
ADD COLUMN     "finalUnitPrice" DECIMAL(14,2),
ADD COLUMN     "paidUnitPrice" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "GroupDeal" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxQty" INTEGER,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "unitsHeld" INTEGER NOT NULL DEFAULT 0,
    "finalTierId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupDeal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupDeal_units_check" CHECK ("unitsSold" >= 0 AND "unitsHeld" >= 0),
    CONSTRAINT "GroupDeal_maxQty_check" CHECK ("maxQty" IS NULL OR "maxQty" > 0)
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "factoryPrice" DECIMAL(14,2) NOT NULL,
    "buyerPrice" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceTier_check" CHECK ("minQty" >= 1 AND "factoryPrice" >= 0 AND "buyerPrice" >= "factoryPrice")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupDeal_finalTierId_key" ON "GroupDeal"("finalTierId");

-- CreateIndex
CREATE INDEX "GroupDeal_status_endsAt_idx" ON "GroupDeal"("status", "endsAt");

-- CreateIndex
CREATE INDEX "GroupDeal_productId_status_idx" ON "GroupDeal"("productId", "status");

-- CreateIndex
CREATE INDEX "GroupDeal_factoryId_idx" ON "GroupDeal"("factoryId");

-- At most one LIVE deal per product.
CREATE UNIQUE INDEX "GroupDeal_one_live_per_product" ON "GroupDeal"("productId") WHERE "status" = 'LIVE';

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_dealId_minQty_key" ON "PriceTier"("dealId", "minQty");

-- CreateIndex
CREATE INDEX "OrderLine_dealId_idx" ON "OrderLine"("dealId");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "GroupDeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDeal" ADD CONSTRAINT "GroupDeal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDeal" ADD CONSTRAINT "GroupDeal_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDeal" ADD CONSTRAINT "GroupDeal_finalTierId_fkey" FOREIGN KEY ("finalTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "GroupDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
