-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('APPLIED', 'APPROVED', 'LIVE', 'SUSPENDED', 'LEAVING', 'LEFT', 'REJECTED');

-- CreateEnum
CREATE TYPE "BasketStatus" AS ENUM ('OPEN', 'LOCKED', 'PACKED', 'WITH_COURIER', 'AT_AGENT');

-- CreateEnum
CREATE TYPE "BasketLockReason" AS ENUM ('AMOUNT', 'MAX_WAIT', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('ORDERS', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'LATE_PAID');

-- CreateEnum
CREATE TYPE "DeductionKind" AS ENUM ('RETURN_COURIER', 'MISSING_ITEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReturnStatus" ADD VALUE 'AWAITING_HANDOVER';
ALTER TYPE "ReturnStatus" ADD VALUE 'HANDED_OVER';
ALTER TYPE "ReturnStatus" ADD VALUE 'LAPSED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AGENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TokenKind" ADD VALUE 'LATE_PAYMENT';
ALTER TYPE "TokenKind" ADD VALUE 'ORDER_CANCEL';
ALTER TYPE "TokenKind" ADD VALUE 'AGENT_FEE';
ALTER TYPE "TokenKind" ADD VALUE 'COURIER_REPAY';
ALTER TYPE "TokenKind" ADD VALUE 'MISSING_ITEM';
ALTER TYPE "TokenKind" ADD VALUE 'DEPOSIT_RETURN';
ALTER TYPE "TokenKind" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "TokenKind" ADD VALUE 'TRANSFER_IN';

-- DropForeignKey
ALTER TABLE "ProductRating" DROP CONSTRAINT "ProductRating_cartId_fkey";

-- DropForeignKey
ALTER TABLE "ProductRating" DROP CONSTRAINT "ProductRating_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductRating" DROP CONSTRAINT "ProductRating_userId_fkey";

-- DropForeignKey
ALTER TABLE "QualityNotice" DROP CONSTRAINT "QualityNotice_userId_fkey";

-- DropForeignKey
ALTER TABLE "QualityReport" DROP CONSTRAINT "QualityReport_ratingId_fkey";

-- DropForeignKey
ALTER TABLE "ReportPhoto" DROP CONSTRAINT "ReportPhoto_reportId_fkey";

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "handedOverAt" TIMESTAMP(3),
ADD COLUMN     "handoverAgentId" TEXT,
ADD COLUMN     "handoverDueAt" TIMESTAMP(3),
ADD COLUMN     "orderLineId" TEXT,
ADD COLUMN     "sentBackBasketId" TEXT,
ALTER COLUMN "cartLineId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "agentDeposit" DECIMAL(14,2) NOT NULL DEFAULT 200000,
ADD COLUMN     "agentFeePerItem" DECIMAL(14,2) NOT NULL DEFAULT 20,
ADD COLUMN     "agentGapM" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "agentRadiusM" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "basketLockAmount" DECIMAL(14,2) NOT NULL DEFAULT 50000,
ADD COLUMN     "collectHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "courierPerItem" DECIMAL(14,2) NOT NULL DEFAULT 40,
ADD COLUMN     "gatewayFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0.033,
ADD COLUMN     "maxWaitDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "paymentHoldMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "returnHandoverDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "TokenEntry" ADD COLUMN     "counterpartyId" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "orderLineId" TEXT;

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'APPLIED',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "nicKey" TEXT,
    "photoKey" TEXT,
    "storagePhotoKeys" TEXT[],
    "depositPaidAt" TIMESTAMP(3),
    "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "leftAt" TIMESTAMP(3),
    "lossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lossNote" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHours" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,

    CONSTRAINT "AgentHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLoss" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "photoKeys" TEXT[],
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLoss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupAttempt" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,

    CONSTRAINT "PickupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Basket" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "status" "BasketStatus" NOT NULL DEFAULT 'OPEN',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "firstOrderAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockReason" "BasketLockReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Basket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "basketId" TEXT,
    "paymentAttemptId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "itemsTotal" DECIMAL(14,2) NOT NULL,
    "courierTotal" DECIMAL(14,2) NOT NULL,
    "agentFeeTotal" DECIMAL(14,2) NOT NULL,
    "tokensApplied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gatewayFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "holdUntil" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "factoryPrice" DECIMAL(14,2) NOT NULL,
    "courierEach" DECIMAL(14,2) NOT NULL,
    "agentFeeEach" DECIMAL(14,2) NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'ACTIVE',
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "missingQty" INTEGER NOT NULL DEFAULT 0,
    "collectedAt" TIMESTAMP(3),

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "buyerId" TEXT,
    "agentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attemptId" TEXT,
    "outcome" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupCode" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "PickupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierBooking" (
    "id" TEXT NOT NULL,
    "basketId" TEXT NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "givenToDriverAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryPayout" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
    "bankRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactoryPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutDeduction" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "payoutId" TEXT,
    "kind" "DeductionKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentHours_agentId_weekday_key" ON "AgentHours"("agentId", "weekday");

-- CreateIndex
CREATE INDEX "AgentLoss_agentId_idx" ON "AgentLoss"("agentId");

-- CreateIndex
CREATE INDEX "PickupAttempt_agentId_at_idx" ON "PickupAttempt"("agentId", "at");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_buyerId_variantId_key" ON "CartItem"("buyerId", "variantId");

-- CreateIndex
CREATE INDEX "Basket_status_idx" ON "Basket"("status");

-- CreateIndex
CREATE INDEX "Basket_agentId_status_idx" ON "Basket"("agentId", "status");

-- CreateIndex
CREATE INDEX "Basket_factoryId_status_idx" ON "Basket"("factoryId", "status");

-- CreateIndex
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_basketId_idx" ON "Order"("basketId");

-- CreateIndex
CREATE INDEX "Order_paymentAttemptId_idx" ON "Order"("paymentAttemptId");

-- CreateIndex
CREATE INDEX "Order_agentId_status_idx" ON "Order"("agentId", "status");

-- CreateIndex
CREATE INDEX "Order_factoryId_status_idx" ON "Order"("factoryId", "status");

-- CreateIndex
CREATE INDEX "Order_status_holdUntil_idx" ON "Order"("status", "holdUntil");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_gatewayRef_key" ON "PaymentAttempt"("gatewayRef");

-- CreateIndex
CREATE INDEX "PaymentAttempt_buyerId_createdAt_idx" ON "PaymentAttempt"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_agentId_idx" ON "PaymentAttempt"("agentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_attemptId_idx" ON "PaymentEvent"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_gateway_eventId_key" ON "PaymentEvent"("gateway", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupCode_buyerId_agentId_key" ON "PickupCode"("buyerId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupCode_agentId_code_key" ON "PickupCode"("agentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CourierBooking_basketId_key" ON "CourierBooking"("basketId");

-- CreateIndex
CREATE INDEX "FactoryPayout_paidAt_idx" ON "FactoryPayout"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryPayout_factoryId_weekEnding_key" ON "FactoryPayout"("factoryId", "weekEnding");

-- CreateIndex
CREATE INDEX "PayoutItem_payoutId_idx" ON "PayoutItem"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_orderLineId_key" ON "PayoutItem"("orderLineId");

-- CreateIndex
CREATE INDEX "PayoutDeduction_factoryId_payoutId_idx" ON "PayoutDeduction"("factoryId", "payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutDeduction_kind_ref_key" ON "PayoutDeduction"("kind", "ref");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderLineId_idx" ON "ReturnRequest"("orderLineId");

-- CreateIndex
CREATE INDEX "ReturnRequest_handoverAgentId_status_idx" ON "ReturnRequest"("handoverAgentId", "status");

-- CreateIndex
CREATE INDEX "TokenEntry_orderId_idx" ON "TokenEntry"("orderId");

-- CreateIndex
CREATE INDEX "TokenEntry_orderLineId_idx" ON "TokenEntry"("orderLineId");

-- AddForeignKey
ALTER TABLE "ProductRating" ADD CONSTRAINT "ProductRating_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRating" ADD CONSTRAINT "ProductRating_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "GroupCart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRating" ADD CONSTRAINT "ProductRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "ProductRating"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QualityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityNotice" ADD CONSTRAINT "QualityNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_handoverAgentId_fkey" FOREIGN KEY ("handoverAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_sentBackBasketId_fkey" FOREIGN KEY ("sentBackBasketId") REFERENCES "Basket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHours" ADD CONSTRAINT "AgentHours_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLoss" ADD CONSTRAINT "AgentLoss_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLoss" ADD CONSTRAINT "AgentLoss_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupAttempt" ADD CONSTRAINT "PickupAttempt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Basket" ADD CONSTRAINT "Basket_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Basket" ADD CONSTRAINT "Basket_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupCode" ADD CONSTRAINT "PickupCode_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupCode" ADD CONSTRAINT "PickupCode_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierBooking" ADD CONSTRAINT "CourierBooking_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierBooking" ADD CONSTRAINT "CourierBooking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryPayout" ADD CONSTRAINT "FactoryPayout_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryPayout" ADD CONSTRAINT "FactoryPayout_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "FactoryPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutDeduction" ADD CONSTRAINT "PayoutDeduction_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutDeduction" ADD CONSTRAINT "PayoutDeduction_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "FactoryPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open basket per agent and factory (Prisma cannot express partial unique indexes)
CREATE UNIQUE INDEX "Basket_one_open" ON "Basket"("agentId","factoryId") WHERE status = 'OPEN';
