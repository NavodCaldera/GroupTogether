-- An item's shop price per unit and its photo, both optional.
ALTER TABLE "PackItem" ADD COLUMN "retailPrice" DECIMAL(14,2), ADD COLUMN "photo" TEXT;
