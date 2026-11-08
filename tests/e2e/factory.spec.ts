import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO, DEMO_ADMINS, DEMO_FACTORIES } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

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

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

const noSideScroll = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Factory" }).getByRole("link");

test("packing: marks the locked basket packed, then gives it to the driver", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, DEMO_FACTORIES.ceylon.packing);
  await expect(page).toHaveURL(/\/seller$/);

  // The seeded LOCKED basket is at the Wellawatte agent (Fathima Rizwan).
  const toPack = page.getByRole("list", { name: "To pack" });
  const basket = toPack.getByRole("listitem", { name: "Fathima Rizwan", exact: true });
  await expect(basket).toBeInViewport();
  await expect(basket.getByText("Report missing").first()).toBeVisible();
  await expect(basket.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByText(/LKR/)).toHaveCount(0);
  await noSideScroll(page);
  await axe(page);
  await page.screenshot({ path: "test-results/factory-packing-mobile.png", fullPage: true });

  await basket.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByText("Nothing to pack")).toBeVisible();

  // The Agents and orders admin books the courier (its screen is another task's).
  await sql(
    `INSERT INTO "CourierBooking" (id,"basketId",fee,"driverName","driverPhone","vehicleNo","bookedById")
     SELECT 'e2e-courier', b.id, 1300, 'Pradeep Jayasinghe', '0779876543', 'WP-CAR-1234', admin.id
     FROM "Basket" b
     JOIN "Agent" ag ON ag.id = b."agentId"
     JOIN "User" au ON au.id = ag."userId"
     JOIN "User" f ON f.id = b."factoryId"
     JOIN "User" admin ON admin.email = $3
     WHERE au.email = $1 AND f.email = $2 AND b.status = 'PACKED'`,
    [DEMO.baskets.LOCKED.agent, DEMO.baskets.LOCKED.factory, DEMO_ADMINS.AGENTS],
  );
  await page.reload();
  const booked = page
    .getByRole("list", { name: "Courier booked" })
    .getByRole("listitem", { name: "Fathima Rizwan", exact: true });
  await expect(booked.getByText("Pradeep Jayasinghe")).toBeVisible();
  await expect(booked.getByRole("link", { name: "0779876543" })).toBeVisible();
  await expect(booked.getByText("WP-CAR-1234")).toBeVisible();
  await expect(booked.getByText("Report missing")).toHaveCount(0);
  await booked.getByRole("button", { name: "Given to driver" }).click();
  await expect(page.getByRole("list", { name: "Courier booked" })).toHaveCount(0);

  await tabs(page).getByText("Orders").click();
  await expect(page).toHaveURL(/\/seller\/orders$/);
  const stages = page.getByRole("list", { name: "Baskets by stage" }).getByRole("listitem");
  await expect(stages).toHaveText(
    ["Filling", "Locked", "Packed", "With courier", "At agent"].map((s) => new RegExp(s)),
  );
  await expect(page.getByRole("listitem", { name: "Locked: 0" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "With courier: 1" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Baskets" }).getByRole("listitem", {
      name: "Fathima Rizwan",
      exact: true,
    }),
  ).toContainText("With courier");
  await expect(page.getByText(/LKR/)).toHaveCount(0);
  await noSideScroll(page);
  await axe(page);
  await page.screenshot({ path: "test-results/factory-orders-mobile.png", fullPage: true });
});

