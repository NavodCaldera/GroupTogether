import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_FACTORIES, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Group deals (DEAL-001, DEAL-002). Reduced motion: product pages show the 3D body (fit.spec.ts).
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const ids = { product: "", factoryPrice: "" };
const BUYERS = [DEMO_BUYERS.ayesha, DEMO_BUYERS.malith];

const databaseUrl = () =>
  assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);

async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    return (await pool.query(text, values)).rows as T[];
  } finally {
    await pool.end();
  }
}

/** The cron sweep, run once outside the app server as POST /api/cron/sweep would. */
function runSweep() {
  execFileSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "--import",
      "./prisma/seed-hooks.mjs",
      "tests/e2e/run-sweep.ts",
    ],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl(), STORAGE_DIR: ".data/test-uploads" },
      stdio: "pipe",
      timeout: 60_000,
    },
  );
}

test.beforeAll(async () => {
  seedBrowserFixtures();
  const [p] = await sql<{ id: string; factoryPrice: string }>(
    `SELECT p.id, p."factoryPrice"::text AS "factoryPrice" FROM "Product" p
     JOIN "User" u ON u.id = p."sellerId"
     WHERE u.email = $1 AND p.status = 'LIVE' ORDER BY p.price ASC, p.id ASC LIMIT 1`,
    [DEMO_FACTORIES.ceylon.owner],
  );
  ids.product = p.id;
  ids.factoryPrice = p.factoryPrice;
  for (const email of BUYERS)
    await sql(`DELETE FROM "CartItem" WHERE "buyerId" = (SELECT id FROM "User" WHERE email = $1)`, [
      email,
    ]);
});

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function inspect(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

test("the factory sets two tiers and starts the deal", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, DEMO_FACTORIES.ceylon.owner);
  await page.goto(`/seller/products/${ids.product}`);
  const card = page.getByTestId("deal-section");
  await expect(card.getByRole("heading", { name: "Group deal" })).toBeVisible();
  const lower = (Number(ids.factoryPrice) - 100).toFixed(2);
  await card.getByLabel("Tier 1 factory price").fill(ids.factoryPrice);
  await card.getByLabel("Tier 2 from quantity").fill("2");
  await card.getByLabel("Tier 2 factory price").fill(lower);
  await card.getByRole("button", { name: "Create deal" }).click();
  await expect(card.getByRole("button", { name: "Go live" })).toBeVisible();
  await inspect(page);
  await card.getByRole("button", { name: "Go live" }).click();
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await expect(card.getByTestId("deal-sold")).toHaveText("0 sold");
});

test("two buyers order at the agent and the tier drops", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [i, email] of BUYERS.entries()) {
    await signIn(page, email);
    await page.goto(`/products/${ids.product}`);
    const bar = page.getByTestId("deal-bar");
    await expect(bar).toContainText(i === 0 ? "0 sold · 2 more to" : "1 sold · 1 more to");
    if (i === 0) await inspect(page);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
    await page.goto("/cart");
    await page.getByRole("button", { name: "Agent pickup" }).click();
    await page.getByRole("button", { name: "Checkout" }).click();
    await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(page).toHaveURL(/\/demo-pay\//);
    await page.getByRole("button", { name: "Pay", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  }
  await page.goto(`/products/${ids.product}`);
  await expect(page.getByTestId("deal-bar")).toContainText("2 sold");
});

test("the sweep settles the deal and each buyer sees the rebate", async ({ page }) => {
  test.setTimeout(180_000);
  await sql(
    `UPDATE "GroupDeal" SET "endsAt" = now() - interval '1 minute'
     WHERE "productId" = $1 AND status = 'LIVE'`,
    [ids.product],
  );
  runSweep();
  const [deal] = await sql<{ status: string }>(
    `SELECT status FROM "GroupDeal" WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [ids.product],
  );
  expect(deal.status).toBe("SETTLED");
  for (const email of BUYERS) {
    await signIn(page, email);
    await page.goto("/tokens");
    await expect(page.getByText("Group deal rebate").first()).toBeVisible();
    await inspect(page);
  }
  await page.goto(`/products/${ids.product}`);
  await expect(page.getByTestId("deal-bar")).toHaveCount(0);
});
