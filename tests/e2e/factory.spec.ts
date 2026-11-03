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

  await card.click();
  await expect(page).toHaveURL(/\/seller\/orders$/);
  const pack = page.getByRole("button", { name: "Mark packed" });
  await pack.click();
  await expect(page.getByRole("button", { name: "Packed ✓" })).toBeDisabled();
  await expect(page.getByText("Marked packed")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark packed" })).toHaveCount(0);
  await expect(page.getByText("Awaiting pickup").first()).toBeVisible();

  await page.getByRole("link", { name: "Products" }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  const size = page.getByRole("listitem", { name: "Size S", exact: true });
  const left = async () =>
    Number((await size.getByText(/^(\d+ left|Sold out)$/).textContent())?.match(/\d+/)?.[0] ?? 0);
  const before = await left();
  await size.getByLabel(/Pieces of S/).fill("5");
  await size.getByRole("button", { name: "Add" }).click();
  await expect.poll(left).toBe(before + 5);
});
