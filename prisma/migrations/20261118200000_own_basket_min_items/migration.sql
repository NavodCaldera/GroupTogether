-- Own baskets (DEC-023): no delivery fee; the owner pays the courier on delivery.
-- The owner can place the order once the basket holds ownMinItems items.
ALTER TABLE "Settings" DROP COLUMN "ownDeliveryBase",
DROP COLUMN "ownDeliveryPerItem",
DROP COLUMN "ownFeeDays",
ADD COLUMN "ownMinItems" INTEGER NOT NULL DEFAULT 10;
