import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { Client } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_ADMINS, DEMO_FACTORIES } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

test.describe.configure({ mode: "serial" });
test.beforeAll(seedBrowserFixtures);

/** Rows the seed does not make (missing reports, a payout draft), written to the test DB. */
async function sql(text: string, values: unknown[] = []) {
  config({ quiet: true });
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function inspect(page: Page, scan = true) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  if (!scan) return;
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

const flash = (page: Page, text: string) => page.getByRole("status").getByText(text);

test("each admin lands in their area and is sent home from the others", async ({ page }) => {
  test.setTimeout(240_000);
  const areas = [
    {
      email: DEMO_ADMINS.AGENTS,
      home: "/admin/agents",
      title: "Agents and orders",
      tabs: [
        "Agents and orders",
        "Applications",
        "Deposits",
        "2-month baskets",
        "Search",
        "Buyer returns",
        "Return pickups",
        "Buyers",
      ],
      pages: [
        "/admin/agents/applications",
        "/admin/agents/deposits",
        "/admin/agents/baskets",
        "/admin/agents/search?q=0752222201",
        "/admin/agents/returns",
      ],
      denied: [
        "/admin/core/payouts",
        "/admin/core/tokens",
        "/admin/core/returns",
        "/admin/factory/missing",
        "/admin/brands",
        "/admin/users/new-seller",
        "/admin/users/new-admin",
      ],
      addUser: null,
    },
    {
      email: DEMO_ADMINS.FACTORY,
      home: "/admin/factory",
      title: "Apparel and factories",
      tabs: ["Factories", "Missing items", "Applications", "Quality", "Returns"],
      pages: ["/admin/factory/missing"],
      denied: [
        "/admin/agents",
        "/admin/agents/search",
        "/admin/agents/returns",
        "/admin/core/returns",
        "/admin/core/payouts",
        "/admin/settings",
        "/admin/brands",
        "/admin/users/new-admin",
      ],
      addUser: "Add factory",
    },
    {
      email: DEMO_ADMINS.CORE,
      home: "/admin/core/payouts",
      title: "Payouts",
      tabs: ["Payouts", "Tokens", "Settings", "Admins", "Returns", "Buyer returns", "Quality"],
      pages: [
        "/admin/core/payouts",
        "/admin/core/tokens?q=buyer3@example.com",
        "/admin/settings",
        "/admin/core/returns",
      ],
      denied: [
        "/admin/agents",
        "/admin/agents/applications",
        "/admin/agents/returns",
        "/admin/factory/missing",
        "/admin/brands",
      ],
      addUser: "Add admin",
    },
    {
      email: DEMO_ADMINS.PREMIUM,
      home: "/admin/brands",
      title: "Brand rewards",
      tabs: ["Luxury brands", "Users"],
      pages: [],
      denied: [
        "/admin/agents",
        "/admin/factory/missing",
        "/admin/core/payouts",
        "/admin/settings",
        "/admin/users/new-admin",
      ],
      addUser: "Add luxury brand",
      // Unchanged by the agent model; its own spec scans it.
      scan: false,
    },
  ];
  for (const area of areas) {
    await signIn(page, area.email);
    await expect(page).toHaveURL(new RegExp(area.home + "$"));
    await expect(page.getByRole("heading", { level: 1, name: area.title })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin workspace" });
    for (const tab of area.tabs)
      await expect(nav.getByRole("link", { name: new RegExp(`^${tab}`) }).first()).toBeVisible();
    for (const route of area.denied) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(area.home + "$"));
    }
    await page.goto("/admin/users");
    if (area.addUser) await expect(page.getByRole("link", { name: area.addUser })).toBeVisible();
    if (area.addUser !== "Add admin")
      await expect(page.getByRole("link", { name: "Add admin" })).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 800 });
    for (const route of [area.home, ...area.pages]) {
      await page.goto(route);
      await inspect(page, area.scan ?? true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Application photos are private to the Agents and orders admin.
  const [applicant] = await sql(`SELECT id FROM "Agent" WHERE status = 'APPLIED' LIMIT 1`);
  expect((await page.request.get(`/api/agent-photos/${applicant.id}?k=nic`)).status()).toBe(404);
  await signIn(page, DEMO_ADMINS.AGENTS);
  expect((await page.request.get(`/api/agent-photos/${applicant.id}?k=nic`)).status()).toBe(200);
});

test("only the core admin adds admins; each lands in their own area", async ({ page }) => {
  test.setTimeout(120_000);
  const homes = { PREMIUM: "/admin/brands", FACTORY: "/admin/factory", AGENTS: "/admin/agents" };
  for (const [index, [area, home]] of Object.entries(homes).entries()) {
    await signIn(page, DEMO_ADMINS.CORE);
    await page.goto("/admin/users");
    await page.getByRole("link", { name: "Add admin" }).click();
    const email = `${area.toLowerCase()}-operator@example.com`;
    await page.getByLabel("Area").selectOption(area);
    await page.getByLabel("Name", { exact: true }).fill(area + " operator");
    await page.getByLabel("Email (they sign in with this)").fill(email);
    await page.getByLabel("Mobile", { exact: true }).fill("077123456" + index);
    await page.getByLabel("Temporary password").fill("password123");
    await page.getByRole("button", { name: "Create admin account", exact: true }).click();
    await page.waitForURL("**/admin/users");
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(home + "$"));
  }
});

