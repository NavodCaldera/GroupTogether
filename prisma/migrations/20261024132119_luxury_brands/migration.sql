-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brandUrl" TEXT;

-- AlterTable
ALTER TABLE "StockOffer" ADD COLUMN     "actualPrice" DECIMAL(14,2),
ADD COLUMN     "offerPrice" DECIMAL(14,2),
ADD COLUMN     "pieces" INTEGER,
ADD COLUMN     "productUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBrand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "website" TEXT;
