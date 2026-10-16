-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('MEN', 'WOMEN', 'GIRL', 'BOY', 'KID');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "audience" "Audience",
ADD COLUMN     "kind" TEXT;

-- CreateIndex
CREATE INDEX "Product_status_audience_kind_idx" ON "Product"("status", "audience", "kind");
