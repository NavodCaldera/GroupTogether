import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";
test.beforeAll(seedBrowserFixtures);
test.use({ viewport: { width: 360, height: 800 } });
test("factory applies and admin visits and approves at 360px", async ({ page }) => {
  await page.goto("/factories/apply");
  await page.getByLabel("Business name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("BR number", { exact: true })).toBeFocused();
  for (const [label, value] of [
    ["Business name", "Browser Shirts"],
    ["BR number", "BROWSER-BR"],
    ["Owner name", "Kamal Perera"],
    ["Owner NIC number", "BROWSER-NIC"],
    ["Phone", "0774567890"],
    ["Email", "joining@example.lk"],
    ["Factory address", "1 Factory Road"],
    ["City", "Colombo"],
    ["Bank name", "BOC"],
    ["Branch", "Colombo"],
    ["Account name", "Kamal Perera"],
    ["Account number", "123456"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  const image = {
    name: "document.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  for (const label of ["BR certificate", "NIC photo", "Factory photo"])
    await page.getByLabel(label, { exact: true }).setInputFiles(image);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Application submitted" }).first(),
  ).toBeVisible();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("factory@groupbasket.lk");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin/factory");
  await page.goto("/admin/factory/applications");
  await page.getByRole("link", { name: /Browser Shirts/ }).click();
  await expect(page.getByRole("heading", { name: "Browser Shirts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  const docHref = await page.getByRole("link", { name: "NIC photo 2" }).getAttribute("href");
  expect((await page.request.get(docHref!)).status()).toBe(200);
  await page.getByLabel("Visit date").fill("2026-11-05");
  await page.getByLabel("Visit notes").fill("Visited factory");
  await page.getByRole("button", { name: "Record visit" }).click();
  await expect(page.getByText("Visited factory", { exact: true })).toBeVisible();
  await page.getByLabel("Decision").selectOption("APPROVE");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await page.context().clearCookies();
  expect((await page.request.get(docHref!)).status()).toBe(404);
});
