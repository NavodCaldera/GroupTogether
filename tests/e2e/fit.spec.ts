import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_ADMINS, DEMO_BUYERS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// The personalized fit heatmap (DEC-020) on the seeded tee: Dilan has measurements.
test.use({ viewport: { width: 360, height: 740 } });
test.describe.configure({ mode: "serial" });

let tee = "";

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    tee = (
      await db.query(
        `SELECT id FROM "Product" WHERE title = 'Crew-neck cotton tee (3-pack)' LIMIT 1`,
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

const noSideScroll = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

test("a measured buyer sees the heatmap and switching size shifts the areas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, DEMO_BUYERS.dilan);
  await page.goto(`/products/${tee}`);
  const fit = page.getByRole("region", { name: "Fit" });
  await fit.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("fit-recommended")).toHaveText(/^(S|M|L|XL)$/);
  await expect(fit.getByText("Guidance, not a guarantee")).toBeVisible();
  await expect(fit.getByText("Comfortable 22–32°C, breathable for Colombo humidity")).toBeVisible();

  const regions = page.getByTestId("fit-regions");
  await fit.getByRole("button", { name: "S", exact: true }).click();
  const small = await regions.innerText();
  await fit.getByRole("button", { name: "XL", exact: true }).click();
  const large = await regions.innerText();
  expect(small).not.toEqual(large);
  expect(small).toMatch(/Tight|Snug/);

  // The viewer loads the simulated garment and renders into a canvas.
  await expect(fit.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await fit.getByRole("button", { name: "Reach" }).click();
  await fit.getByLabel("Heatmap").uncheck();
  await expect(fit.locator("canvas")).toBeVisible();
  await noSideScroll(page);
  const scan = await new AxeBuilder({ page })
    .include('[aria-labelledby="fit-title"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a buyer without measurements is offered the fit report and can type them in", async ({
  page,
}) => {
  await signIn(page, DEMO_BUYERS.tharindu);
  await page.goto(`/products/${tee}`);
  await expect(page.getByText("Get your fit report")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Size chart (cm)" })).toBeVisible();
  await page.getByRole("link", { name: "Measure me" }).click();
  await expect(page.getByRole("heading", { name: "My measurements" })).toBeVisible();
  await page.getByLabel("Height (cm)").fill("170");
  await page.getByLabel("Chest (cm)").fill("94");
  await page.getByLabel("Waist (cm)").fill("84");
  await expect(page.getByTestId("range-chest")).toHaveText("93–95");
  await page.getByLabel("Save my measurements to my account").check();
  await page.getByRole("button", { name: "Save measurements" }).click();
  await page.waitForURL(`**/products/${tee}`);
  await expect(page.getByTestId("fit-recommended")).toBeVisible();
  await noSideScroll(page);

  await page.goto("/account/fit");
  await page.getByRole("button", { name: "Delete my measurements" }).click();
  await page.goto(`/products/${tee}`);
  await expect(page.getByText("Get your fit report")).toBeVisible();
});

test("the factory admin approves fit data from the Fit tab", async ({ page }) => {
  await signIn(page, DEMO_ADMINS.FACTORY);
  await page.goto("/admin/factory/fit");
  await expect(page.getByRole("heading", { name: "Fit", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing to check")).toBeVisible();
  await page.goto(`/admin/products/${tee}`);
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove approval" }).click();
  await expect(page.getByText("To check", { exact: true })).toBeVisible();
  await page.goto("/admin/factory/fit");
  await page.getByRole("link", { name: /Crew-neck cotton tee/ }).click();
  await page.getByRole("button", { name: "Approve fit data" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});
