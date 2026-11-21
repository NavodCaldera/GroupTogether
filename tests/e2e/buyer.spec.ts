import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO, DEMO_FACTORIES, DEMO_PASSWORD, DEMO_PICKUP_CODE } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Reduced motion: product pages show the 3D body, which the software-drawn test browser animates
// too slowly (see fit.spec.ts).
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const ids = { product: "", agent: "", agentName: "" };

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    ids.product = (
      await db.query(
        `SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
         WHERE u.email = $1 AND p.status = 'LIVE' ORDER BY p.price ASC, p.id ASC LIMIT 1`,
        [DEMO_FACTORIES.ceylon.owner],
      )
    ).rows[0].id;
    const agent = (
      await db.query(
        `SELECT a.id, u.name FROM "Agent" a JOIN "User" u ON u.id = a."userId" WHERE u.email = $1`,
        [DEMO.readyAgent],
      )
    ).rows[0];
    ids.agent = agent.id;
    ids.agentName = agent.name;
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

test("buyer collects, buys at the nearest agent, pays and cancels while the basket is open", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, DEMO.readyBuyer);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ready to collect" })).toBeVisible();
  await expect(page.getByText(DEMO_PICKUP_CODE, { exact: true })).toBeVisible();
  await expect(page.getByText(ids.agentName).first()).toBeVisible();
  // The agent fee is paid in cash at the counter (DEC-019).
  await expect(page.getByText(/^Agent fee LKR/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Map/ }).first()).toHaveAttribute(
    "href",
    /^https:\/\/maps\.google\.com\/\?q=6\.9115,79\.8505$/,
  );
  await inspect(page);

  await page.goto(`/products/${ids.product}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await inspect(page);
  // The cart is reachable from every page, not only from the toast.
  await page.goto("/shop");
  await page.getByRole("link", { name: /^Cart, [1-9]\d* items?$/ }).click();
  await expect(page).toHaveURL(/\/cart$/);
  // + and − save at once; there is no Update button.
  const qty = page.getByLabel(/^Quantity of /).first();
  const before = Number(await qty.inputValue());
  const units = async () =>
    Number(
      (await page.getByRole("link", { name: /^Cart, / }).getAttribute("aria-label"))!.match(
        /\d+/,
      )![0],
    );
  const total = await units();
  await page
    .getByRole("button", { name: /^One more / })
    .first()
    .click();
  await expect.poll(units).toBe(total + 1);
  await page.reload();
  await expect(page.getByLabel(/^Quantity of /).first()).toHaveValue(String(before + 1));
  await page
    .getByRole("button", { name: /^One less / })
    .first()
    .click();
  await expect.poll(units).toBe(total);
  await page.reload();
  await expect(page.getByLabel(/^Quantity of /).first()).toHaveValue(String(before));
  await page.getByRole("button", { name: "Checkout" }).click();

  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  const nearest = page.getByRole("radio", { name: new RegExp(ids.agentName) });
  await expect(nearest).toBeChecked();
  await expect(page.getByText(/\d+ m away/).first()).toBeVisible();
  for (const line of ["Item", "Tokens", "PayHere fee", "Total", "Agent fee at pickup"])
    await expect(page.getByRole("main").getByText(line, { exact: true })).toBeVisible();
  await inspect(page);
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paid", level: 1 })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Orders" }).click();

  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "In progress" })).toBeVisible();
  const paid = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.locator('[aria-current="step"]', { hasText: "Filling" }) })
    .first();
  await expect(paid.getByText(/of LKR\s?50,000/)).toBeVisible();
  await inspect(page);
  await paid.getByRole("link").first().click();

  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Basket progress" })).toBeVisible();
  await expect(page.getByText("Agent fee at pickup", { exact: true })).toBeVisible();
  await inspect(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share basket" }).first()).toBeVisible();
  // Ready orders sort first; the basket just paid into is still filling.
  await expect(
    page
      .getByRole("list", { name: "Order progress" })
      .locator('[aria-current="step"]', { hasText: "Filling" })
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/of LKR\s?50,000/).first()).toBeVisible();

  await page.goto("/orders");
  await page
    .getByRole("listitem")
    .filter({ has: page.locator('[aria-current="step"]', { hasText: "Filling" }) })
    .first()
    .getByRole("link")
    .first()
    .click();
  await page.getByText("Cancel order").click();
  await page.getByRole("button", { name: "Confirm cancel" }).click();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
});

test("a buyer with a return sees where and when to hand it over", async ({ page }) => {
  await signIn(page, DEMO.returnBuyer);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Return to hand over" })).toBeVisible();
  await expect(page.getByText(/^Due /).first()).toBeVisible();
  await inspect(page);
});

test("the token buyer pays with tokens and sends tokens", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, DEMO.tokenBuyer);
  await page.goto("/tokens");
  await expect(page.getByTestId("token-balance")).toBeVisible();
  await inspect(page);
  await page.getByLabel("Phone or email").fill(DEMO.readyBuyer);
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status").getByText("Tokens sent")).toBeVisible();
  await expect(page.getByText("-LKR").first()).toBeVisible();

  await page.goto(`/products/${ids.product}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
  await page.goto("/checkout");
  const balance = await page.getByLabel(/^Tokens/).getAttribute("max");
  await page.getByLabel(/^Tokens/).fill(balance!);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/tokens=/);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
});
