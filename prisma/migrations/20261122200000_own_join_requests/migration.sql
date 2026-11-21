-- DEC-028: own baskets are joined by request; the owner accepts or declines.
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "OwnJoinRequest" (
    "id" TEXT NOT NULL,
    "basketId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "OwnJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnJoinRequest_basketId_buyerId_key" ON "OwnJoinRequest"("basketId", "buyerId");
CREATE INDEX "OwnJoinRequest_buyerId_idx" ON "OwnJoinRequest"("buyerId");

ALTER TABLE "OwnJoinRequest" ADD CONSTRAINT "OwnJoinRequest_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "Basket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnJoinRequest" ADD CONSTRAINT "OwnJoinRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
