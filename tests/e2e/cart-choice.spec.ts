import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_FACTORIES, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// The cart: tick items, then Agent pickup, My basket or Join a basket (spec 005, DEC-027).
test.use({ viewport: { width: 360, height: 740 } });
test.describe.configure({ mode: "serial" });

const BUYER = DEMO_BUYERS.ayesha;
/** Two Ceylon variants (different products) and one Lanka variant. */
const v = { ceylonA: "", ceylonB: "", lanka: "", kasunBasket: "" };

function pool() {
  return new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
}

async function fillCart() {
  const db = pool();
  try {
    await db.query(
      `DELETE FROM "CartItem" WHERE "buyerId" = (SELECT id FROM "User" WHERE email = $1)`,
      [BUYER],
    );
    for (const id of [v.ceylonA, v.ceylonB, v.lanka])
      await db.query(
        `INSERT INTO "CartItem" (id, "buyerId", "variantId", qty)
         SELECT 'e2e-' || md5(random()::text), u.id, $2, 1 FROM "User" u WHERE u.email = $1`,
        [BUYER, id],
      );
  } finally {
    await db.end();
  }
}

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = pool();
  try {
    const variantOf = async (factory: string, skip: number) =>
      (
        await db.query(
          `SELECT DISTINCT ON (p.id) v.id, p.id AS product FROM "Variant" v
           JOIN "Product" p ON p.id = v."productId" JOIN "User" u ON u.id = p."sellerId"
           WHERE u.email = $1 AND p.status = 'LIVE' AND v.available > 5
           ORDER BY p.id, v.id OFFSET $2 LIMIT 1`,
          [factory, skip],
        )
      ).rows[0].id as string;
    v.ceylonA = await variantOf(DEMO_FACTORIES.ceylon.owner, 0);
    v.ceylonB = await variantOf(DEMO_FACTORIES.ceylon.owner, 1);
    v.lanka = await variantOf(DEMO_FACTORIES.lanka.owner, 0);
    v.kasunBasket = (
      await db.query(
        `SELECT b.id FROM "Basket" b JOIN "User" u ON u.id = b."ownerId"
         WHERE u.email = $1 AND b.kind = 'OWN' AND b.status = 'OPEN' LIMIT 1`,
        [DEMO_BUYERS.kasun],
      )
    ).rows[0].id;
  } finally {
    await db.end();
  }
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

const tick = (page: Page, id: string) => page.locator(`input[name="sel"][value="${id}"]`);

test("nothing ticked disables the choices; mixed factories disable the baskets", async ({
  page,
}) => {
  await fillCart();
  await signIn(page, BUYER);
  await page.goto("/cart");
  const all = page.getByLabel("Select all");
  await expect(all).toBeChecked();
  const agent = page.getByRole("button", { name: "Agent pickup" });
  const mine = page.getByRole("button", { name: "My basket" });
  const join = page.getByRole("button", { name: "Join a basket" });
  // Everything ticked: two factories, so only agent pickup.
  await expect(agent).toBeEnabled();
  await expect(mine).toBeDisabled();
  await expect(join).toBeDisabled();
  await inspect(page);
  await all.uncheck();
  for (const b of [agent, mine, join]) await expect(b).toBeDisabled();
  await tick(page, v.ceylonA).check();
  await tick(page, v.ceylonB).check();
  for (const b of [agent, mine, join]) await expect(b).toBeEnabled();
});

test("two items of one factory go into a new basket; the third stays in the cart", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await fillCart();
  await signIn(page, BUYER);
  await page.goto("/cart");
  await page.getByLabel("Select all").uncheck();
  await tick(page, v.ceylonA).check();
  await tick(page, v.ceylonB).check();

  await page.getByRole("button", { name: "Join a basket" }).click();
  // Kasun's public Ceylon basket is offered.
  await expect(page.locator(`input[name="basketId"][value="${v.kasunBasket}"]`)).toBeVisible();
  await inspect(page);

  await page.getByRole("button", { name: "My basket" }).click();
  await expect(page.getByRole("radio", { name: "New basket" })).toBeChecked();
  await page.getByLabel("Delivery address").fill("7 Temple Road, Galle");
  await page.getByLabel("Town or area").fill("Galle");
  await page.getByLabel("Phone").fill("0771234567");
  await inspect(page);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back to basket" }).click();
  await expect(
    page.getByRole("heading", { name: DEMO_FACTORIES.ceylon.company, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("2 items")).toBeVisible();

  await page.goto("/cart");
  await expect(page.locator('input[name="sel"]')).toHaveCount(1);
  await expect(tick(page, v.lanka)).toHaveCount(1);
});
