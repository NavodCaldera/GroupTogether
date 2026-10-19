-- AlterTable
ALTER TABLE "StockOffer" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT;

-- AddForeignKey
ALTER TABLE "StockOffer" ADD CONSTRAINT "StockOffer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
