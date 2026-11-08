-- Agent roles (area-agent model, Task 13): packing staff and Planner go, WAREHOUSE becomes AGENTS.

-- Packing staff leave with the packing feature: they become plain buyer accounts.
UPDATE "User" SET "role" = 'CUSTOMER', "factoryRole" = NULL, "adminArea" = NULL WHERE "role" = 'PACKER';

-- Planner jobs move to Sales (FR-031).
UPDATE "User" SET "factoryRole" = 'SALES' WHERE "factoryRole" = 'PLANNER';

-- AdminArea: WAREHOUSE is renamed AGENTS ("Agents and orders").
ALTER TYPE "AdminArea" RENAME VALUE 'WAREHOUSE' TO 'AGENTS';

-- FactoryRole: remove PLANNER.
CREATE TYPE "FactoryRole_new" AS ENUM ('OWNER', 'PACKING', 'SALES');
ALTER TABLE "User" ALTER COLUMN "factoryRole" TYPE "FactoryRole_new" USING ("factoryRole"::text::"FactoryRole_new");
ALTER TYPE "FactoryRole" RENAME TO "FactoryRole_old";
ALTER TYPE "FactoryRole_new" RENAME TO "FactoryRole";
DROP TYPE "FactoryRole_old";

-- Role: remove PACKER.
CREATE TYPE "Role_new" AS ENUM ('CUSTOMER', 'ADMIN', 'SELLER', 'AGENT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
