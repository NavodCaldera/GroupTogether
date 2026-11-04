-- Factory staff logins with a fixed job (product owner, 2026-11-04)
CREATE TYPE "FactoryRole" AS ENUM ('OWNER', 'PACKING', 'PLANNER', 'SALES');

ALTER TABLE "User" ADD COLUMN "factoryId" TEXT,
ADD COLUMN "factoryRole" "FactoryRole";

CREATE INDEX "User_factoryId_idx" ON "User"("factoryId");

ALTER TABLE "User" ADD CONSTRAINT "User_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
