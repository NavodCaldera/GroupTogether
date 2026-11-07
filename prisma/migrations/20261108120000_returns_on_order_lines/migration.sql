-- Ratings and quality reports move from group carts to orders. All data is demo data:
-- old rows have no order to point at, so they are dropped with their reports and photos.
DELETE FROM "ReportPhoto";
DELETE FROM "QualityReport";
DELETE FROM "ProductRating";

-- DropForeignKey
ALTER TABLE "ProductRating" DROP CONSTRAINT "ProductRating_cartId_fkey";

-- DropIndex
DROP INDEX "ProductRating_cartId_userId_productId_key";

-- AlterTable
ALTER TABLE "ProductRating" DROP COLUMN "cartId",
ADD COLUMN     "orderId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProductRating_orderId_userId_productId_key" ON "ProductRating"("orderId", "userId", "productId");

-- AddForeignKey
ALTER TABLE "ProductRating" ADD CONSTRAINT "ProductRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

