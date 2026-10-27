ALTER TABLE "StockOffer"
ADD COLUMN "photoKey" TEXT,
ADD COLUMN "photoType" TEXT,
ADD COLUMN "packDetails" TEXT,
ADD COLUMN "packSize" TEXT,
ADD COLUMN "dispatchDays" INTEGER,
ADD COLUMN "hasExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expiryDate" DATE,
ADD COLUMN "minShelfLifeDays" INTEGER;
