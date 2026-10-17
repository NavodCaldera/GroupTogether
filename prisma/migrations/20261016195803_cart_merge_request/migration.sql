-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CartMergeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromCartId" TEXT,
    "toCartId" TEXT NOT NULL,
    "status" "MergeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CartMergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CartMergeRequest_toCartId_status_idx" ON "CartMergeRequest"("toCartId", "status");

-- CreateIndex
CREATE INDEX "CartMergeRequest_userId_status_idx" ON "CartMergeRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "CartMergeRequest" ADD CONSTRAINT "CartMergeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartMergeRequest" ADD CONSTRAINT "CartMergeRequest_fromCartId_fkey" FOREIGN KEY ("fromCartId") REFERENCES "GroupCart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartMergeRequest" ADD CONSTRAINT "CartMergeRequest_toCartId_fkey" FOREIGN KEY ("toCartId") REFERENCES "GroupCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One pending request per buyer (Prisma cannot express a partial unique index)
CREATE UNIQUE INDEX "CartMergeRequest_one_pending_per_user" ON "CartMergeRequest"("userId") WHERE "status" = 'PENDING';
