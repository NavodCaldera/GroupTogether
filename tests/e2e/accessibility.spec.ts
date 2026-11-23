import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

async function inspect(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

test("public pages are accessible without horizontal overflow", async ({ page }) => {
  for (const route of ["/", "/companies/hemas", "/packs/hemas-30-day", "/sign-up", "/sign-in"]) {
    await page.goto(route);
    await inspect(page);
  }
  await page.getByLabel("Email").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("buyer pages are accessible without horizontal overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("buyer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  for (const route of ["/", "/companies/hemas", "/baskets", "/tokens", "/account"]) {
    await page.goto(route);
    await inspect(page);
  }
  await page.goto("/baskets");
  await page.getByTestId("open-basket").first().click();
  await inspect(page);
});