test("Agents and orders books a courier for the packed basket", async ({ page }) => {
  await signIn(page, DEMO_ADMINS.AGENTS);
  await page.setViewportSize({ width: 360, height: 800 });
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: `${DEMO_FACTORIES.ceylon.company} → Suresh Kumar` }),
  });
  await expect(card.getByText("Packed", { exact: true })).toBeVisible();
  await card.getByLabel("Courier fee (LKR)").fill("1350");
  await card.getByLabel("Driver", { exact: true }).fill("Kamal Perera");
  await card.getByLabel("Driver phone").fill("0779876543");
  await card.getByLabel("Vehicle").fill("WP-CAB-1122");
  await card.getByRole("button", { name: "Book" }).click();
  await expect(flash(page, "Courier booked")).toBeVisible();
  await expect(card.getByText("Booked", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Re-book" })).toBeVisible();
  await expect(card.getByLabel("Vehicle")).toHaveValue("WP-CAB-1122");

  await page.getByRole("link", { name: /^Applications/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Ishani Silva" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Map:/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ishani Silva: NIC" })).toBeVisible();
});

test("Factory admin dismisses one missing report and removes the other line", async ({ page }) => {
  // Both lines of the LOCKED basket (Wellawatte × Ceylon) are reported short.
  await sql(
    `UPDATE "OrderLine" SET "missingReportedQty" = 1, "missingNote" = 'Out of stock',
       "missingReportedAt" = now()
     WHERE id IN (SELECT l.id FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
       JOIN "Basket" b ON b.id = o."basketId" WHERE b.status = 'LOCKED' AND o.status = 'PAID')`,
  );
  await signIn(page, DEMO_ADMINS.FACTORY);
  await page
    .getByRole("link", { name: /^Missing items/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/factory\/missing$/);
  const cards = page.getByRole("listitem").filter({ hasText: "Out of stock" });
  await expect(cards).toHaveCount(2);
  await cards.first().getByRole("button", { name: "Dismiss" }).click();
  await expect(flash(page, "Report dismissed")).toBeVisible();
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole("button", { name: "Remove" }).click();
  await expect(flash(page, "Line removed")).toBeVisible();
  await expect(page.getByText("No missing items")).toBeVisible();
  const lines = await sql(
    `SELECT l."missingQty", l."missingReportedQty" FROM "OrderLine" l
     JOIN "Order" o ON o.id = l."orderId" JOIN "Basket" b ON b.id = o."basketId"
     WHERE b.status = 'LOCKED' AND o.status = 'PAID' ORDER BY l."missingQty"`,
  );
  expect(lines.map((l) => [l.missingQty, l.missingReportedQty])).toEqual([
    [0, 0],
    [1, 0],
  ]);
});

test("Core admin marks a payout paid with the bank reference", async ({ page }) => {
  await sql(
    `INSERT INTO "FactoryPayout" (id, "factoryId", "weekEnding", gross, deductions, net)
     SELECT 'e2e-payout', id, now(), 12500, 160, 12340 FROM "User" WHERE email = $1`,
    [DEMO_FACTORIES.ceylon.owner],
  );
  await signIn(page, DEMO_ADMINS.CORE);
  await page.getByRole("link", { name: /^Payouts/ }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  const draft = page.getByRole("listitem").filter({ hasText: DEMO_FACTORIES.ceylon.company });
  await expect(draft.getByText(/12,340/)).toBeVisible();
  await draft.getByLabel("Bank reference").fill("BOC-778812");
  await draft.getByRole("button", { name: "Mark paid" }).click();
  await expect(flash(page, "Marked paid")).toBeVisible();
  await expect(page.getByText("No payouts to pay")).toBeVisible();
  await expect(page.getByRole("region", { name: "Paid" }).getByText("BOC-778812")).toBeVisible();

  await page.getByRole("link", { name: /^Tokens/ }).click();
  await page.getByLabel("Email or phone").fill("buyer3@example.com");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Tharindu/ })).toBeVisible();
  await expect(page.getByText("Order cancelled").first()).toBeVisible();
});
