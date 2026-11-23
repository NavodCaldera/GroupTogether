-- CreateEnum
CREATE TYPE "PackGroupStatus" AS ENUM ('PENDING', 'OPEN', 'FULL', 'CLOSED');

-- CreateEnum
CREATE TYPE "PackMemberStatus" AS ENUM ('HELD', 'PAID');

-- CreateEnum
CREATE TYPE "PackDeliveryStatus" AS ENUM ('ORDERED', 'DISPATCHED', 'RECEIVED');

-- AlterEnum
ALTER TYPE "TokenKind" ADD VALUE 'PACK_REFUND';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'PACK_JOIN';

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "packMemberId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sellerId" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardPack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StandardPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackVersion" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "pricePerFamily" DECIMAL(14,2) NOT NULL,
    "groupSize" INTEGER NOT NULL,
    "householdSize" INTEGER,
    "commissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackGroup" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "status" "PackGroupStatus" NOT NULL DEFAULT 'PENDING',
    "joined" INTEGER NOT NULL DEFAULT 0,
    "extensions" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PackMemberStatus" NOT NULL DEFAULT 'HELD',
    "heldUntil" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackDelivery" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "families" INTEGER NOT NULL,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "status" "PackDeliveryStatus" NOT NULL DEFAULT 'ORDERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "PackDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContact" (
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("userId","phone")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_categoryId_idx" ON "Company"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "StandardPack_slug_key" ON "StandardPack"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PackVersion_packId_version_key" ON "PackVersion"("packId", "version");

-- CreateIndex
CREATE INDEX "PackGroup_versionId_status_idx" ON "PackGroup"("versionId", "status");

-- CreateIndex
CREATE INDEX "PackGroup_status_closesAt_idx" ON "PackGroup"("status", "closesAt");

-- CreateIndex
CREATE INDEX "PackGroup_lat_lng_idx" ON "PackGroup"("lat", "lng");

-- CreateIndex
CREATE INDEX "PackMember_userId_idx" ON "PackMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PackMember_groupId_userId_key" ON "PackMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PackDelivery_groupId_key" ON "PackDelivery"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_packMemberId_key" ON "PaymentAttempt"("packMemberId");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_packMemberId_fkey" FOREIGN KEY ("packMemberId") REFERENCES "PackMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardPack" ADD CONSTRAINT "StandardPack_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackVersion" ADD CONSTRAINT "PackVersion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StandardPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItem" ADD CONSTRAINT "PackItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackGroup" ADD CONSTRAINT "PackGroup_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PackVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackGroup" ADD CONSTRAINT "PackGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackMember" ADD CONSTRAINT "PackMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PackGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackMember" ADD CONSTRAINT "PackMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackDelivery" ADD CONSTRAINT "PackDelivery_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PackGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackDelivery" ADD CONSTRAINT "PackDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A basket holds 5 to 15 families and never more spots than that (DEC-030)
ALTER TABLE "PackVersion" ADD CONSTRAINT "PackVersion_groupSize_check" CHECK ("groupSize" BETWEEN 5 AND 15);
ALTER TABLE "PackVersion" ADD CONSTRAINT "PackVersion_commissionPct_check" CHECK ("commissionPct" >= 0 AND "commissionPct" < 100);
ALTER TABLE "PackGroup" ADD CONSTRAINT "PackGroup_joined_check" CHECK ("joined" >= 0 AND "extensions" BETWEEN 0 AND 2);
