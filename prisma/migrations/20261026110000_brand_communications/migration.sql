ALTER TYPE "OfferStatus" ADD VALUE 'CHANGES_REQUESTED';
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
ALTER TABLE "StockOffer" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "approvedRevision" INTEGER;
ALTER TABLE "GiftOrder" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "GiftSettlement" ADD COLUMN "receivedAt" TIMESTAMP(3), ADD COLUMN "queryOpen" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "BrandConversation" (
 "id" TEXT PRIMARY KEY, "brandId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "contextKey" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL,
 "resolved" BOOLEAN NOT NULL DEFAULT false, "lastHumanSide" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BrandConversation_brandId_updatedAt_idx" ON "BrandConversation"("brandId","updatedAt");
CREATE TABLE "BrandMessage" (
 "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "BrandConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "body" TEXT NOT NULL, "internal" BOOLEAN NOT NULL DEFAULT false, "system" BOOLEAN NOT NULL DEFAULT false,
 "requestKey" TEXT UNIQUE, "notifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BrandMessage_conversationId_createdAt_idx" ON "BrandMessage"("conversationId","createdAt");
CREATE INDEX "BrandMessage_notifiedAt_idx" ON "BrandMessage"("notifiedAt");
CREATE TABLE "BrandConversationRead" (
 "conversationId" TEXT NOT NULL REFERENCES "BrandConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "readAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("conversationId","userId")
);
CREATE TABLE "BrandOfferRevision" (
 "id" TEXT PRIMARY KEY, "offerId" TEXT NOT NULL REFERENCES "StockOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "status" "OfferStatus" NOT NULL DEFAULT 'IN_REVIEW',
 "submittedById" TEXT NOT NULL, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "supersededAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("offerId","version")
);
INSERT INTO "BrandOfferRevision" ("id","offerId","version","snapshot","status","submittedById","reviewedAt","createdAt")
 SELECT 'legacy-revision-' || o.id, o.id, 1,
 jsonb_build_object('name',o.name,'description',o.description,'actualPrice',o."actualPrice"::text,'offerPrice',o."offerPrice"::text,'pieces',o.pieces,'productUrl',o."productUrl",'photoKey',o."photoKey",'photoType',o."photoType",'packDetails',o."packDetails",'packSize',o."packSize",'dispatchDays',o."dispatchDays",'hasExpiry',o."hasExpiry",'expiryDate',o."expiryDate",'minShelfLifeDays',o."minShelfLifeDays"),
 o.status, o."sellerId", o."decidedAt", o."createdAt"
 FROM "StockOffer" o JOIN "User" u ON u.id=o."sellerId" WHERE u."isBrand"=true;
UPDATE "StockOffer" SET "approvedRevision"=1 WHERE status='ACCEPTED' AND "sellerId" IN (SELECT id FROM "User" WHERE "isBrand"=true);
-- Preserve existing review notes as imported history without notifying brands again.
INSERT INTO "BrandConversation" ("id","brandId","kind","subjectId","contextKey","title","createdAt","updatedAt")
 SELECT 'legacy-thread-' || o.id,o."sellerId",'PRODUCT',o.id,o."sellerId" || ':PRODUCT:' || o.id,o.name,o."createdAt",COALESCE(o."decidedAt",o."createdAt")
 FROM "StockOffer" o JOIN "User" u ON u.id=o."sellerId" WHERE u."isBrand"=true;
INSERT INTO "BrandMessage" ("id","conversationId","authorId","body","system","requestKey","notifiedAt","createdAt")
 SELECT 'legacy-message-' || o.id,'legacy-thread-' || o.id,o."sellerId",'Imported product record. Status: ' || o.status::text || COALESCE('. Legacy review note (original reviewer not recorded): ' || o.note,''),true,'legacy-product:' || o.id,CURRENT_TIMESTAMP,COALESCE(o."decidedAt",o."createdAt")
 FROM "StockOffer" o JOIN "User" u ON u.id=o."sellerId" WHERE u."isBrand"=true;
