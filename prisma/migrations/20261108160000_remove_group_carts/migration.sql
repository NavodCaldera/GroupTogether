-- Remove the old group-cart system (area-agent model, Task 18): carts, members, lines, slips,
-- merges, invites, packing, lots, price changes, samples, cart chat, PickMe deliveries and the
-- cart-keyed factory ratings. Premium brand offers and gift orders stay (parked); gifts lose
-- their cart link. Development data is demo data and is reseeded afterwards.

-- One transaction: a failure part-way leaves nothing applied.
BEGIN;

-- The local read-only inspector (scripts/setup-ai-reader.mjs) may hold a view over GroupCart.
DROP VIEW IF EXISTS "groupbasket_ai"."cart_summary";

-- Returns filed on old cart lines have no order line: remove them (and their fault records)
-- before orderLineId becomes required.
DELETE FROM "FactoryFault" WHERE "returnId" IN (SELECT id FROM "ReturnRequest" WHERE "orderLineId" IS NULL);
DELETE FROM "ReturnRequest" WHERE "orderLineId" IS NULL;

-- AlterEnum (the sign check names CANCELLATION, so it is rebuilt around the type change)
ALTER TABLE "TokenEntry" DROP CONSTRAINT "TokenEntry_amount_sign";
CREATE TYPE "TokenKind_new" AS ENUM ('RETURN', 'HOLD', 'RELEASE', 'SPEND', 'LATE_PAYMENT', 'ORDER_CANCEL', 'AGENT_FEE', 'COURIER_REPAY', 'MISSING_ITEM', 'DEPOSIT_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN');
-- Old cart cancellation credits become order cancellations (both positive token credits). ALTER
-- TYPE rewrites the column without firing the append-only UPDATE trigger.
ALTER TABLE "TokenEntry" ALTER COLUMN "kind" TYPE "TokenKind_new" USING (
  CASE WHEN "kind"::text = 'CANCELLATION' THEN 'ORDER_CANCEL' ELSE "kind"::text END
)::"TokenKind_new";
ALTER TYPE "TokenKind" RENAME TO "TokenKind_old";
ALTER TYPE "TokenKind_new" RENAME TO "TokenKind";
DROP TYPE "public"."TokenKind_old";
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_amount_sign" CHECK (
  ("kind" IN ('RETURN','RELEASE','LATE_PAYMENT','ORDER_CANCEL','AGENT_FEE','COURIER_REPAY','MISSING_ITEM','DEPOSIT_RETURN','TRANSFER_IN') AND "amount" > 0)
  OR ("kind" IN ('HOLD','TRANSFER_OUT') AND "amount" < 0)
  OR ("kind" = 'SPEND' AND "amount" = 0)
);

-- DropForeignKey
ALTER TABLE "CartInvite" DROP CONSTRAINT "CartInvite_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartInvite" DROP CONSTRAINT "CartInvite_invitedById_fkey";

-- DropForeignKey
ALTER TABLE "CartInvite" DROP CONSTRAINT "CartInvite_invitedUserId_fkey";

-- DropForeignKey
ALTER TABLE "CartLine" DROP CONSTRAINT "CartLine_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartLine" DROP CONSTRAINT "CartLine_userId_fkey";

-- DropForeignKey
ALTER TABLE "CartLine" DROP CONSTRAINT "CartLine_variantId_fkey";

-- DropForeignKey
ALTER TABLE "CartMember" DROP CONSTRAINT "CartMember_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartMember" DROP CONSTRAINT "CartMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "CartMergeRequest" DROP CONSTRAINT "CartMergeRequest_fromCartId_fkey";

-- DropForeignKey
ALTER TABLE "CartMergeRequest" DROP CONSTRAINT "CartMergeRequest_toCartId_fkey";

-- DropForeignKey
ALTER TABLE "CartMergeRequest" DROP CONSTRAINT "CartMergeRequest_userId_fkey";

-- DropForeignKey
ALTER TABLE "CartMessage" DROP CONSTRAINT "CartMessage_authorId_fkey";

-- DropForeignKey
ALTER TABLE "CartMessage" DROP CONSTRAINT "CartMessage_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartMessage" DROP CONSTRAINT "CartMessage_participantId_fkey";

-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_cartId_fkey";

-- DropForeignKey
ALTER TABLE "FactoryRating" DROP CONSTRAINT "FactoryRating_cartId_fkey";

-- DropForeignKey
ALTER TABLE "FactoryRating" DROP CONSTRAINT "FactoryRating_factoryId_fkey";

