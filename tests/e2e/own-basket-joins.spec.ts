import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Joining the seeded own baskets (prisma/seed.ts): Kasun's public Oxford shirts (5 of 10),
// Ishara's public polo shirts (9 of 10) and Dinithi's link-only running shorts. Minimum 10.
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const seeded = {
  kasun: { basket: "", product: "" },
  ishara: { basket: "", product: "" },
  dinithi: { basket: "", product: "", code: "" },
};

function pool() {
  return new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
}

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = pool();
  try {
    for (const who of ["kasun", "ishara", "dinithi"] as const) {
      const row = (
        await db.query(
          `SELECT b.id, b."shareCode",
             (SELECT v."productId" FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
              JOIN "Variant" v ON v.id = l."variantId" WHERE o."basketId" = b.id
              ORDER BY l.id LIMIT 1) AS "productId"
           FROM "Basket" b JOIN "User" u ON u.id = b."ownerId"
           WHERE u.email = $1 AND b.kind = 'OWN' AND b.status = 'OPEN' LIMIT 1`,
          [DEMO_BUYERS[who]],
        )
      ).rows[0];
      seeded[who].basket = row.id;
      seeded[who].product = row.productId;
      if (who === "dinithi") seeded.dinithi.code = row.shareCode;
    }
    await db.query(
      `DELETE FROM "CartItem" WHERE "buyerId" IN (SELECT id FROM "User" WHERE email = ANY($1))`,
      [[DEMO_BUYERS.ravindu, DEMO_BUYERS.sachini]],
    );
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
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

async function addToCart(page: Page, productId: string) {
  await page.goto(`/products/${productId}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
}

/** From the cart: Join a basket, pick it, pay with the demo gateway, Back to basket. */
async function joinFromCart(page: Page, basketId: string) {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Join a basket" }).click();
  await page.locator(`input[name="basketId"][value="${basketId}"]`).check();
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back to basket" }).click();
  await expect(page).toHaveURL(new RegExp(`/own-baskets/${basketId}`));
}

/** The cart's sizes come prefilled; the demo gateway pays; Back to basket. */
async function payAndAdd(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('input[name^="qty-"]')
        .evaluateAll((els) => (els as HTMLInputElement[]).some((e) => e.value !== "")),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Pay and add" }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Back to basket" }).click();
  await expect(page).toHaveURL(/\/own-baskets\/c/);
}

test("the cart lists only open public baskets of the factory in it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  await addToCart(page, seeded.kasun.product);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Join a basket" }).click();
  const offered = (id: string) => page.locator(`input[name="basketId"][value="${id}"]`);
  await expect(offered(seeded.kasun.basket)).toBeVisible();
  // Other factories' baskets and link-only baskets are not offered.
  await expect(offered(seeded.ishara.basket)).toHaveCount(0);
  await expect(offered(seeded.dinithi.basket)).toHaveCount(0);
  // A joiner never sees the owner's address.
  await expect(page.getByText("45 High Level Road")).toHaveCount(0);
  await inspect(page);

  await joinFromCart(page, seeded.kasun.basket);
  await expect(page.getByText("45 High Level Road")).toHaveCount(0);
  await inspect(page);
  await expect(page.getByText(/6 items/)).toBeVisible();
  // The joined size left the cart.
  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("a link-only basket needs its code", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  const without = await page.goto(`/own-baskets/${seeded.dinithi.basket}`);
  expect(without?.status()).toBe(404);
  const wrong = await page.goto(`/own-baskets/${seeded.dinithi.basket}?code=wrong`);
  expect(wrong?.status()).toBe(404);
  await addToCart(page, seeded.dinithi.product);
  await page.goto(`/own-baskets/${seeded.dinithi.basket}?code=${seeded.dinithi.code}`);
  await expect(page.getByRole("button", { name: "Pay and add" })).toBeVisible();
  await inspect(page);
  await payAndAdd(page);
});

test("the owner cannot place the order below the minimum", async ({ page }) => {
  await signIn(page, DEMO_BUYERS.ishara);
  await page.goto(`/own-baskets/${seeded.ishara.basket}`);
  const place = page.getByRole("button", { name: "Place order" });
  await expect(place).toBeDisabled();
  await expect(place).toHaveAccessibleDescription("1 more item needed · 9 of 10");
  await expect(page.getByText("102 Peradeniya Road", { exact: false })).toBeVisible();
  await inspect(page);
});

test("a joiner takes the basket to the minimum and the owner places it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.sachini);
  await addToCart(page, seeded.ishara.product);
  await joinFromCart(page, seeded.ishara.basket);

  await signIn(page, DEMO_BUYERS.ishara);
  await page.goto(`/own-baskets/${seeded.ishara.basket}`);
  await expect(page.getByText(/more item/)).toHaveCount(0);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: "Packing" })).toBeVisible();
  await page.reload();
  await expect(page.locator('[aria-current="step"]', { hasText: "Packing" })).toBeVisible();
  // Once placed, the basket is no longer offered on the cart.
  await signIn(page, DEMO_BUYERS.ravindu);
  await addToCart(page, seeded.ishara.product);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Join a basket" }).click();
  await expect(page.locator(`input[name="basketId"][value="${seeded.ishara.basket}"]`)).toHaveCount(
    0,
  );
});
