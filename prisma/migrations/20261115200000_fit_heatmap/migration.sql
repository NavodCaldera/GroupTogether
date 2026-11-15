-- DEC-020: personalized fit heatmap (fit data on products, body profiles, simulation results, feedback).

-- CreateEnum
CREATE TYPE "FitRegion" AS ENUM ('CHEST', 'WAIST', 'HIP', 'UPPER_ARM', 'THIGH', 'SHOULDER', 'TORSO');

-- CreateEnum
CREATE TYPE "MotionClip" AS ENUM ('WALK', 'RUN', 'REACH', 'SIT');

-- CreateEnum
CREATE TYPE "FitFeedbackVerdict" AS ENUM ('TOO_TIGHT', 'GOOD', 'TOO_LOOSE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "breathability" INTEGER,
ADD COLUMN     "careNotes" TEXT,
ADD COLUMN     "fabricStretchPct" INTEGER,
ADD COLUMN     "fitApprovedAt" TIMESTAMP(3),
ADD COLUMN     "fitApprovedById" TEXT,
ADD COLUMN     "gsm" INTEGER,
ADD COLUMN     "sizeChart" JSONB,
ADD COLUMN     "thermalMaxC" INTEGER,
ADD COLUMN     "thermalMinC" INTEGER,
ADD COLUMN     "weave" TEXT;

-- CreateTable
CREATE TABLE "BodyArchetype" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyArchetype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "measurements" JSONB NOT NULL,
    "gender" TEXT,
    "ageBand" TEXT,
    "archetypeId" TEXT,
    "captureMeta" JSONB,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "motion" "MotionClip" NOT NULL,
    "gltfUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentRegionTension" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "archetypeId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "region" "FitRegion" NOT NULL,
    "baseTension" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "GarmentRegionTension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "purchasedSize" TEXT NOT NULL,
    "verdict" "FitFeedbackVerdict" NOT NULL,
    "regionNotes" JSONB,
    "recommended" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BodyArchetype_name_key" ON "BodyArchetype"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BodyProfile_userId_key" ON "BodyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FitAsset_productId_archetypeId_motion_key" ON "FitAsset"("productId", "archetypeId", "motion");

-- CreateIndex
CREATE INDEX "GarmentRegionTension_productId_archetypeId_idx" ON "GarmentRegionTension"("productId", "archetypeId");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentRegionTension_productId_archetypeId_size_region_key" ON "GarmentRegionTension"("productId", "archetypeId", "size", "region");

-- CreateIndex
CREATE UNIQUE INDEX "FitFeedback_orderLineId_key" ON "FitFeedback"("orderLineId");

-- CreateIndex
CREATE INDEX "FitFeedback_productId_idx" ON "FitFeedback"("productId");

-- AddForeignKey
ALTER TABLE "BodyProfile" ADD CONSTRAINT "BodyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyProfile" ADD CONSTRAINT "BodyProfile_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "BodyArchetype"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitAsset" ADD CONSTRAINT "FitAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitAsset" ADD CONSTRAINT "FitAsset_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "BodyArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentRegionTension" ADD CONSTRAINT "GarmentRegionTension_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentRegionTension" ADD CONSTRAINT "GarmentRegionTension_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "BodyArchetype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitFeedback" ADD CONSTRAINT "FitFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitFeedback" ADD CONSTRAINT "FitFeedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