-- DropForeignKey
ALTER TABLE "FactoryRating" DROP CONSTRAINT "FactoryRating_userId_fkey";

-- DropForeignKey
ALTER TABLE "GiftOrder" DROP CONSTRAINT "GiftOrder_cartId_fkey";

-- DropForeignKey
ALTER TABLE "GroupCart" DROP CONSTRAINT "GroupCart_factoryPackedById_fkey";

-- DropForeignKey
ALTER TABLE "GroupCart" DROP CONSTRAINT "GroupCart_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Packing" DROP CONSTRAINT "Packing_cartId_fkey";

-- DropForeignKey
ALTER TABLE "Packing" DROP CONSTRAINT "Packing_gatheredById_fkey";

-- DropForeignKey
ALTER TABLE "Packing" DROP CONSTRAINT "Packing_handedOverById_fkey";

-- DropForeignKey
ALTER TABLE "Packing" DROP CONSTRAINT "Packing_packedById_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSlip" DROP CONSTRAINT "PaymentSlip_cartId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSlip" DROP CONSTRAINT "PaymentSlip_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSlip" DROP CONSTRAINT "PaymentSlip_uploaderId_fkey";

-- DropForeignKey
ALTER TABLE "PriceChange" DROP CONSTRAINT "PriceChange_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_lotId_fkey";

-- DropForeignKey
ALTER TABLE "ReturnRequest" DROP CONSTRAINT "ReturnRequest_cartLineId_fkey";

-- DropForeignKey
ALTER TABLE "SampleRequest" DROP CONSTRAINT "SampleRequest_cartId_fkey";

-- DropForeignKey
ALTER TABLE "SampleRequest" DROP CONSTRAINT "SampleRequest_productId_fkey";

-- DropForeignKey
ALTER TABLE "SampleRequest" DROP CONSTRAINT "SampleRequest_requesterId_fkey";

-- DropIndex
DROP INDEX "GiftOrder_cartId_recipientId_idx";

-- DropIndex
DROP INDEX "Product_lotId_idx";

-- DropIndex
DROP INDEX "ReturnRequest_cartLineId_idx";

-- DropIndex
DROP INDEX "TokenEntry_cartLineId_idx";

-- AlterTable
ALTER TABLE "GiftOrder" DROP COLUMN "cartId";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "lotId";

-- AlterTable
ALTER TABLE "ReturnRequest" DROP COLUMN "cartLineId",
DROP COLUMN "pickupBookedAt",
DROP COLUMN "pickupBookedById",
DROP COLUMN "pickupDriver",
DROP COLUMN "pickupRef",
ALTER COLUMN "orderLineId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "accountName",
DROP COLUMN "accountNumber",
DROP COLUMN "bankBranch",
DROP COLUMN "bankName",
DROP COLUMN "cartLifetimeHours",
DROP COLUMN "fullMarginDays",
DROP COLUMN "fullMarginPct",
DROP COLUMN "minOrderValue",
DROP COLUMN "reducedMarginPct",
DROP COLUMN "slipWindowHours",
DROP COLUMN "storeCapacity";

-- AlterTable
ALTER TABLE "TokenEntry" DROP COLUMN "cartLineId";

-- DropTable
DROP TABLE "CartInvite";

-- DropTable
DROP TABLE "CartLine";

-- DropTable
DROP TABLE "CartMember";

-- DropTable
DROP TABLE "CartMergeRequest";

-- DropTable
DROP TABLE "CartMessage";

-- DropTable
DROP TABLE "Delivery";

-- DropTable
DROP TABLE "FactoryRating";

-- DropTable
DROP TABLE "GroupCart";

-- DropTable
DROP TABLE "Lot";

-- DropTable
DROP TABLE "Packing";

-- DropTable
DROP TABLE "PaymentSlip";

-- DropTable
DROP TABLE "PriceChange";

-- DropTable
DROP TABLE "SampleRequest";

-- DropEnum
DROP TYPE "CartStatus";

-- DropEnum
DROP TYPE "DeliveryStatus";

-- DropEnum
DROP TYPE "MergeStatus";

-- DropEnum
DROP TYPE "SampleStatus";

-- DropEnum
DROP TYPE "SlipStatus";

-- DropEnum
DROP TYPE "Visibility";

-- CreateIndex
CREATE INDEX "GiftOrder_recipientId_idx" ON "GiftOrder"("recipientId");

COMMIT;
