-- DEC-022: a factory-declared figure (e.g. gsm) gives a point that is not a lab measurement
ALTER TYPE "AxisBasis" ADD VALUE 'DECLARED' AFTER 'MEASURED';

-- Compared as text so the new enum value is not used inside this transaction
ALTER TABLE "FeelAxis" DROP CONSTRAINT "FeelAxis_shape_check";
ALTER TABLE "FeelAxis" ADD CONSTRAINT "FeelAxis_shape_check" CHECK (
  ("basis"::text IN ('MEASURED', 'DECLARED') AND "value" IS NOT NULL AND "value" BETWEEN 0 AND 100 AND "bandMin" IS NULL AND "bandMax" IS NULL)
  OR ("basis"::text = 'ESTIMATED' AND "value" IS NULL AND "bandMin" IS NOT NULL AND "bandMax" IS NOT NULL
      AND "bandMin" >= 0 AND "bandMax" <= 100 AND "bandMin" <= "bandMax")
  OR ("basis"::text = 'NOT_AVAILABLE' AND "value" IS NULL AND "bandMin" IS NULL AND "bandMax" IS NULL)
);
