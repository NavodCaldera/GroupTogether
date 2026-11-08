import crypto from "node:crypto";
import fs from "node:fs";
import { config } from "dotenv";
import pg from "pg";

// Explicit administrative setup; the inspector itself never uses this connection.
if (!process.argv.includes("--apply")) {
  console.log(
    "Use --apply to create a local reader and sanitized inspection views. No application rows are changed.",
  );
  process.exit(0);
}
config({ quiet: true });
const target = new URL(process.env.DATABASE_URL || "");
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "5546" ||
  target.pathname !== "/groupbasket"
)
  throw new Error("Reader setup is restricted to localhost:5546/groupbasket");
if (fs.existsSync(".env.mcp"))
  throw new Error(".env.mcp already exists; preserve it and verify the existing reader instead");
const password = crypto.randomBytes(32).toString("hex");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
let wroteFile = false;
try {
  await client.connect();
  await client.query("BEGIN");
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname='gb_ai_reader'");
  if (existing.rowCount)
    throw new Error("gb_ai_reader already exists; its credentials and grants were left unchanged");
  await client.query(
    `CREATE ROLE gb_ai_reader LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await client.query("GRANT CONNECT ON DATABASE groupbasket TO gb_ai_reader");
  await client.query("ALTER ROLE gb_ai_reader SET default_transaction_read_only=on");
  await client.query("ALTER ROLE gb_ai_reader SET statement_timeout='5s'");
  await client.query("CREATE SCHEMA groupbasket_ai");
  await client.query("REVOKE ALL ON SCHEMA groupbasket_ai FROM PUBLIC");
  await client.query(`CREATE VIEW groupbasket_ai.schema_columns AS
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns WHERE table_schema='public'`);
  await client.query(`CREATE VIEW groupbasket_ai.stock_summary AS
    SELECT SUM(v.available)::text AS available, SUM(v.reserved)::text AS reserved,
      SUM(v.sold)::text AS sold, COUNT(*)::text AS variants
    FROM public."Variant" v JOIN public."Product" p ON p.id=v."productId"
    LEFT JOIN public."User" seller ON seller.id=p."sellerId"
    WHERE COALESCE(seller."isBrand",false)=false AND p.category<>'SHOES'`);
  await client.query(`CREATE VIEW groupbasket_ai.order_summary AS
    SELECT status::text, COUNT(*)::text AS orders, SUM("itemsTotal")::text AS clothing_total
    FROM public."Order" GROUP BY status`);
  await client.query("GRANT USAGE ON SCHEMA groupbasket_ai TO gb_ai_reader");
  await client.query("GRANT SELECT ON ALL TABLES IN SCHEMA groupbasket_ai TO gb_ai_reader");
  fs.writeFileSync(".env.mcp", `GROUPBASKET_READER_PASSWORD=${password}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  wroteFile = true;
  await client.query("COMMIT");
  console.log(
    "Created restricted local reader, three sanitized views and ignored .env.mcp. No application rows changed.",
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  if (wroteFile) fs.unlinkSync(".env.mcp");
  console.error(
    error instanceof Error && /already exists/.test(error.message)
      ? error.message
      : "Reader setup failed; no credentials are printed. Check the local database and administrative access.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
