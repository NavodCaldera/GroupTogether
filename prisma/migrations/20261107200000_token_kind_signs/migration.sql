-- New token kinds from the agent model: credits are positive, TRANSFER_OUT is a debit.
ALTER TABLE "TokenEntry" DROP CONSTRAINT "TokenEntry_amount_sign";
ALTER TABLE "TokenEntry" ADD CONSTRAINT "TokenEntry_amount_sign" CHECK (
  ("kind" IN ('CANCELLATION','RETURN','RELEASE','LATE_PAYMENT','ORDER_CANCEL','AGENT_FEE','COURIER_REPAY','MISSING_ITEM','DEPOSIT_RETURN','TRANSFER_IN') AND "amount" > 0)
  OR ("kind" IN ('HOLD','TRANSFER_OUT') AND "amount" < 0)
  OR ("kind" = 'SPEND' AND "amount" = 0)
);
