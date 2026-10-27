import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function readerConfig(password) {
  if (!password) throw new Error("Set GROUPBASKET_READER_PASSWORD in ignored .env.mcp");
  return {
    host: "localhost",
    port: 5546,
    database: "groupbasket",
    user: "gb_ai_reader",
    password,
    connectionTimeoutMillis: 5000,
    options: "-c default_transaction_read_only=on -c statement_timeout=5000",
  };
}

export function fixedQueryArguments(args) {
  if (
    !args ||
    typeof args.sql !== "string" ||
    args.sql.length > 20_000 ||
    Object.keys(args).some((key) => key !== "sql")
  )
    throw new Error("Only a bounded sql argument is accepted; connection overrides are forbidden");
  return { sql: args.sql };
}

export async function verifyReader(client) {
  const result = await client.query(`
    SELECT current_user AS name, current_database() AS database,
      r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
      current_setting('transaction_read_only') AS read_only,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','f')
          AND (
            has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
            OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE')
          )
      ) AS can_write
    FROM pg_roles r WHERE r.rolname=current_user`);
  const role = result.rows[0];
  if (
    !role ||
    role.name !== "gb_ai_reader" ||
    role.database !== "groupbasket" ||
    role.rolsuper ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolbypassrls ||
    role.can_write ||
    role.read_only !== "on"
  )
    throw new Error(
      "Inspector requires the restricted gb_ai_reader role and read-only transactions",
    );
}

async function main() {
  config({ path: ".env.mcp", quiet: true });
  const connection = readerConfig(process.env.GROUPBASKET_READER_PASSWORD);
  const verifier = new pg.Client(connection);
  try {
    await verifier.connect();
    await verifyReader(verifier);
  } finally {
    await verifier.end();
  }
  const upstream = new Client({ name: "groupbasket-inspector-proxy", version: "1.0.0" });
  await upstream.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["node_modules/@hovecapital/read-only-postgres-mcp-server/dist/index.js"],
      env: {
        PATH: process.env.PATH || "",
        SYSTEMROOT: process.env.SYSTEMROOT || "",
        DB_HOST: "localhost",
        DB_PORT: "5546",
        DB_DATABASE: "groupbasket",
        DB_USERNAME: "gb_ai_reader",
        DB_PASSWORD: connection.password,
        DB_ALLOWED_HOSTS: "",
        DB_SSL: "false",
        PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=5000",
      },
      stderr: "inherit",
    }),
  );
  const server = new Server(
    { name: "groupbasket-read-only-inspector", version: "1.0.0" },
    {
      capabilities: { tools: {} },
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "query",
        description:
          "Read-only inspection of localhost:5546/groupbasket as gb_ai_reader. Prefer schema and sanitized aggregates; never request private records.",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string", maxLength: 20000 } },
          required: ["sql"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "query")
      throw new Error("Only read-only query inspection is enabled");
    return upstream.callTool({
      name: "query",
      arguments: fixedQueryArguments(request.params.arguments),
    });
  });
  const close = async () => {
    await upstream.close();
    await server.close();
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "Read-only inspector unavailable: check .env.mcp, local database and reader privileges. No credentials are printed.",
    );
    process.exitCode = 1;
  });
}
