-- Deep Fit Test: a garment cloth-simulated on the buyer's own body (DEC-021)
-- CreateTable
CREATE TABLE "DeepFitJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "BodyFitJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "bodyFitAt" TIMESTAMP(3) NOT NULL,
    "fitDataHash" TEXT NOT NULL,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepFitJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeepFitJob_status_createdAt_idx" ON "DeepFitJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeepFitJob_userId_createdAt_idx" ON "DeepFitJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeepFitJob" ADD CONSTRAINT "DeepFitJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepFitJob" ADD CONSTRAINT "DeepFitJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
