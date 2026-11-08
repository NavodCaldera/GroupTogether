import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";
test.beforeAll(seedBrowserFixtures);
test.use({ viewport: { width: 360, height: 800 } });
test("factory joins, accepts and renews the current agreement at 360px", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
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
  await expect(page.getByRole("link", { name: "Applications", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Factories", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: /Browser Shirts/ }).click();
  await expect(page.getByRole("heading", { name: "Browser Shirts" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("admin-review-360.png"), fullPage: true });
  const docHref = await page.getByRole("link", { name: "NIC photo 2" }).getAttribute("href");
  expect((await page.request.get(docHref!)).status()).toBe(200);
  await page.getByLabel("Visit date").fill("2026-11-05");
  await page.getByLabel("Visit notes").fill("Visited factory");
  await page.getByRole("button", { name: "Record visit" }).click();
  await expect(page.getByText("Visited factory", { exact: true })).toBeVisible();
  await page.getByLabel("Decision").selectOption("APPROVE");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  const applicationUrl = page.url();
  const oldSignInUrl = await page.getByLabel("Sign-in link").inputValue();
  await page.reload();
  await expect(page.getByLabel("Sign-in link")).toHaveCount(0);
  await page.getByRole("button", { name: "New sign-in link", exact: true }).click();
  const signInUrl = await page.getByLabel("Sign-in link").inputValue();
  expect(signInUrl).not.toBe(oldSignInUrl);
  await page.screenshot({ path: testInfo.outputPath("activation-link-360.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().clearCookies();
  expect((await page.request.get(docHref!)).status()).toBe(404);
  await page.goto(oldSignInUrl);
  await page.getByLabel("Set password").fill("ownerpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Sign-in link expired or already used" }),
  ).toBeVisible();
  await page.goto(signInUrl);
  await page.getByLabel("Set password").fill("ownerpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/seller/agreement");
  await expect(page.getByRole("heading", { name: "Agreement v1", exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("agreement-360.png"), fullPage: true });
  await page.getByLabel("I accept this agreement").check();
  await page.getByRole("button", { name: "Accept agreement", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/seller");
  const ownerCookies = await page.context().cookies();
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("core@groupbasket.lk");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin/core/payouts");
  await page.goto(applicationUrl);
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New sign-in link", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Sign-in link")).toHaveCount(0);
  await page.goto("/admin/settings");
  await page
    .getByLabel("New agreement text")
    .fill("Agreement version two for browser verification");
  await page.getByRole("button", { name: "Publish agreement", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Factory agreement v2", exact: true }),
  ).toBeVisible();
  await page.context().clearCookies();
  await page.context().addCookies(ownerCookies);
  await page.goto("/seller/new");
  await page.waitForURL("**/seller/agreement");
  await expect(page.getByRole("heading", { name: "Agreement v2", exact: true })).toBeVisible();
  await page.getByLabel("I accept this agreement").check();
  await page.getByRole("button", { name: "Accept agreement", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/seller");
  await page.goto("/seller/new");
  await expect(page.getByRole("heading", { name: "Add product", exact: true })).toBeVisible();
});
