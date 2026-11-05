CREATE TYPE "TokenKind" AS ENUM ('CANCELLATION', 'RETURN', 'HOLD', 'RELEASE', 'SPEND');
ALTER TABLE "CartLine" ADD COLUMN "tokensApplied" DECIMAL(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_tokens_range" CHECK ("tokensApplied" >= 0 AND "tokensApplied" <= "unitPrice" * "qty");
CREATE TABLE "TokenEntry" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "amount" DECIMAL(14,2) NOT NULL, "kind" "TokenKind" NOT NULL,
 "cartLineId" TEXT, "returnId" TEXT, "eventKey" TEXT NOT NULL, "note" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TokenEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "TokenEntry_amount_sign" CHECK (("kind" IN ('CANCELLATION','RETURN','RELEASE') AND "amount" > 0) OR ("kind" = 'HOLD' AND "amount" < 0) OR ("kind" = 'SPEND' AND "amount" = 0))
);
CREATE UNIQUE INDEX "TokenEntry_eventKey_key" ON "TokenEntry"("eventKey");
CREATE INDEX "TokenEntry_userId_createdAt_idx" ON "TokenEntry"("userId", "createdAt");
CREATE INDEX "TokenEntry_cartLineId_idx" ON "TokenEntry"("cartLineId");
CREATE FUNCTION groupbasket_token_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Token ledger entries are append-only'; END;
$$;
CREATE TRIGGER "TokenEntry_immutable" BEFORE UPDATE OR DELETE ON "TokenEntry"
FOR EACH ROW EXECUTE FUNCTION groupbasket_token_entry_immutable();
