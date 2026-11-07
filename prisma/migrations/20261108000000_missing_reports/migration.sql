-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "missingNote" TEXT,
ADD COLUMN     "missingReportedAt" TIMESTAMP(3),
ADD COLUMN     "missingReportedById" TEXT,
ADD COLUMN     "missingReportedQty" INTEGER NOT NULL DEFAULT 0;
