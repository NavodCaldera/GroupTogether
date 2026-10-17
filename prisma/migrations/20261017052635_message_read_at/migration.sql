-- AlterTable
ALTER TABLE "CartMessage" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CartMessage_participantId_readAt_idx" ON "CartMessage"("participantId", "readAt");
