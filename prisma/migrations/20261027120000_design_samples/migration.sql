CREATE TYPE "SampleStatus" AS ENUM ('REQUESTED','QUOTED','ACCEPTED','DISPATCHED','DELIVERED','DECLINED','CANCELLED');
CREATE TABLE "SampleRequest" (
 "id" TEXT NOT NULL, "cartId" TEXT NOT NULL, "productId" TEXT NOT NULL, "requesterId" TEXT NOT NULL,
 "status" "SampleStatus" NOT NULL DEFAULT 'REQUESTED', "designNote" TEXT NOT NULL DEFAULT '',
 "recipientName" TEXT NOT NULL, "address" TEXT NOT NULL, "city" TEXT NOT NULL, "phone" TEXT NOT NULL,
 "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL, "transportFee" DECIMAL(14,2),
 "courier" TEXT, "tracking" TEXT, "note" TEXT, "handledById" TEXT, "acceptedAt" TIMESTAMP(3),
 "dispatchedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SampleRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SampleRequest_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "GroupCart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SampleRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SampleRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SampleRequest_transportFee_check" CHECK ("transportFee" IS NULL OR "transportFee" >= 0)
);
CREATE INDEX "SampleRequest_cartId_createdAt_idx" ON "SampleRequest"("cartId","createdAt");
CREATE INDEX "SampleRequest_status_createdAt_idx" ON "SampleRequest"("status","createdAt");