test("owner sees an earning after the sweep runs", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  // The AT_AGENT parcel arrived ten days ago, so last week's payout includes it.
  await sql(
    `UPDATE "Order" o SET "receivedAt" = now() - interval '10 days'
     FROM "User" f WHERE f.id = o."factoryId" AND f.email = $1 AND o.status = 'RECEIVED'`,
    [DEMO.baskets.AT_AGENT.factory],
  );
  await signIn(page, DEMO_FACTORIES.ceylon.owner);
  await expect(page.getByRole("heading", { name: "Earnings and payouts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "To pack" })).toBeVisible();
  await page.getByRole("link", { name: "Past payouts" }).click();
  await expect(page).toHaveURL(/\/seller\/earnings$/);
  await expect(page.getByText("No payouts yet")).toBeVisible();

  runSweep();
  const [payout] = await sql<{ net: string }>(
    `SELECT p.net::text AS net FROM "FactoryPayout" p JOIN "User" f ON f.id = p."factoryId"
     WHERE f.email = $1`,
    [DEMO.baskets.AT_AGENT.factory],
  );
  expect(Number(payout.net)).toBeGreaterThan(0);
  await page.reload();
  const row = page.getByRole("list", { name: "Payouts" }).getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Due");
  await expect(row).toContainText(
    Number(payout.net).toLocaleString("en-US", { maximumFractionDigits: 2 }),
  );
  // Sachini's returned blouse is still open, so its line is held.
  await expect(page.getByText("Held", { exact: true })).toBeVisible();
  await noSideScroll(page);
  await axe(page);
  await page.screenshot({ path: "test-results/factory-earnings-mobile.png", fullPage: true });
  await page.goto("/seller");
  await noSideScroll(page);
  await axe(page);
  await page.screenshot({ path: "test-results/factory-owner-home-mobile.png", fullPage: true });
});

test("sales: filling baskets, returns and stock; cannot open earnings", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, DEMO_FACTORIES.ceylon.sales);
  await expect(page).toHaveURL(/\/seller$/);
  await expect(tabs(page)).toHaveText(["Returns", "Home", "Baskets", "Products", "Ratings"]);
  await expect(page.getByRole("heading", { name: "To pack" })).toHaveCount(0);
  // Ceylon's open basket fills at the Kollupitiya agent (Kamal Perera).
  const filling = page
    .getByRole("list", { name: "Filling baskets" })
    .getByRole("listitem", { name: "Kamal Perera", exact: true });
  const [open] = await sql<{ total: string }>(
    `SELECT b.total::text AS total FROM "Basket" b
     JOIN "Agent" ag ON ag.id = b."agentId"
     JOIN "User" au ON au.id = ag."userId"
     JOIN "User" f ON f.id = b."factoryId"
     WHERE au.email = $1 AND f.email = $2 AND b.status = 'OPEN'`,
    [DEMO.readyAgent, DEMO_FACTORIES.ceylon.owner],
  );
  const total = Number(open.total);
  expect(total).toBeGreaterThan(0);
  expect(total).not.toBe(50_000);
  // The basket's own total first, then the configured lock amount.
  const shown = total.toLocaleString("en-US", { maximumFractionDigits: 2 });
  await expect(filling).toContainText(new RegExp(`LKR\\s${shown}\\s*of LKR\\s50,000`));
  await expect(page.getByRole("heading", { name: "Returns" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Products and stock" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earnings and payouts" })).toHaveCount(0);
  await noSideScroll(page);
  await axe(page);
  await page.screenshot({ path: "test-results/factory-sales-mobile.png", fullPage: true });

  await page.goto("/seller/earnings");
  await expect(page).toHaveURL(/\/seller$/);
  await page.goto("/seller/orders");
  await expect(page).toHaveURL(/\/seller$/);

  await tabs(page).getByText("Baskets").click();
  await expect(page).toHaveURL(/\/seller\/baskets$/);
  await expect(
    page.getByRole("list", { name: "Filling baskets" }).getByRole("listitem", {
      name: "Kamal Perera",
      exact: true,
    }),
  ).toContainText("Filling");
  await noSideScroll(page);
  await axe(page);

  await tabs(page).getByText("Products").click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  const product = page.locator("li[id^='p-']").first();
  const size = product.getByRole("listitem", { name: /^Size / }).first();
  const left = async () =>
    Number((await size.getByText(/^(\d+ left|Sold out)$/).textContent())?.match(/\d+/)?.[0] ?? 0);
  const before = await left();
  await size.getByLabel(/Pieces of /).fill("5");
  await size.getByRole("button", { name: "Add" }).click();
  await expect.poll(left).toBe(before + 5);
});

test("factory staff: each job gets its own bottom tabs; the owner adds staff", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });

  await signIn(page, DEMO_FACTORIES.ceylon.packing);
  await expect(tabs(page)).toHaveText(["Home", "Orders"]);
  await page.goto("/seller/products");
  await expect(page).toHaveURL(/\/seller$/);
  await page.goto("/seller/earnings");
  await expect(page).toHaveURL(/\/seller$/);

  await signIn(page, DEMO_FACTORIES.ceylon.owner);
  await expect(tabs(page)).toHaveText(["Returns", "Home", "Orders", "Products", "Ratings", "Team"]);
  await tabs(page).getByText("Team").click();
  await expect(page.getByRole("listitem", { name: "Ruwan Perera" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Kamal Jayasuriya");
  await page.getByLabel("Email (they sign in with this)").fill("kamal@example.com");
  await page.getByLabel("Job", { exact: true }).selectOption("SALES");
  await page.getByLabel("Temporary password").fill("password123");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByRole("listitem", { name: "Kamal Jayasuriya" })).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({ path: "test-results/factory-team-mobile.png", fullPage: true });
});
