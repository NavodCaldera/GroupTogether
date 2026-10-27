import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const servers = {
  next: "node_modules/next-devtools-mcp/dist/index.js",
  context7: "node_modules/@upstash/context7-mcp/dist/index.js",
  postgres: "scripts/postgres-inspector.mjs",
};
const selected = process.argv[2] || "next";
if (!servers[selected]) throw new Error("Choose next, context7 or postgres");
const client = new Client({ name: "groupbasket-tooling-check", version: "1.0.0" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [servers[selected]],
      stderr: "inherit",
    }),
  );
  const { tools } = await client.listTools();
  console.log(
    `${selected}: MCP handshake passed; tools: ${tools.map((tool) => tool.name).join(", ")}`,
  );
  if (selected === "context7" && process.argv.includes("--lookup")) {
    const lookup = await client.callTool({
      name: "resolve-library-id",
      arguments: {
        libraryName: "decimal.js",
        query: "Decimal.js arithmetic and precision documentation",
      },
    });
    const content =
      lookup.content
        ?.filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n") || "";
    if (lookup.isError || /unauthorized|invalid api key|rate limit/i.test(content))
      throw new Error("Context7 lookup unavailable; check account authentication or quota");
    console.log("context7: focused public-library lookup passed");
  }
  if (selected === "postgres") {
    const identity = await client.callTool({
      name: "query",
      arguments: {
        sql: "SELECT current_user, current_database(), current_setting('transaction_read_only') AS read_only",
      },
    });
    if (identity.isError) throw new Error("Reader verification failed");
    const summary = await client.callTool({
      name: "query",
      arguments: {
        sql: "SELECT * FROM groupbasket_ai.stock_summary",
      },
    });
    const denied = await client.callTool({
      name: "query",
      arguments: {
        sql: 'SELECT id FROM public."User" LIMIT 0',
      },
    });
    if (summary.isError || !denied.isError) throw new Error("Sanitized reader boundary failed");
    console.log("postgres: read-only identity, sanitized view and private-table denial passed");
  }
} finally {
  await client.close();
}
