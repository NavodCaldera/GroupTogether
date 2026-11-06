-- CreateEnum
CREATE TYPE "FaultConfirmedBy" AS ENUM ('FACTORY', 'ADMIN');

-- CreateEnum
CREATE TYPE "HoldDecision" AS ENUM ('CONTINUE', 'REMOVE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hiddenByHoldId" TEXT;

-- CreateTable
CREATE TABLE "FactoryFault" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" "FaultConfirmedBy" NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelNote" VARCHAR(2000),

    CONSTRAINT "FactoryFault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaultHold" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanedAt" TIMESTAMP(3),
    "decision" "HoldDecision",
    "decisionNote" VARCHAR(2000),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "FaultHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaultHoldMessage" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaultHoldMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactoryFault_returnId_key" ON "FactoryFault"("returnId");

-- CreateIndex
CREATE INDEX "FactoryFault_factoryId_recordedAt_idx" ON "FactoryFault"("factoryId", "recordedAt");

-- CreateIndex
CREATE INDEX "FaultHold_factoryId_openedAt_idx" ON "FaultHold"("factoryId", "openedAt");

-- CreateIndex
CREATE INDEX "FaultHoldMessage_holdId_createdAt_idx" ON "FaultHoldMessage"("holdId", "createdAt");

-- CreateIndex
CREATE INDEX "FaultHoldMessage_authorId_createdAt_idx" ON "FaultHoldMessage"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_hiddenByHoldId_fkey" FOREIGN KEY ("hiddenByHoldId") REFERENCES "FaultHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryFault" ADD CONSTRAINT "FactoryFault_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryFault" ADD CONSTRAINT "FactoryFault_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultHold" ADD CONSTRAINT "FaultHold_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultHoldMessage" ADD CONSTRAINT "FaultHoldMessage_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "FaultHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultHoldMessage" ADD CONSTRAINT "FaultHoldMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FaultHold_one_open" ON "FaultHold" ("factoryId") WHERE "decidedAt" IS NULL;
