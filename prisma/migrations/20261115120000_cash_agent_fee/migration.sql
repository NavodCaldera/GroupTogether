-- DEC-019: the agent fee is paid in cash at pickup; a factory-fault return charges it to the
-- factory; a parcel never collected becomes a record held by the agent.

-- AlterEnum
ALTER TYPE "BuyerFaultReason" ADD VALUE 'NOT_COLLECTED';
ALTER TYPE "DeductionKind" ADD VALUE 'AGENT_FEE';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "pickupDays" INTEGER NOT NULL DEFAULT 14;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "cashFeeEach" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "cashFeePaid" DECIMAL(14,2);

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_cash_fee" CHECK ("cashFeeEach" >= 0 AND ("cashFeePaid" IS NULL OR "cashFeePaid" >= 0));
