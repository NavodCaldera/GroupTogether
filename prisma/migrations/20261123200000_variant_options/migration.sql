-- DEC-029 phase 3: variants carry any options, not only size and colour.
-- size and colour stay (and keep being written) until a later phase drops them.

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "heightMm" INTEGER,
ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lengthMm" INTEGER,
ADD COLUMN     "optionKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "options" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "weightG" INTEGER,
ADD COLUMN     "widthMm" INTEGER;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "variantLabel" TEXT NOT NULL DEFAULT '';

-- Backfill, matching src/lib/variant-options.ts: empty values are left out; the key is the
-- sorted ("colour" before "size") lower-case trimmed key=value pairs joined by "|"; the label is
-- the size, then the colour, joined by " / ".
UPDATE "Variant" SET
  "options" =
    (CASE WHEN btrim("size") <> '' THEN jsonb_build_object('size', btrim("size")) ELSE '{}'::jsonb END)
    || (CASE WHEN btrim("colour") <> '' THEN jsonb_build_object('colour', btrim("colour")) ELSE '{}'::jsonb END),
  "optionKey" = concat_ws('|',
    CASE WHEN btrim("colour") <> '' THEN 'colour=' || lower(btrim("colour")) END,
    CASE WHEN btrim("size") <> '' THEN 'size=' || lower(btrim("size")) END),
  "label" = concat_ws(' / ',
    CASE WHEN btrim("size") <> '' THEN btrim("size") END,
    CASE WHEN btrim("colour") <> '' THEN btrim("colour") END);

UPDATE "OrderLine" l SET "variantLabel" = v."label"
FROM "Variant" v WHERE v."id" = l."variantId";

-- Every write now sets these through the helper
ALTER TABLE "Variant" ALTER COLUMN "options" DROP DEFAULT,
ALTER COLUMN "optionKey" DROP DEFAULT,
ALTER COLUMN "label" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Variant_productId_optionKey_key" ON "Variant"("productId", "optionKey");
