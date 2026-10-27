import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readerConfig,
  fixedQueryArguments,
  verifyReader,
} from "../../scripts/postgres-inspector.mjs";

test("inspector is pinned to the intended database and forbids runtime overrides", () => {
  const cfg = readerConfig("synthetic-test-value");
  assert.equal(cfg.port, 5546);
  assert.equal(cfg.database, "groupbasket");
  assert.equal(cfg.user, "gb_ai_reader");
  assert.deepEqual(fixedQueryArguments({ sql: "SELECT 1" }), { sql: "SELECT 1" });
  assert.throws(() => readerConfig());
  assert.throws(() => fixedQueryArguments({ sql: "SELECT 1", connectionString: "anything" }));
  assert.throws(() => fixedQueryArguments({ sql: "x".repeat(20001) }));
});

test("inspector rejects a write-capable, privileged or incorrectly targeted role", async () => {
  const good = { name: "gb_ai_reader", database: "groupbasket", read_only: "on", can_write: false };
  await verifyReader({ query: async () => ({ rows: [good] }) });
  for (const bad of [
    { rolsuper: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { rolbypassrls: true },
    { can_write: true },
    { read_only: "off" },
    { database: "other" },
    { name: "postgres" },
  ])
    await assert.rejects(verifyReader({ query: async () => ({ rows: [{ ...good, ...bad }] }) }));
});
