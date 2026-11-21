-- DEC-027: an own basket holds any products of its factory; new baskets name no product.
ALTER TABLE "Basket" DROP CONSTRAINT "Basket_kind_shape";
ALTER TABLE "Basket" ADD CONSTRAINT "Basket_kind_shape" CHECK (
  ("kind" = 'AGENT' AND "agentId" IS NOT NULL AND "ownerId" IS NULL)
  OR ("kind" = 'OWN' AND "agentId" IS NULL AND "ownerId" IS NOT NULL)
);
