-- Every admin works in one operational area; the unrestricted ALL area is removed (ADMIN-002).
-- Existing unrestricted admins keep signing in as warehouse admins; create the factory and premium
-- admins with `npm run admin:create`.
UPDATE "User" SET "adminArea" = 'WAREHOUSE' WHERE "role" = 'ADMIN' AND "adminArea" = 'ALL';
ALTER TABLE "User" ALTER COLUMN "adminArea" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "adminArea" DROP NOT NULL;
UPDATE "User" SET "adminArea" = NULL WHERE "role" <> 'ADMIN';

ALTER TYPE "AdminArea" RENAME TO "AdminArea_old";
CREATE TYPE "AdminArea" AS ENUM ('PREMIUM', 'FACTORY', 'WAREHOUSE');
ALTER TABLE "User" ALTER COLUMN "adminArea" TYPE "AdminArea" USING ("adminArea"::text::"AdminArea");
DROP TYPE "AdminArea_old";
