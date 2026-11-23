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

  await page.goto("/baskets?company=hemas");
  await page.getByLabel("Category").selectOption("biscuits-snacks");
  await expect(page.getByLabel("Company")).toHaveValue("");
  await expect(page.getByLabel("Company").locator("option")).toHaveText(["All", "CBL", "Maliban"]);
});

test("a company updates a pack and buyers see the new version", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("hemas@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  await expect(page).toHaveURL(/\/company$/);
  await expect(page.getByRole("link", { name: "Baskets" })).toHaveCount(0);
  await page.goto("/tokens");
  await expect(page).toHaveURL(/\/company$/);
  const budget = page
    .locator("form", { has: page.getByRole("button", { name: "Publish new version" }) })
    .first();
  await budget.getByLabel("Price per family (LKR)").fill("2600");
  await budget.getByRole("button", { name: "+ Add item" }).click();
  await budget.getByLabel("Item 4 name").fill("Body lotion");
  await budget.getByLabel("Item 4 size").fill("100 ml");
  await budget.getByRole("button", { name: "Publish new version" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();

  await page.goto("/packs/hemas-budget");
  await expect(page.getByText("LKR 2,600").first()).toBeVisible();
  await expect(page.getByText("Body lotion")).toBeVisible();
  await page.goto("/companies/hemas");
  await expect(page.getByTestId("packs-bought")).toHaveText(/^\d+ family packs bought today$/);
});
