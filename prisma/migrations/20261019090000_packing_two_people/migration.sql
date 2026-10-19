-- Two-person packing (product owner, 2026-10-19): the first person checks and gathers the items,
-- a different person rechecks and packs them. The old "packed by" becomes "gathered by", and the
-- earliest check by someone else becomes "rechecked and packed by".
ALTER TABLE "Packing" RENAME COLUMN "packedById" TO "gatheredById";
ALTER TABLE "Packing" RENAME COLUMN "packedAt" TO "gatheredAt";
ALTER TABLE "Packing" RENAME CONSTRAINT "Packing_packedById_fkey" TO "Packing_gatheredById_fkey";
ALTER TABLE "Packing" ADD COLUMN "packedById" TEXT, ADD COLUMN "packedAt" TIMESTAMP(3);

UPDATE "Packing" p
SET "packedById" = c."userId", "packedAt" = c."createdAt"
FROM (
  SELECT DISTINCT ON (k."packingId") k."packingId", k."userId", k."createdAt"
  FROM "PackingCheck" k
  JOIN "Packing" q ON q."id" = k."packingId"
  WHERE k."userId" <> q."gatheredById"
  ORDER BY k."packingId", k."createdAt"
) c
WHERE c."packingId" = p."id";

-- DropTable
DROP TABLE "PackingCheck";

-- AddForeignKey
ALTER TABLE "Packing" ADD CONSTRAINT "Packing_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
