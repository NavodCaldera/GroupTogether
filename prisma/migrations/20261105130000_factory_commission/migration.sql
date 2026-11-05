ALTER TABLE "Settings" ADD COLUMN "commissionPerPiece" DECIMAL(14,2) NOT NULL DEFAULT 100;
ALTER TABLE "Product" ADD COLUMN "factoryPrice" DECIMAL(14,2), ADD COLUMN "commission" DECIMAL(14,2);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Product" p JOIN "User" u ON u.id = p."sellerId" WHERE NOT u."isBrand" AND p."lotId" IS NULL AND p.price < 100) THEN
    RAISE EXCEPTION 'Factory listings below 100 require review before commission migration';
  END IF;
END $$;
UPDATE "Product" p SET "commission" = 100, "factoryPrice" = p.price - 100
FROM "User" u WHERE p."sellerId" = u.id AND NOT u."isBrand" AND p."lotId" IS NULL;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_commission_nonnegative" CHECK ("commissionPerPiece" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_factory_price_nonnegative" CHECK (("factoryPrice" IS NULL OR "factoryPrice" >= 0) AND ("commission" IS NULL OR "commission" >= 0));
