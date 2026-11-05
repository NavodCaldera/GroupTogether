import { expect, test, type Page } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("factory: home on a phone → orders → mark packed → stock edit", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, "seller@example.com");
  await expect(page).toHaveURL(/\/seller$/);

  // Alerts, the orders-to-pack card and this month's three paid figures fit without scrolling.
  const card = page.getByRole("link", { name: /Orders to pack: 1/ });
  await expect(card).toBeInViewport();
  await expect(page.getByText("Sold (paid)", { exact: true })).toBeInViewport();
  await expect(page.getByText("Delivered", { exact: true })).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.screenshot({ path: "test-results/factory-home-mobile.png", fullPage: true });
  await card.click();
  await expect(page).toHaveURL(/\/seller\/orders$/);
  await page.screenshot({ path: "test-results/factory-orders-mobile.png", fullPage: true });
  const pack = page.getByRole("button", { name: "Mark packed" });
  await pack.click();
  await expect(page.getByRole("button", { name: "Packed ✓" })).toBeDisabled();
  await expect(page.getByText("Marked packed")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark packed" })).toHaveCount(0);
  await expect(page.getByText("Awaiting pickup").first()).toBeVisible();

  await page.getByRole("link", { name: "Products" }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/factory-products-mobile.png", fullPage: true });
  const size = page.getByRole("listitem", { name: "Size S", exact: true });
  const left = async () =>
    Number((await size.getByText(/^(\d+ left|Sold out)$/).textContent())?.match(/\d+/)?.[0] ?? 0);
  const before = await left();
  await size.getByLabel(/Pieces of S/).fill("5");
  await size.getByRole("button", { name: "Add" }).click();
  await expect.poll(left).toBe(before + 5);

  await page.goto("/seller/insights");
  await expect(page.getByRole("heading", { name: "Ratings and insights" })).toBeVisible();
  await page.screenshot({ path: "test-results/factory-insights-mobile.png", fullPage: true });
});

test("factory staff: each job gets its own bottom tabs; the owner adds staff", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const tabs = () => page.getByRole("navigation", { name: "Factory" }).getByRole("link");

  await signIn(page, "packing@example.com");
  await expect(tabs()).toHaveText(["Home", "Orders"]);
  await expect(page.getByText("Sales (paid)", { exact: true })).toHaveCount(0);
  await page.goto("/seller/products");
  await expect(page).toHaveURL(/\/seller$/);

  await signIn(page, "sales@example.com");
  await expect(tabs()).toHaveText(["Returns", "Home", "Products", "Ratings"]);

  await signIn(page, "seller@example.com");
  await expect(tabs()).toHaveText(["Returns", "Home", "Orders", "Products", "Ratings", "Team"]);
  await tabs().getByText("Team").click();
  await expect(page.getByRole("listitem", { name: "Ruwan Perera" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Kamal Jayasuriya");
  await page.getByLabel("Email (they sign in with this)").fill("kamal@example.com");
  await page.getByLabel("Job", { exact: true }).selectOption("PLANNER");
  await page.getByLabel("Temporary password").fill("password123");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByRole("listitem", { name: "Kamal Jayasuriya" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/factory-team-mobile.png", fullPage: true });
});
