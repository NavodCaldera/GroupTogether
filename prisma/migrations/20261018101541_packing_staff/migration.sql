-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PACKER';

-- CreateTable
CREATE TABLE "Packing" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "packedById" TEXT NOT NULL,
    "packedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOverById" TEXT,
    "handedOverAt" TIMESTAMP(3),

    CONSTRAINT "Packing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingCheck" (
    "id" TEXT NOT NULL,
    "packingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Packing_cartId_key" ON "Packing"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingCheck_packingId_userId_key" ON "PackingCheck"("packingId", "userId");

-- AddForeignKey
ALTER TABLE "Packing" ADD CONSTRAINT "Packing_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "GroupCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packing" ADD CONSTRAINT "Packing_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packing" ADD CONSTRAINT "Packing_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingCheck" ADD CONSTRAINT "PackingCheck_packingId_fkey" FOREIGN KEY ("packingId") REFERENCES "Packing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingCheck" ADD CONSTRAINT "PackingCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
