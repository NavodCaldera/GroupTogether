import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_FACTORIES, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Own baskets (DEC-023). Reduced motion: product pages show the 3D body (see fit.spec.ts).
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const ids = { product: "", basket: "" };

function pool() {
  return new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
}

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = pool();
  try {
    ids.product = (
      await db.query(
        `SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
         WHERE u.email = $1 AND p.status = 'LIVE' ORDER BY p.price DESC, p.id ASC LIMIT 1`,
        [DEMO_FACTORIES.ceylon.owner],
      )
    ).rows[0].id;
    // Two items fill the basket, so one owner and one joiner can place the order.
    await db.query(`UPDATE "Settings" SET "ownMinItems" = 2 WHERE id = 1`);
  } finally {
    await db.end();
  }
});

test.afterAll(async () => {
  const db = pool();
  try {
    await db.query(`UPDATE "Settings" SET "ownMinItems" = 10 WHERE id = 1`);
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

/** One of the first size that has stock, then the demo gateway pays. */
async function chooseOneAndPay(page: Page, button: string) {
  await page.locator('input[name^="qty-"]:not([disabled])').first().fill("1");
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
}

test("a buyer starts a public own basket; it waits for the minimum items", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.nimali);
  await page.goto(`/products/${ids.product}`);
  await page.getByRole("link", { name: "Start own basket" }).click();
  await expect(page.getByRole("heading", { name: "Start own basket", level: 1 })).toBeVisible();
  await inspect(page);
  await page.getByLabel("Delivery address").fill("12 Lake Road, Kandy");
  await page.getByLabel("Town or area").fill("Kandy");
  await page.getByLabel("Phone").fill("0771234567");
  await page.getByLabel("Who can join").selectOption("PUBLIC");
  await chooseOneAndPay(page, "Pay and start");

  const db = pool();
  try {
    ids.basket = (
      await db.query(
        `SELECT b.id FROM "Basket" b JOIN "User" u ON u.id = b."ownerId"
         WHERE u.email = $1 AND b.kind = 'OWN' ORDER BY b."createdAt" DESC LIMIT 1`,
        [DEMO_BUYERS.nimali],
      )
    ).rows[0].id;
  } finally {
    await db.end();
  }
  await page.goto(`/own-baskets/${ids.basket}`);
  await expect(page.getByText("12 Lake Road, Kandy", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await inspect(page);
});

test("another buyer joins from the product page without an agent", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  await page.goto(`/products/${ids.product}`);
  await page.locator(`a[href="/own-baskets/${ids.basket}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/own-baskets/${ids.basket}`));
  // Joiners never see the owner's address.
  await expect(page.getByText("12 Lake Road")).toHaveCount(0);
  await inspect(page);
  await chooseOneAndPay(page, "Pay and add");
});

test("the owner hears of the join and places the order", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, DEMO_BUYERS.nimali);
  await page.goto("/notifications");
  await expect(page.getByText("Someone joined your basket").first()).toBeVisible();
  await page.goto(`/own-baskets/${ids.basket}`);
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Packing", { exact: true })).toBeVisible();
  await inspect(page);
});
