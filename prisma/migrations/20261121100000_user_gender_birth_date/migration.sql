-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gender" "Gender",
ADD COLUMN     "birthDate" DATE;
