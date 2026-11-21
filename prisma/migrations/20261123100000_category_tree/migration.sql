-- Category tree, attributes and Product.categoryId / Product.specs (DEC-029, phase 2).
-- The old enum "Category" is renamed so the new table can take its name (they share a namespace).
ALTER TYPE "Category" RENAME TO "LegacyCategory";

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('TEXT', 'NUMBER', 'ENUM', 'BOOL');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionPct" DECIMAL(5,2),
    "minCommission" DECIMAL(14,2),
    "features" TEXT[],
    "needsApproval" BOOLEAN NOT NULL DEFAULT false,
    "returnReasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDef" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AttributeType" NOT NULL,
    "unit" TEXT,

    CONSTRAINT "AttributeDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "categoryId" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isVariantAxis" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("categoryId","defId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "Category_path_idx" ON "Category"("path");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDef_key_key" ON "AttributeDef"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_defId_value_key" ON "AttributeOption"("defId", "value");

-- CreateIndex
CREATE INDEX "CategoryAttribute_defId_idx" ON "CategoryAttribute"("defId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_defId_fkey" FOREIGN KEY ("defId") REFERENCES "AttributeDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_defId_fkey" FOREIGN KEY ("defId") REFERENCES "AttributeDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The starting tree: the same rows as seedCategories(), seedAttributes() and
-- seedCategoryAttributes() in src/lib/categories.ts (a unit test keeps them equal).
-- tree:start
INSERT INTO "Category" ("id", "parentId", "slug", "name", "path", "sortOrder", "features", "returnReasons", "updatedAt") VALUES
  ('cat_clothing', NULL, 'clothing', 'Clothing', '/cat_clothing/', 0, ARRAY['fit', 'materials', 'audience'], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men', 'cat_clothing', 'clothing/men', 'Men', '/cat_clothing/cat_clothing_men/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_tshirts', 'cat_clothing_men', 'clothing/men/tshirts', 'T-shirts', '/cat_clothing/cat_clothing_men/cat_clothing_men_tshirts/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_shirts', 'cat_clothing_men', 'clothing/men/shirts', 'Shirts', '/cat_clothing/cat_clothing_men/cat_clothing_men_shirts/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_trousers', 'cat_clothing_men', 'clothing/men/trousers', 'Trousers', '/cat_clothing/cat_clothing_men/cat_clothing_men_trousers/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_jeans', 'cat_clothing_men', 'clothing/men/jeans', 'Jeans', '/cat_clothing/cat_clothing_men/cat_clothing_men_jeans/', 3, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_shorts', 'cat_clothing_men', 'clothing/men/shorts', 'Shorts', '/cat_clothing/cat_clothing_men/cat_clothing_men_shorts/', 4, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_men_jackets', 'cat_clothing_men', 'clothing/men/jackets', 'Jackets & hoodies', '/cat_clothing/cat_clothing_men/cat_clothing_men_jackets/', 5, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women', 'cat_clothing', 'clothing/women', 'Women', '/cat_clothing/cat_clothing_women/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women_tops', 'cat_clothing_women', 'clothing/women/tops', 'T-shirts & tops', '/cat_clothing/cat_clothing_women/cat_clothing_women_tops/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women_dresses', 'cat_clothing_women', 'clothing/women/dresses', 'Dresses', '/cat_clothing/cat_clothing_women/cat_clothing_women_dresses/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women_skirts', 'cat_clothing_women', 'clothing/women/skirts', 'Skirts', '/cat_clothing/cat_clothing_women/cat_clothing_women_skirts/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women_trousers', 'cat_clothing_women', 'clothing/women/trousers', 'Trousers & jeans', '/cat_clothing/cat_clothing_women/cat_clothing_women_trousers/', 3, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_women_jackets', 'cat_clothing_women', 'clothing/women/jackets', 'Jackets & hoodies', '/cat_clothing/cat_clothing_women/cat_clothing_women_jackets/', 4, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_girl', 'cat_clothing', 'clothing/girl', 'Girl', '/cat_clothing/cat_clothing_girl/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_girl_tops', 'cat_clothing_girl', 'clothing/girl/tops', 'T-shirts & tops', '/cat_clothing/cat_clothing_girl/cat_clothing_girl_tops/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_girl_dresses', 'cat_clothing_girl', 'clothing/girl/dresses', 'Dresses & skirts', '/cat_clothing/cat_clothing_girl/cat_clothing_girl_dresses/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_girl_bottoms', 'cat_clothing_girl', 'clothing/girl/bottoms', 'Trousers & shorts', '/cat_clothing/cat_clothing_girl/cat_clothing_girl_bottoms/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_girl_jackets', 'cat_clothing_girl', 'clothing/girl/jackets', 'Jackets & hoodies', '/cat_clothing/cat_clothing_girl/cat_clothing_girl_jackets/', 3, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_boy', 'cat_clothing', 'clothing/boy', 'Boy', '/cat_clothing/cat_clothing_boy/', 3, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_boy_tshirts', 'cat_clothing_boy', 'clothing/boy/tshirts', 'T-shirts & shirts', '/cat_clothing/cat_clothing_boy/cat_clothing_boy_tshirts/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_boy_bottoms', 'cat_clothing_boy', 'clothing/boy/bottoms', 'Trousers & shorts', '/cat_clothing/cat_clothing_boy/cat_clothing_boy_bottoms/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_boy_jackets', 'cat_clothing_boy', 'clothing/boy/jackets', 'Jackets & hoodies', '/cat_clothing/cat_clothing_boy/cat_clothing_boy_jackets/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_kid', 'cat_clothing', 'clothing/kid', 'Kid', '/cat_clothing/cat_clothing_kid/', 4, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_kid_tops', 'cat_clothing_kid', 'clothing/kid/tops', 'Tops', '/cat_clothing/cat_clothing_kid/cat_clothing_kid_tops/', 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_kid_bottoms', 'cat_clothing_kid', 'clothing/kid/bottoms', 'Bottoms', '/cat_clothing/cat_clothing_kid/cat_clothing_kid_bottoms/', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_clothing_kid_sets', 'cat_clothing_kid', 'clothing/kid/sets', 'Sets & rompers', '/cat_clothing/cat_clothing_kid/cat_clothing_kid_sets/', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_shoes', NULL, 'shoes', 'Shoes', '/cat_shoes/', 1, ARRAY['fit', 'materials', 'audience'], ARRAY[]::TEXT[], CURRENT_TIMESTAMP);

INSERT INTO "AttributeDef" ("id", "key", "label", "type") VALUES
  ('attr_size', 'size', 'Size', 'ENUM'),
  ('attr_colour', 'colour', 'Colour', 'TEXT');

INSERT INTO "AttributeOption" ("id", "defId", "value", "label", "sortOrder") VALUES
  ('attr_size_s', 'attr_size', 'S', 'S', 0),
  ('attr_size_m', 'attr_size', 'M', 'M', 1),
  ('attr_size_l', 'attr_size', 'L', 'L', 2),
  ('attr_size_xl', 'attr_size', 'XL', 'XL', 3),
  ('attr_size_xxl', 'attr_size', 'XXL', 'XXL', 4),
  ('attr_size_28', 'attr_size', '28', '28', 5),
  ('attr_size_30', 'attr_size', '30', '30', 6),
  ('attr_size_32', 'attr_size', '32', '32', 7),
  ('attr_size_34', 'attr_size', '34', '34', 8),
  ('attr_size_36', 'attr_size', '36', '36', 9),
  ('attr_size_2-3y', 'attr_size', '2-3Y', '2-3Y', 10),
  ('attr_size_3-4y', 'attr_size', '3-4Y', '3-4Y', 11),
  ('attr_size_4-5y', 'attr_size', '4-5Y', '4-5Y', 12),
  ('attr_size_5-6y', 'attr_size', '5-6Y', '5-6Y', 13),
  ('attr_size_6-7y', 'attr_size', '6-7Y', '6-7Y', 14),
  ('attr_size_8-9y', 'attr_size', '8-9Y', '8-9Y', 15),
  ('attr_size_10-11y', 'attr_size', '10-11Y', '10-11Y', 16),
  ('attr_size_12-13y', 'attr_size', '12-13Y', '12-13Y', 17);

INSERT INTO "CategoryAttribute" ("categoryId", "defId", "required", "isVariantAxis", "filterable", "sortOrder") VALUES
  ('cat_clothing', 'attr_size', true, true, true, 0),
  ('cat_clothing', 'attr_colour', false, true, true, 1);
-- tree:end

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "specs" JSONB NOT NULL DEFAULT '{}';

-- Every product gets the leaf for its kind ("men-shirts" -> clothing/men/shirts); without a known
-- kind, a stored SHOES product goes to Shoes and everything else to the Clothing root.
-- backfill:start
UPDATE "Product" p SET "categoryId" = COALESCE(
  (SELECT c."id" FROM "Category" c
    WHERE p."kind" LIKE '%-%'
      AND c."slug" LIKE 'clothing/%/%'
      AND c."slug" = 'clothing/' || regexp_replace(p."kind", '^([a-z]+)-', '\1/')),
  CASE WHEN p."category" = 'SHOES' THEN 'cat_shoes' ELSE 'cat_clothing' END
) WHERE p."categoryId" IS NULL;
-- backfill:end

ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_specs_idx" ON "Product" USING GIN ("specs" jsonb_path_ops);

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
