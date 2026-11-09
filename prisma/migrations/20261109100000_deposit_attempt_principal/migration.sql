-- The deposit charged on each deposit attempt, so the amount returned on leaving does not follow
-- later changes to Settings.agentDeposit.
ALTER TABLE "PaymentAttempt" ADD COLUMN "depositPrincipal" DECIMAL(14,2);

-- Existing deposit attempts: the amount paid less the gateway fee is not recoverable, so use the
-- deposit an agent already recorded, else the current setting (demo data only).
UPDATE "PaymentAttempt" p
SET "depositPrincipal" = COALESCE(
  (SELECT a."depositAmount" FROM "Agent" a WHERE a.id = p."agentId" AND a."depositPaidAt" IS NOT NULL),
  (SELECT s."agentDeposit" FROM "Settings" s WHERE s.id = 1),
  200000
)
WHERE p.purpose = 'DEPOSIT';

ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_deposit_principal"
  CHECK (purpose <> 'DEPOSIT' OR ("depositPrincipal" IS NOT NULL AND "depositPrincipal" > 0));
