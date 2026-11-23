import { expect, test } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

test("a buyer finds a basket near them, pays and is in", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("buyer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  await page.getByRole("link", { name: /Hemas/ }).first().click();
  await expect(page).toHaveURL(/\/companies\/hemas$/);
  // Nimali is in Dilan's contacts, so her basket is first.
  const baskets = page.getByTestId("open-basket");
  await expect(baskets).toHaveCount(2);
  await expect(baskets.first()).toContainText("Contact");

  await baskets.nth(1).click();
  await expect(page.getByTestId("basket-progress")).toHaveText("3 of 10 families");
  await page.getByRole("button", { name: /^Join · pay/ }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  await expect(page).toHaveURL(/\/baskets\/[^/]+$/);
  await expect(page.getByTestId("basket-progress")).toHaveText("4 of 10 families");
  await expect(page.getByText("You are in")).toBeVisible();
});
