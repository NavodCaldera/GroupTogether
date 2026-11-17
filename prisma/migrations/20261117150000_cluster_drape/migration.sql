-- Cluster drapes: each garment size cloth-simulated on each standard shape's body (DEC-021)
-- CreateTable
CREATE TABLE "ClusterDrape" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "garmentUrl" TEXT NOT NULL,
    "fitDataHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterDrape_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClusterDrape_productId_archetypeId_size_key" ON "ClusterDrape"("productId", "archetypeId", "size");

-- AddForeignKey
ALTER TABLE "ClusterDrape" ADD CONSTRAINT "ClusterDrape_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterDrape" ADD CONSTRAINT "ClusterDrape_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "BodyArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;
