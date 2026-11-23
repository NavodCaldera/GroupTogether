-- Companies are no longer grouped under categories (2026-11-24).
ALTER TABLE "Company" DROP CONSTRAINT "Company_categoryId_fkey";
DROP INDEX "Company_categoryId_idx";
ALTER TABLE "Company" DROP COLUMN "categoryId";
DROP TABLE "Category";
