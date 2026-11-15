-- CreateEnum
CREATE TYPE "BodyModelStatus" AS ENUM ('BUILDING', 'CHECK', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "BodyFitJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "BodyProfile" ADD COLUMN     "bodyFileKey" TEXT,
ADD COLUMN     "bodyFit" JSONB,
ADD COLUMN     "bodyFitAt" TIMESTAMP(3),
ADD COLUMN     "bodyStatus" "BodyModelStatus";

-- CreateTable
CREATE TABLE "BodyFitJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BodyFitJobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyFitJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyFitJob_status_createdAt_idx" ON "BodyFitJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BodyFitJob_userId_createdAt_idx" ON "BodyFitJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BodyFitJob" ADD CONSTRAINT "BodyFitJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

