-- DEC-029 phase 4: general product fields; the old clothing-only columns and enums go.

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('NEW', 'FACTORY_SURPLUS', 'B_GRADE', 'REFURBISHED');

-- AlterTable: new fields first so the condition can be filled from the stock type
ALTER TABLE "Product" ADD COLUMN     "condition" "Condition" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "hazmat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minOrderQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sellUnit" TEXT NOT NULL DEFAULT 'piece',
ADD COLUMN     "shelfLifeDays" INTEGER,
ADD COLUMN     "stepQty" INTEGER NOT NULL DEFAULT 1;

-- Backfill: every existing product was factory surplus or B-grade
UPDATE "Product" SET "condition" = "stockType"::text::"Condition";

ALTER TABLE "Product" ADD CONSTRAINT "Product_order_qty_check"
  CHECK ("minOrderQty" >= 1 AND "stepQty" >= 1 AND ("shelfLifeDays" IS NULL OR "shelfLifeDays" >= 0));

-- DropIndex
DROP INDEX "Product_status_category_idx";

-- DropIndex
DROP INDEX "Product_status_audience_kind_idx";

-- DropIndex
DROP INDEX "Variant_productId_size_colour_key";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "audience",
DROP COLUMN "category",
DROP COLUMN "kind",
DROP COLUMN "stockType";

-- AlterTable
ALTER TABLE "Variant" DROP COLUMN "colour",
DROP COLUMN "size";

-- DropEnum
DROP TYPE "LegacyCategory";

-- DropEnum
DROP TYPE "StockType";

-- DropEnum
DROP TYPE "Audience";
