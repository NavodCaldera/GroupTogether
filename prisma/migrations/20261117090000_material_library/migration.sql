-- DEC-022: material library, provenance, product materials and feel profiles

-- CreateEnum
CREATE TYPE "FiberFamily" AS ENUM ('NATURAL_PLANT', 'NATURAL_ANIMAL', 'REGENERATED_CELLULOSIC', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "ConstructionCategory" AS ENUM ('WEFT_KNIT', 'WARP_KNIT', 'WOVEN', 'OTHER');

-- CreateEnum
CREATE TYPE "StretchType" AS ENUM ('NONE', 'MECHANICAL', 'TWO_WAY', 'FOUR_WAY');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "EvidenceSubject" AS ENUM ('FIBER', 'YARN_PROCESS', 'FIBER_STANDARD', 'CONSTRUCTION', 'FINISH', 'MATERIAL', 'LAB');

-- CreateEnum
CREATE TYPE "TestStandard" AS ENUM ('KES_FB2_BENDING', 'KES_FB4_SURFACE', 'KES_FB3_COMPRESSION', 'AATCC_TM202', 'AATCC_TM218', 'ASTM_D1388', 'FAST2', 'ISO_3801', 'EN_12127', 'ASTM_D3776', 'ISO_9237', 'ASTM_D737', 'ISO_11092', 'AATCC_TM195', 'AATCC_TM199', 'ISO_20932_1', 'ASTM_D2594', 'ASTM_D3107', 'ISO_5077', 'AATCC_TM135', 'ISO_12945_2', 'ISO_12947_2', 'BS_5058', 'AATCC_TM128', 'AATCC_EP5_PANEL');

-- CreateEnum
CREATE TYPE "MeasureDirection" AS ENUM ('WARP', 'WEFT', 'WALE', 'COURSE', 'AVG');

-- CreateEnum
CREATE TYPE "MaterialRole" AS ENUM ('SHELL', 'LINING', 'TRIM', 'RIB_COLLAR');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('LIBRARY_ESTIMATE', 'FACTORY_DECLARED', 'LAB_MEASURED');

-- CreateEnum
CREATE TYPE "FeelAxisKey" AS ENUM ('SOFT_FIRM', 'LIGHT_SUBSTANTIAL', 'SMOOTH_TEXTURED', 'BREATHABLE_INSULATING');

-- CreateEnum
CREATE TYPE "AxisBasis" AS ENUM ('MEASURED', 'ESTIMATED', 'NOT_AVAILABLE');

-- CreateTable
CREATE TABLE "Fiber" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" "FiberFamily" NOT NULL,
    "speciesOrPolymer" TEXT,
    "stapleLengthMmMin" DOUBLE PRECISION,
    "stapleLengthMmMax" DOUBLE PRECISION,
    "moistureRegainPct" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fiber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YarnProcess" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YarnProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiberStandard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "certifyingBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiberStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Construction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ConstructionCategory" NOT NULL,
    "structureDescription" TEXT,
    "typicalGsmMin" INTEGER,
    "typicalGsmMax" INTEGER,
    "typicalEndUses" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Construction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finish" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "constructionId" TEXT NOT NULL,
    "yarnProcessId" TEXT,
    "finishId" TEXT NOT NULL,
    "defaultGsmMin" INTEGER,
    "defaultGsmMax" INTEGER,
    "stretchType" "StretchType",
    "feelsLikeAnchor" TEXT,
    "endUses" TEXT[],
    "status" "MaterialStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFiber" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "fiberId" TEXT NOT NULL,
    "fiberStandardId" TEXT,
    "percentage" INTEGER NOT NULL,

    CONSTRAINT "MaterialFiber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedYear" INTEGER,
    "accessedOn" DATE,
    "tier" "SourceTier" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subjectType" "EvidenceSubject" NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "valueText" TEXT,
    "valueMin" DOUBLE PRECISION,
    "valueMax" DOUBLE PRECISION,
    "unit" TEXT,
    "sourceId" TEXT NOT NULL,
    "locator" TEXT,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "accreditationNo" TEXT,
    "scope" "TestStandard"[],
    "scopeSourceId" TEXT,
    "scopeVerifiedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "productMaterialId" TEXT,
    "materialId" TEXT,
    "calibrationSwatchId" TEXT,
    "testStandard" "TestStandard" NOT NULL,
    "property" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" "MeasureDirection" NOT NULL DEFAULT 'AVG',
    "labId" TEXT,
    "labName" TEXT NOT NULL,
    "labAccreditationNo" TEXT,
    "accredited" BOOLEAN NOT NULL,
    "reportRef" TEXT,
    "reportKey" TEXT,
    "reportType" TEXT,
    "testedOn" DATE NOT NULL,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodologyRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "attribute" TEXT NOT NULL,
    "ruleDescription" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "params" JSONB,
    "calibrationSetId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MethodologyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationSet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationSwatch" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationSwatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMaterial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "role" "MaterialRole" NOT NULL DEFAULT 'SHELL',
    "actualGsm" INTEGER NOT NULL,
    "actualComposition" JSONB,
    "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'LIBRARY_ESTIMATE',
    "needsReviewAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "videoKey" TEXT,
    "videoType" TEXT,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeelProfile" (
    "id" TEXT NOT NULL,
    "productMaterialId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeelAxis" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "axis" "FeelAxisKey" NOT NULL,
    "basis" "AxisBasis" NOT NULL,
    "value" DOUBLE PRECISION,
    "bandMin" DOUBLE PRECISION,
    "bandMax" DOUBLE PRECISION,
    "ruleCode" TEXT,
    "ruleVersion" INTEGER,
    "evidenceCodes" TEXT[],
    "measurementIds" TEXT[],

    CONSTRAINT "FeelAxis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fiber_code_key" ON "Fiber"("code");

-- CreateIndex
CREATE UNIQUE INDEX "YarnProcess_code_key" ON "YarnProcess"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FiberStandard_code_key" ON "FiberStandard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Construction_code_key" ON "Construction"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Finish_code_key" ON "Finish"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_status_idx" ON "Material"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialFiber_materialId_fiberId_fiberStandardId_key" ON "MaterialFiber"("materialId", "fiberId", "fiberStandardId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_code_key" ON "Source"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_code_key" ON "Evidence"("code");

-- CreateIndex
CREATE INDEX "Evidence_subjectType_subjectCode_idx" ON "Evidence"("subjectType", "subjectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Lab_code_key" ON "Lab"("code");

-- CreateIndex
CREATE INDEX "Measurement_productMaterialId_idx" ON "Measurement"("productMaterialId");

-- CreateIndex
CREATE INDEX "Measurement_materialId_idx" ON "Measurement"("materialId");

-- CreateIndex
CREATE INDEX "Measurement_calibrationSwatchId_idx" ON "Measurement"("calibrationSwatchId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodologyRule_code_version_key" ON "MethodologyRule"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationSet_code_key" ON "CalibrationSet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationSwatch_setId_label_key" ON "CalibrationSwatch"("setId", "label");

-- CreateIndex
CREATE INDEX "ProductMaterial_materialId_idx" ON "ProductMaterial"("materialId");

-- CreateIndex
CREATE INDEX "ProductMaterial_needsReviewAt_idx" ON "ProductMaterial"("needsReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMaterial_productId_role_key" ON "ProductMaterial"("productId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FeelProfile_productMaterialId_key" ON "FeelProfile"("productMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "FeelAxis_profileId_axis_key" ON "FeelAxis"("profileId", "axis");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_constructionId_fkey" FOREIGN KEY ("constructionId") REFERENCES "Construction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_yarnProcessId_fkey" FOREIGN KEY ("yarnProcessId") REFERENCES "YarnProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_finishId_fkey" FOREIGN KEY ("finishId") REFERENCES "Finish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFiber" ADD CONSTRAINT "MaterialFiber_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFiber" ADD CONSTRAINT "MaterialFiber_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFiber" ADD CONSTRAINT "MaterialFiber_fiberStandardId_fkey" FOREIGN KEY ("fiberStandardId") REFERENCES "FiberStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_scopeSourceId_fkey" FOREIGN KEY ("scopeSourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_productMaterialId_fkey" FOREIGN KEY ("productMaterialId") REFERENCES "ProductMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_calibrationSwatchId_fkey" FOREIGN KEY ("calibrationSwatchId") REFERENCES "CalibrationSwatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodologyRule" ADD CONSTRAINT "MethodologyRule_calibrationSetId_fkey" FOREIGN KEY ("calibrationSetId") REFERENCES "CalibrationSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSwatch" ADD CONSTRAINT "CalibrationSwatch_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CalibrationSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSwatch" ADD CONSTRAINT "CalibrationSwatch_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelProfile" ADD CONSTRAINT "FeelProfile_productMaterialId_fkey" FOREIGN KEY ("productMaterialId") REFERENCES "ProductMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelAxis" ADD CONSTRAINT "FeelAxis_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FeelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guards (DEC-022): values on 0-100 scales, bands ordered, sensible gsm and percentages
ALTER TABLE "MaterialFiber" ADD CONSTRAINT "MaterialFiber_percentage_check" CHECK ("percentage" > 0 AND "percentage" <= 100);
ALTER TABLE "Material" ADD CONSTRAINT "Material_gsm_check" CHECK (("defaultGsmMin" IS NULL OR "defaultGsmMin" > 0) AND ("defaultGsmMin" IS NULL OR "defaultGsmMax" IS NULL OR "defaultGsmMin" <= "defaultGsmMax"));
ALTER TABLE "Construction" ADD CONSTRAINT "Construction_gsm_check" CHECK ("typicalGsmMin" IS NULL OR "typicalGsmMax" IS NULL OR "typicalGsmMin" <= "typicalGsmMax");
ALTER TABLE "ProductMaterial" ADD CONSTRAINT "ProductMaterial_gsm_check" CHECK ("actualGsm" BETWEEN 10 AND 2000);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_range_check" CHECK ("valueMin" IS NULL OR "valueMax" IS NULL OR "valueMin" <= "valueMax");
ALTER TABLE "FeelAxis" ADD CONSTRAINT "FeelAxis_shape_check" CHECK (
  ("basis" = 'MEASURED' AND "value" IS NOT NULL AND "value" BETWEEN 0 AND 100 AND "bandMin" IS NULL AND "bandMax" IS NULL)
  OR ("basis" = 'ESTIMATED' AND "value" IS NULL AND "bandMin" IS NOT NULL AND "bandMax" IS NOT NULL
      AND "bandMin" >= 0 AND "bandMax" <= 100 AND "bandMin" <= "bandMax")
  OR ("basis" = 'NOT_AVAILABLE' AND "value" IS NULL AND "bandMin" IS NULL AND "bandMax" IS NULL)
);
ALTER TABLE "FeelAxis" ADD CONSTRAINT "FeelAxis_rule_check" CHECK ("basis" = 'NOT_AVAILABLE' OR ("ruleCode" IS NOT NULL AND "ruleVersion" IS NOT NULL));
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_one_owner" CHECK (num_nonnulls("productMaterialId", "materialId", "calibrationSwatchId") = 1);

-- A published rule version never changes; a change is a new version
CREATE FUNCTION groupbasket_methodology_rule_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Methodology rules are append-only; publish a new version'; END;
$$;
CREATE TRIGGER "MethodologyRule_immutable" BEFORE UPDATE OR DELETE ON "MethodologyRule"
FOR EACH ROW EXECUTE FUNCTION groupbasket_methodology_rule_immutable();
