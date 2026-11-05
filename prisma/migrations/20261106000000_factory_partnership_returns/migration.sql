-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('WAITING_FACTORY', 'WITH_ADMIN', 'ACCEPTED', 'REJECTED', 'PICKED_UP', 'RECEIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReturnFault" AS ENUM ('FACTORY', 'BUYER');

-- AlterTable
ALTER TABLE "CartLine" ADD COLUMN     "returnedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "cartLineId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "fault" "ReturnFault" NOT NULL,
    "note" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'WAITING_FACTORY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "factoryDueAt" TIMESTAMP(3) NOT NULL,
    "factoryDecidedAt" TIMESTAMP(3),
    "factoryDecidedById" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "adminDecision" BOOLEAN,
    "adminId" TEXT,
    "adminNote" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "unusedWithTags" BOOLEAN,
    "receivedCondition" TEXT,
    "pickupRef" TEXT,
    "pickupDriver" TEXT,
    "pickupBookedAt" TIMESTAMP(3),
    "pickupBookedById" TEXT,
    "paidBy" "ReturnFault",

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnPhoto" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,

    CONSTRAINT "ReturnPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnNotice" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ReturnNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnRequest_factoryId_status_idx" ON "ReturnRequest"("factoryId", "status");

-- CreateIndex
CREATE INDEX "ReturnRequest_buyerId_createdAt_idx" ON "ReturnRequest"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_factoryDueAt_idx" ON "ReturnRequest"("status", "factoryDueAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_cartLineId_idx" ON "ReturnRequest"("cartLineId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_returnId_idx" ON "ReturnPhoto"("returnId");

-- CreateIndex
CREATE INDEX "ReturnNotice_deliveredAt_idx" ON "ReturnNotice"("deliveredAt");

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_cartLineId_fkey" FOREIGN KEY ("cartLineId") REFERENCES "CartLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnNotice" ADD CONSTRAINT "ReturnNotice_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing delivered deliveries use their last recorded update as the delivery time.
UPDATE "Delivery" SET "deliveredAt" = "updatedAt" WHERE status = 'DELIVERED';
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_returnedQty_check" CHECK ("returnedQty" >= 0 AND "returnedQty" <= qty);
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_qty_check" CHECK (qty > 0);

