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

test("public catalogue and sign-in are accessible without horizontal overflow", async ({
  page,
}) => {
  for (const route of ["/shop", "/sign-in"]) {
    await page.goto(route);
    await inspect(page);
  }
  await page.getByLabel("Email").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("buyer, admin, brand and packing workspaces remain usable at the configured viewport", async ({
  page,
}) => {
  // Sixteen sign-ins and scans; a cold dev server compiles each page on first visit.
  test.setTimeout(240_000);
  for (const [email, route] of [
    ["buyer@example.com", "/dashboard"],
    ["buyer@example.com", "/samples"],
    ["factory@groupbasket.lk", "/admin"],
    ["buyers@groupbasket.lk", "/admin/warehouse"],
    ["premium@groupbasket.lk", "/admin/brands"],
    ["brand@example.com", "/seller?tab=products"],
    ["seller@example.com", "/seller"],
    ["seller@example.com", "/seller/orders"],
    ["seller@example.com", "/seller/products"],
    ["seller@example.com", "/seller/insights"],
    ["seller@example.com", "/seller/team"],
    ["packing@example.com", "/seller"],
    ["packer@example.com", "/packing"],
  ]) {
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    await page.goto(route);
    await inspect(page);
  }
});
