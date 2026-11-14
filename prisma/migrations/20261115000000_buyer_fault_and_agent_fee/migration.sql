-- DEC-017: buyer-fault returns are a record resold by the agent, with no tokens.
-- DEC-018: one agent fee as a share of the item price replaces the courier charge and agent fee.

-- CreateEnum
CREATE TYPE "BuyerFaultReason" AS ENUM ('MATERIAL', 'SIZE', 'COLOUR', 'QUALITY_FEEL', 'CHANGED_MIND', 'OTHER');

-- AlterEnum
ALTER TYPE "ReturnStatus" ADD VALUE 'BUYER_REQUESTED';
ALTER TYPE "ReturnStatus" ADD VALUE 'WITH_AGENT';
ALTER TYPE "ReturnStatus" ADD VALUE 'SOLD';
ALTER TYPE "ReturnStatus" ADD VALUE 'TAKEN_BACK';
ALTER TYPE "TokenKind" ADD VALUE 'FEE_CLAWBACK';

-- The fee take-back is the third negative kind. Compared as text: a new enum value cannot be
-- used as an enum literal in the migration that adds it.
ALTER TABLE "TokenEntry" DROP CONSTRAINT "TokenEntry_amount_sign";
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_amount_sign" CHECK (
  ("kind"::text IN ('RETURN','RELEASE','LATE_PAYMENT','ORDER_CANCEL','AGENT_FEE','COURIER_REPAY','MISSING_ITEM','DEPOSIT_RETURN','TRANSFER_IN') AND "amount" > 0)
  OR ("kind"::text IN ('HOLD','TRANSFER_OUT','FEE_CLAWBACK') AND "amount" < 0)
  OR ("kind"::text = 'SPEND' AND "amount" = 0)
);

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "agentFeePerItem",
DROP COLUMN "courierPerItem",
ADD COLUMN "agentFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
ADD COLUMN "buyerHandoverDays" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "ReturnRequest" ALTER COLUMN "reason" DROP NOT NULL,
ADD COLUMN "buyerReason" "BuyerFaultReason",
ADD COLUMN "changedToBuyerAt" TIMESTAMP(3),
ADD COLUMN "buyerDecidedById" TEXT,
ADD COLUMN "resoldAt" TIMESTAMP(3),
ADD COLUMN "takenBackAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AgentFeeClawback" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "left" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFeeClawback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentFeeClawback_amounts" CHECK ("amount" > 0 AND "left" >= 0 AND "left" <= "amount")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentFeeClawback_returnId_key" ON "AgentFeeClawback"("returnId");
CREATE INDEX "AgentFeeClawback_agentId_left_idx" ON "AgentFeeClawback"("agentId", "left");
CREATE INDEX "ReturnRequest_fault_status_createdAt_idx" ON "ReturnRequest"("fault", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentFeeClawback" ADD CONSTRAINT "AgentFeeClawback_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
