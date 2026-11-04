-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('WAITING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FactoryDocKind" AS ENUM ('BR_CERT', 'NIC_PHOTO', 'FACTORY_PHOTO');

-- CreateEnum
CREATE TYPE "FactoryStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "FactoryApplication" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "brNumber" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerNic" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranch" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'WAITING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "visitDate" TIMESTAMP(3),
    "visitNotes" TEXT,
    "inviteId" TEXT,
    "factoryUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactoryApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "FactoryDocKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,

    CONSTRAINT "FactoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "FactoryInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,

    CONSTRAINT "AgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementAcceptance" (
    "id" TEXT NOT NULL,
    "factoryUserId" TEXT NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "AgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryProfile" (
    "factoryUserId" TEXT NOT NULL,
    "status" "FactoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "complianceDueAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "removalReason" TEXT,
    "earningsHeld" BOOLEAN NOT NULL DEFAULT false,
    "earningsHeldNote" TEXT,

    CONSTRAINT "FactoryProfile_pkey" PRIMARY KEY ("factoryUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactoryApplication_inviteId_key" ON "FactoryApplication"("inviteId");

-- CreateIndex
CREATE INDEX "FactoryApplication_brNumber_idx" ON "FactoryApplication"("brNumber");

-- CreateIndex
CREATE INDEX "FactoryApplication_ownerNic_idx" ON "FactoryApplication"("ownerNic");

-- CreateIndex
CREATE INDEX "FactoryApplication_status_createdAt_idx" ON "FactoryApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FactoryApplication_factoryUserId_idx" ON "FactoryApplication"("factoryUserId");

-- CreateIndex
CREATE INDEX "FactoryDocument_applicationId_idx" ON "FactoryDocument"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryInvite_token_key" ON "FactoryInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementVersion_version_key" ON "AgreementVersion"("version");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_factoryUserId_acceptedAt_idx" ON "AgreementAcceptance"("factoryUserId", "acceptedAt");

-- CreateIndex
CREATE INDEX "AgreementAcceptance_remindedAt_endsAt_idx" ON "AgreementAcceptance"("remindedAt", "endsAt");

-- AddForeignKey
ALTER TABLE "FactoryApplication" ADD CONSTRAINT "FactoryApplication_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryApplication" ADD CONSTRAINT "FactoryApplication_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "FactoryInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryApplication" ADD CONSTRAINT "FactoryApplication_factoryUserId_fkey" FOREIGN KEY ("factoryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryDocument" ADD CONSTRAINT "FactoryDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FactoryApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryInvite" ADD CONSTRAINT "FactoryInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementVersion" ADD CONSTRAINT "AgreementVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_factoryUserId_fkey" FOREIGN KEY ("factoryUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AgreementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryProfile" ADD CONSTRAINT "FactoryProfile_factoryUserId_fkey" FOREIGN KEY ("factoryUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep legacy factory accounts selling for thirty days; no stock or paid orders change.
INSERT INTO "FactoryProfile" ("factoryUserId", "status", "complianceDueAt", "earningsHeld")
SELECT "id", 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '30 days', false
FROM "User" WHERE "role" = 'SELLER' AND "factoryId" IS NULL;
