-- General return and report reasons for any product (DEC-029). No value is removed, so existing
-- rows keep their reason: DAMAGED, WRONG_ITEM and OTHER stay general, STITCHING and SIZE become
-- clothing reasons offered only where the category lists them.
ALTER TYPE "ReportReason" ADD VALUE IF NOT EXISTS 'NOT_AS_DESCRIBED';
ALTER TYPE "ReportReason" ADD VALUE IF NOT EXISTS 'MISSING_PARTS';
ALTER TYPE "ReportReason" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Received condition for any product: tags on or seal unbroken.
ALTER TABLE "ReturnRequest" RENAME COLUMN "unusedWithTags" TO "unusedSealed";

-- The clothing reasons on the Clothing and Shoes roots; their subtrees inherit them.
UPDATE "Category"
SET "returnReasons" = ARRAY['SIZE', 'COLOUR', 'STITCHING', 'QUALITY_FEEL', 'MATERIAL']::TEXT[],
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('cat_clothing', 'cat_shoes');
