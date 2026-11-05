ALTER TABLE "FactoryProfile" RENAME COLUMN "removedBy" TO "removedById";
CREATE TABLE "QualityNotice" (id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,title TEXT NOT NULL,body TEXT NOT NULL,href TEXT NOT NULL,"deliveredAt" TIMESTAMP(3));
CREATE INDEX "QualityNotice_deliveredAt_idx" ON "QualityNotice"("deliveredAt");
