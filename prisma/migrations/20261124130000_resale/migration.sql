-- At-cost resale of unopened items from full baskets (2026-11-24).
-- CreateEnum
CREATE TYPE "ResaleAudience" AS ENUM ('CONTACTS', 'NEARBY', 'BOTH');

-- CreateEnum
CREATE TYPE "ResaleReservationStatus" AS ENUM ('RESERVED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "PackItem" ADD COLUMN     "chilled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ResaleListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "audience" "ResaleAudience" NOT NULL,
    "spot" TEXT NOT NULL,
    "city" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResaleListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResaleReservation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "ResaleReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResaleReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResaleListing_memberId_itemId_idx" ON "ResaleListing"("memberId", "itemId");

-- CreateIndex
CREATE INDEX "ResaleListing_lat_lng_idx" ON "ResaleListing"("lat", "lng");

-- CreateIndex
CREATE INDEX "ResaleListing_sellerId_idx" ON "ResaleListing"("sellerId");

-- CreateIndex
CREATE INDEX "ResaleReservation_listingId_status_idx" ON "ResaleReservation"("listingId", "status");

-- CreateIndex
CREATE INDEX "ResaleReservation_buyerId_idx" ON "ResaleReservation"("buyerId");

-- CreateIndex
CREATE INDEX "ResaleReservation_status_expiresAt_idx" ON "ResaleReservation"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "PackMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PackItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleReservation" ADD CONSTRAINT "ResaleReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ResaleListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleReservation" ADD CONSTRAINT "ResaleReservation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Units are whole and never negative; a price is above zero.
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_qty_check" CHECK ("qty" >= 0);
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_unitPrice_check" CHECK ("unitPrice" > 0);
ALTER TABLE "ResaleReservation" ADD CONSTRAINT "ResaleReservation_qty_check" CHECK ("qty" > 0);
