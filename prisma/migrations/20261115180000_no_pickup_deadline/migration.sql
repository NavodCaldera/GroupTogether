-- DEC-019 revised: there is no pickup deadline; a parcel waits at the agent until collected.

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "pickupDays";

-- AlterEnum: drop NOT_COLLECTED (never set outside the removed sweep step)
UPDATE "ReturnRequest" SET "buyerReason" = 'OTHER' WHERE "buyerReason" = 'NOT_COLLECTED';
ALTER TYPE "BuyerFaultReason" RENAME TO "BuyerFaultReason_old";
CREATE TYPE "BuyerFaultReason" AS ENUM ('MATERIAL', 'SIZE', 'COLOUR', 'QUALITY_FEEL', 'CHANGED_MIND', 'OTHER');
ALTER TABLE "ReturnRequest" ALTER COLUMN "buyerReason" TYPE "BuyerFaultReason" USING ("buyerReason"::text::"BuyerFaultReason");
DROP TYPE "BuyerFaultReason_old";
