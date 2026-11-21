import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Joining the seeded own baskets (prisma/seed.ts) by request (DEC-028): Kasun's Oxford shirts
// (Ceylon, 5 of 10, Dilan's request waiting), Ishara's polo shirts (Lanka, 9 of 10) and Dinithi's
// running shorts (Lanka). Minimum 10.
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const seeded = {
  kasun: { basket: "", product: "" },
  ishara: { basket: "", product: "" },
  dinithi: { basket: "", product: "" },
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
          `SELECT b.id,
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
    }
    await db.query(
      `DELETE FROM "CartItem" WHERE "buyerId" IN (SELECT id FROM "User" WHERE email = ANY($1))`,
      [[DEMO_BUYERS.ravindu, DEMO_BUYERS.sachini, DEMO_BUYERS.dilan]],
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

/** The Join a basket row for this basket (its Ask form, Asked/Declined badge or Pay radio). */
const row = (page: Page, basketId: string) => page.locator(`[data-basket="${basketId}"]`);

async function openJoin(page: Page) {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Join a basket" }).click();
}

async function payInto(page: Page, basketId: string) {
  await openJoin(page);
  await page.locator(`input[name="basketId"][value="${basketId}"]`).check();
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Your order" }).click();
  await expect(page).toHaveURL(/\/orders\/c/);
}

test("join a basket lists every open basket of the factory; asking waits for the owner", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  await addToCart(page, seeded.kasun.product);
  await openJoin(page);
  await expect(
    row(page, seeded.kasun.basket).getByRole("button", { name: /^Ask to join/ }),
  ).toBeVisible();
  // Other factories' baskets are not offered; nothing can be paid yet.
  await expect(row(page, seeded.ishara.basket)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pay", exact: true })).toHaveCount(0);
  // A joiner never sees the owner's address, and there is no share link anywhere.
  await expect(page.getByText("45 High Level Road")).toHaveCount(0);
  await expect(page.getByText(/share/i)).toHaveCount(0);
  await inspect(page);

  await row(page, seeded.kasun.basket)
    .getByRole("button", { name: /^Ask to join/ })
    .click();
  await expect(row(page, seeded.kasun.basket).getByText("Asked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay", exact: true })).toHaveCount(0);
  // Old basket links are not a way in.
  const stranger = await page.goto(`/own-baskets/${seeded.dinithi.basket}`);
  expect(stranger?.status()).toBe(404);
});

test("the owner accepts one request and declines another", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, DEMO_BUYERS.kasun);
  await page.goto("/notifications");
  await expect(page.getByText("Join request").first()).toBeVisible();
  await page.goto(`/own-baskets/${seeded.kasun.basket}`);
  await expect(page.getByRole("heading", { name: "Requests · 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share basket" })).toHaveCount(0);
  await expect(page.getByLabel("Who can join")).toHaveCount(0);
  await inspect(page);
  await page.getByRole("button", { name: /^Accept Ravindu/ }).click();
  await expect(page.getByRole("heading", { name: "Requests · 1" })).toBeVisible();
  await page.getByRole("button", { name: /^Decline Dilan/ }).click();
  await expect(page.getByRole("heading", { name: /^Requests/ })).toHaveCount(0);
});

test("the accepted buyer pays; the declined one cannot", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.ravindu);
  await page.goto("/notifications");
  await expect(page.getByText("Request accepted").first()).toBeVisible();
  await payInto(page, seeded.kasun.basket);
  await expect(page.getByText(/6 of 10 items/)).toBeVisible();
  await inspect(page);
  // The paid item left the cart.
  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty")).toBeVisible();

  await signIn(page, DEMO_BUYERS.dilan);
  await addToCart(page, seeded.kasun.product);
  await openJoin(page);
  await expect(row(page, seeded.kasun.basket).getByText("Declined")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay", exact: true })).toHaveCount(0);
});

test("the owner cannot place the order below the minimum", async ({ page }) => {
  await signIn(page, DEMO_BUYERS.ishara);
  await page.goto(`/own-baskets/${seeded.ishara.basket}`);
  await expect(page).toHaveURL(/\/orders\/c/);
  const place = page.getByRole("button", { name: "Place order" });
  await expect(place).toBeDisabled();
  await expect(place).toHaveAccessibleDescription("9 of 10 items · needs 1 more");
  await expect(page.getByText("102 Peradeniya Road", { exact: false })).toBeVisible();
  await inspect(page);
});

test("a joiner takes the basket to the minimum and the owner places it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO_BUYERS.sachini);
  await addToCart(page, seeded.ishara.product);
  await openJoin(page);
  await row(page, seeded.ishara.basket)
    .getByRole("button", { name: /^Ask to join/ })
    .click();
  await expect(row(page, seeded.ishara.basket).getByText("Asked")).toBeVisible();

  await signIn(page, DEMO_BUYERS.ishara);
  await page.goto(`/own-baskets/${seeded.ishara.basket}`);
  await page.getByRole("button", { name: /^Accept / }).click();

  await signIn(page, DEMO_BUYERS.sachini);
  await payInto(page, seeded.ishara.basket);

  await signIn(page, DEMO_BUYERS.ishara);
  await page.goto(`/own-baskets/${seeded.ishara.basket}`);
  await expect(page.getByText(/needs \d+ more/)).toHaveCount(0);
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.locator('[aria-current="step"]', { hasText: "Packing" })).toBeVisible();
  // Once placed, the basket is no longer offered on the cart.
  await signIn(page, DEMO_BUYERS.ravindu);
  await addToCart(page, seeded.ishara.product);
  await openJoin(page);
  await expect(row(page, seeded.ishara.basket)).toHaveCount(0);
});
