"use client";
// ruleid: groupbasket-no-browser-admin-import
import { db } from "@/server/db";
// ruleid: groupbasket-no-browser-admin-import
import { getCurrentUser } from "@/server/auth/session";
// ok: groupbasket-no-browser-admin-import
import { saveProfile } from "@/server/account-actions";

// ruleid: groupbasket-no-unsafe-raw-sql
db.$queryRawUnsafe("SELECT 1");
// ruleid: groupbasket-no-unsafe-raw-sql
db.$executeRawUnsafe("DELETE FROM example");
// ok: groupbasket-no-unsafe-raw-sql
db.$queryRaw`SELECT 1`;
