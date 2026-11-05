CREATE TYPE "ReportReason" AS ENUM ('DAMAGED','WRONG_ITEM','STITCHING','SIZE','OTHER');
CREATE TABLE "ProductRating" (id TEXT PRIMARY KEY,"productId" TEXT NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,"cartId" TEXT NOT NULL REFERENCES "GroupCart"(id) ON DELETE RESTRICT,"userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ProductRating_cartId_userId_productId_key" ON "ProductRating"("cartId","userId","productId");
CREATE INDEX "ProductRating_productId_createdAt_idx" ON "ProductRating"("productId","createdAt");
CREATE TABLE "QualityReport" (id TEXT PRIMARY KEY,"ratingId" TEXT NOT NULL UNIQUE REFERENCES "ProductRating"(id) ON DELETE CASCADE,reason "ReportReason" NOT NULL,note TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "QualityReport_createdAt_idx" ON "QualityReport"("createdAt");
CREATE TABLE "ReportPhoto" (id TEXT PRIMARY KEY,"reportId" TEXT NOT NULL REFERENCES "QualityReport"(id) ON DELETE CASCADE,"storageKey" TEXT NOT NULL,"contentType" TEXT NOT NULL);
CREATE INDEX "ReportPhoto_reportId_idx" ON "ReportPhoto"("reportId");
