-- Own baskets (DEC-023)
ALTER TYPE "BasketStatus" ADD VALUE 'AWAITING_FEE';
ALTER TYPE "BasketStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "BasketStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "BasketLockReason" ADD VALUE 'OWNER';
ALTER TYPE "PaymentPurpose" ADD VALUE 'DELIVERY_FEE';

CREATE TYPE "BasketKind" AS ENUM ('AGENT', 'OWN');
CREATE TYPE "BasketVisibility" AS ENUM ('LINK', 'PUBLIC');

ALTER TABLE "Settings"
  ADD COLUMN "ownDeliveryBase" DECIMAL(14,2) NOT NULL DEFAULT 400,
  ADD COLUMN "ownDeliveryPerItem" DECIMAL(14,2) NOT NULL DEFAULT 50,
  ADD COLUMN "ownFeeDays" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "Basket"
  ADD COLUMN "kind" "BasketKind" NOT NULL DEFAULT 'AGENT',
  ALTER COLUMN "agentId" DROP NOT NULL,
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "visibility" "BasketVisibility",
  ADD COLUMN "shareCode" TEXT,
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliveryArea" TEXT,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "deliveryFee" DECIMAL(14,2),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "feeDueAt" TIMESTAMP(3),
  ADD COLUMN "feePaidAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);

ALTER TABLE "Order"
  ALTER COLUMN "agentId" DROP NOT NULL,
  ADD COLUMN "targetBasketId" TEXT;

ALTER TABLE "PaymentAttempt" ADD COLUMN "basketId" TEXT;

CREATE UNIQUE INDEX "Basket_shareCode_key" ON "Basket"("shareCode");
CREATE INDEX "Basket_kind_status_productId_idx" ON "Basket"("kind", "status", "productId");
CREATE INDEX "Basket_ownerId_idx" ON "Basket"("ownerId");
CREATE INDEX "Order_targetBasketId_status_idx" ON "Order"("targetBasketId", "status");

ALTER TABLE "Basket" ADD CONSTRAINT "Basket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Basket" ADD CONSTRAINT "Basket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_targetBasketId_fkey" FOREIGN KEY ("targetBasketId") REFERENCES "Basket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An agent basket always has an agent; an own basket has an owner, a product and no agent.
ALTER TABLE "Basket" ADD CONSTRAINT "Basket_kind_shape" CHECK (
  ("kind" = 'AGENT' AND "agentId" IS NOT NULL AND "ownerId" IS NULL)
  OR ("kind" = 'OWN' AND "agentId" IS NULL AND "ownerId" IS NOT NULL AND "productId" IS NOT NULL)
);
