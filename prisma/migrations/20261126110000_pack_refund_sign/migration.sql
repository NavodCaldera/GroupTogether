-- Basket refunds (PACK_REFUND, DEC-030) are positive token entries.
ALTER TABLE "TokenEntry" DROP CONSTRAINT "TokenEntry_amount_sign";
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_amount_sign" CHECK (
  ("kind"::text IN ('RETURN','RELEASE','LATE_PAYMENT','ORDER_CANCEL','AGENT_FEE','COURIER_REPAY','MISSING_ITEM','DEPOSIT_RETURN','TRANSFER_IN','DEAL_REBATE','PACK_REFUND') AND "amount" > 0)
  OR ("kind"::text IN ('HOLD','TRANSFER_OUT','FEE_CLAWBACK') AND "amount" < 0)
  OR ("kind"::text = 'SPEND' AND "amount" = 0)
);
