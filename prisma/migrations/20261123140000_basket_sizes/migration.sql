-- A basket is 5, 10 or 15 families, chosen when it starts; each size has a discount % on the pack.
ALTER TABLE "PackGroup" ADD COLUMN "size" INTEGER, ADD COLUMN "price" DECIMAL(14,2);
UPDATE "PackGroup" g
SET "size" = CASE WHEN v."groupSize" <= 5 THEN 5 WHEN v."groupSize" <= 10 THEN 10 ELSE 15 END,
    "price" = v."pricePerFamily"
FROM "PackVersion" v WHERE v."id" = g."versionId";
ALTER TABLE "PackGroup" ALTER COLUMN "size" SET NOT NULL, ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "PackGroup" ADD CONSTRAINT "PackGroup_size_check" CHECK ("size" IN (5, 10, 15));

ALTER TABLE "PackVersion" DROP CONSTRAINT "PackVersion_groupSize_check";
ALTER TABLE "PackVersion" DROP COLUMN "groupSize",
  ADD COLUMN "discount5" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount10" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount15" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "PackVersion" ADD CONSTRAINT "PackVersion_discount_check"
  CHECK ("discount5" BETWEEN 0 AND 90 AND "discount10" BETWEEN 0 AND 90 AND "discount15" BETWEEN 0 AND 90);

-- When a spot's payment was confirmed ("bought today" on the company page).
ALTER TABLE "PackMember" ADD COLUMN "paidAt" TIMESTAMP(3);
UPDATE "PackMember" SET "paidAt" = "joinedAt" WHERE "status" = 'PAID';
