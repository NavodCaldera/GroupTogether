-- AlterTable
ALTER TABLE "GroupCart" ADD COLUMN "factoryPackedAt" TIMESTAMP(3),
ADD COLUMN "factoryPackedById" TEXT;

-- AddForeignKey
ALTER TABLE "GroupCart" ADD CONSTRAINT "GroupCart_factoryPackedById_fkey" FOREIGN KEY ("factoryPackedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
