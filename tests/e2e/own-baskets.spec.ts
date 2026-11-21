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

/** Empties the buyer's cart, adds one of the product, and opens the Cart. */
async function addOneAndOpenCart(page: Page, email: string) {
  const db = pool();
  try {
    await db.query(
      `DELETE FROM "CartItem" WHERE "buyerId" = (SELECT id FROM "User" WHERE email = $1)`,
      [email],
    );
  } finally {
    await db.end();
  }
  await page.goto(`/products/${ids.product}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByLabel("Select all")).toBeChecked();
}

/** Pays for the ticked cart item with the demo gateway. */
async function chooseOneAndPay(page: Page, button: string) {
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  // An own-basket payment leads to that order, where the basket is.
  await page.getByRole("link", { name: "Your order" }).click();
  await expect(page).toHaveURL(/\/orders\/c/);
}

test("a buyer starts a public own basket; it waits for the minimum items", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.nimali);
  await addOneAndOpenCart(page, DEMO_BUYERS.nimali);
  await inspect(page);
  await page.getByRole("button", { name: "My basket" }).click();
  await expect(page.getByRole("radio", { name: "New basket" })).toBeChecked();
  await inspect(page);
  // Prefilled from the profile; the owner may change them for this basket.
  await expect(page.getByLabel("Delivery address")).not.toHaveValue("");
  await expect(page.getByLabel("Phone")).not.toHaveValue("");
  await page.getByLabel("Delivery address").fill("12 Lake Road, Kandy");
  await page.getByLabel("Town or area").fill("Kandy");
  await page.getByLabel("Phone").fill("0771234567");
  await chooseOneAndPay(page, "Pay");

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
  // Ordered sizes leave the cart.
  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  // A basket member opening the basket page lands on their order page (owner, 2026-11-21).
  await page.goto(`/own-baskets/${ids.basket}`);
  await expect(page).toHaveURL(/\/orders\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Filling", level: 1 })).toBeVisible();
  // Below the minimum the button is disabled and says why.
  const place = page.getByRole("button", { name: "Place order" });
  await expect(place).toBeDisabled();
  await expect(place).toHaveAccessibleDescription("1 of 2 items · needs 1 more");
  // No share links (DEC-028).
  await expect(page.getByLabel("Who can join")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share basket" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Buyers" })).toBeVisible();
  await expect(page.getByText("Total", { exact: true })).toBeVisible();
  await expect(page.getByText(/cancel/i)).toHaveCount(0);
  await expect(page.getByText("12 Lake Road, Kandy", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage basket|View basket/ })).toHaveCount(0);
  await inspect(page);
});

test("another buyer asks, the owner accepts, the buyer pays", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  await addOneAndOpenCart(page, DEMO_BUYERS.ravindu);
  await page.getByRole("button", { name: "Join a basket" }).click();
  const row = page.locator(`[data-basket="${ids.basket}"]`);
  await row.getByRole("button", { name: /^Ask to join/ }).click();
  await expect(row.getByText("Asked")).toBeVisible();
  // Joiners never see the owner's address.
  await expect(page.getByText("12 Lake Road")).toHaveCount(0);
  await inspect(page);

  await signIn(page, DEMO_BUYERS.nimali);
  await page.goto(`/own-baskets/${ids.basket}`);
  await expect(page.getByRole("heading", { name: "Requests · 1" })).toBeVisible();
  await inspect(page);
  await page.getByRole("button", { name: /^Accept / }).click();
  await expect(page.getByRole("heading", { name: /^Requests/ })).toHaveCount(0);

  await signIn(page, DEMO_BUYERS.ravindu);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Join a basket" }).click();
  await page.locator(`input[name="basketId"][value="${ids.basket}"]`).check();
  await chooseOneAndPay(page, "Pay");
  await expect(page.getByRole("heading", { name: "Filling", level: 1 })).toBeVisible();
  await expect(page.getByText("12 Lake Road")).toHaveCount(0);
});

test("the owner hears of the join and places the order", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, DEMO_BUYERS.nimali);
  await page.goto("/notifications");
  await expect(page.getByText("Someone joined your basket").first()).toBeVisible();
  await page.goto(`/own-baskets/${ids.basket}`);
  await expect(page.getByText(/needs \d+ more/)).toHaveCount(0);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: "Packing" })).toBeVisible();
  await page.reload();
  await expect(page.locator('[aria-current="step"]', { hasText: "Packing" })).toBeVisible();
  await inspect(page);
});
