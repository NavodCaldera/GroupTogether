import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_FACTORIES, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Screenshot comparisons of stable, high-value screens. Baselines are per platform and were
// reviewed by hand before acceptance; they live beside this file. CI runs on Linux, which has
// no reviewed baselines yet, so these run locally only (see docs/qa/full-system-browser-audit.md).
test.skip(!!process.env.CI, "Baselines are reviewed per platform; Linux baselines not yet made");
test.use({
  viewport: { width: 360, height: 800 },
  contextOptions: { reducedMotion: "reduce" },
  colorScheme: "light",
});
test.describe.configure({ mode: "serial" });

const ids = { tee: "", cheap: "" };

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    ids.tee = (
      await db.query(
        `SELECT id FROM "Product" WHERE title = 'Crew-neck cotton tee (3-pack)' LIMIT 1`,
      )
    ).rows[0].id;
    ids.cheap = (
      await db.query(
        `SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
         WHERE u.email = $1 AND p.status = 'LIVE' ORDER BY p.price ASC, p.id ASC LIMIT 1`,
        [DEMO_FACTORIES.ceylon.owner],
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

test("Material Card at 360 px", async ({ page }) => {
  await page.goto(`/products/${ids.tee}`);
  const card = page.getByTestId("material-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole("heading", { name: "Combed cotton jersey" })).toBeVisible();
  await expect(card).toHaveScreenshot("material-card-360.png", { animations: "disabled" });
});

test("checkout summary at 360 px", async ({ page }) => {
  await signIn(page, DEMO_BUYERS.ayesha);
  await page.goto(`/products/${ids.cheap}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").getByText("Added to cart")).toBeVisible();
  await page.goto("/checkout");
  const summary = page.locator("dl").filter({ hasText: "PayHere fee" });
  await expect(summary.getByText("Total", { exact: true })).toBeVisible();
  await expect(summary).toHaveScreenshot("checkout-summary-360.png", { animations: "disabled" });
});
