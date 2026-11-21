-- Own baskets wait at most this many days from their first payment (DEC-026).
ALTER TABLE "Settings" ADD COLUMN "ownMaxWaitDays" INTEGER NOT NULL DEFAULT 10;
