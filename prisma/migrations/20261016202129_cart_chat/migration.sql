-- CreateTable
CREATE TABLE "CartMessage" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CartMessage_cartId_participantId_createdAt_idx" ON "CartMessage"("cartId", "participantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CartMessage" ADD CONSTRAINT "CartMessage_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "GroupCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartMessage" ADD CONSTRAINT "CartMessage_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartMessage" ADD CONSTRAINT "CartMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
