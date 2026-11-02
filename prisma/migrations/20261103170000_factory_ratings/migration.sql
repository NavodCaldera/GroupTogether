-- CreateTable
CREATE TABLE "FactoryRating" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FactoryRating_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "FactoryRating_factoryId_createdAt_idx" ON "FactoryRating"("factoryId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "FactoryRating_cartId_userId_key" ON "FactoryRating"("cartId", "userId");
-- AddForeignKey
ALTER TABLE "FactoryRating" ADD CONSTRAINT "FactoryRating_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "GroupCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactoryRating" ADD CONSTRAINT "FactoryRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FactoryRating" ADD CONSTRAINT "FactoryRating_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
