-- DEC-029 phase 5: factory categories, product licence and trademark documents, application industry.
-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum


ALTER TYPE "FactoryDocKind" ADD VALUE 'PRODUCT_LICENCE';
ALTER TYPE "FactoryDocKind" ADD VALUE 'TRADEMARK_PROOF';

-- AlterTable
ALTER TABLE "FactoryApplication" ADD COLUMN     "industryId" TEXT;

-- AlterTable
ALTER TABLE "FactoryDocument" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "factoryId" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "applicationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FactoryCategory" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactoryCategory_status_createdAt_idx" ON "FactoryCategory"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryCategory_factoryId_categoryId_key" ON "FactoryCategory"("factoryId", "categoryId");

-- CreateIndex
CREATE INDEX "FactoryDocument_factoryId_kind_status_idx" ON "FactoryDocument"("factoryId", "kind", "status");

-- CreateIndex
CREATE INDEX "FactoryDocument_status_createdAt_idx" ON "FactoryDocument"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "FactoryCategory" ADD CONSTRAINT "FactoryCategory_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryCategory" ADD CONSTRAINT "FactoryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryCategory" ADD CONSTRAINT "FactoryCategory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryApplication" ADD CONSTRAINT "FactoryApplication_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryDocument" ADD CONSTRAINT "FactoryDocument_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryDocument" ADD CONSTRAINT "FactoryDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A document belongs to an application or to a factory
ALTER TABLE "FactoryDocument" ADD CONSTRAINT "FactoryDocument_owner_check" CHECK ("applicationId" IS NOT NULL OR "factoryId" IS NOT NULL);

-- Backfill: documents of reviewed applications were reviewed with the application
UPDATE "FactoryDocument" d SET "status" = a."status"::text::"ReviewStatus", "reviewedById" = a."reviewerId", "reviewedAt" = a."reviewedAt"
FROM "FactoryApplication" a
WHERE a."id" = d."applicationId" AND a."status" IN ('APPROVED', 'REJECTED');

-- Backfill: every existing factory keeps listing clothing, and shoes when it already sells shoes
INSERT INTO "FactoryCategory" ("id", "factoryId", "categoryId", "status", "reviewedAt", "createdAt", "updatedAt")
SELECT 'fc_' || md5(u."id" || ':cat_clothing'), u."id", 'cat_clothing', 'APPROVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'SELLER' AND u."factoryId" IS NULL AND u."isBrand" = false
  AND EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = 'cat_clothing')
ON CONFLICT ("factoryId", "categoryId") DO NOTHING;

INSERT INTO "FactoryCategory" ("id", "factoryId", "categoryId", "status", "reviewedAt", "createdAt", "updatedAt")
SELECT 'fc_' || md5(u."id" || ':cat_shoes'), u."id", 'cat_shoes', 'APPROVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'SELLER' AND u."factoryId" IS NULL AND u."isBrand" = false
  AND EXISTS (
    SELECT 1 FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."sellerId" = u."id" AND c."path" LIKE '/cat_shoes/%'
  )
ON CONFLICT ("factoryId", "categoryId") DO NOTHING;
