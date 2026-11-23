import { expect, test, type Page } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("GET / sends the site security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  if (process.env.CI) {
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["content-security-policy"]).toContain("upgrade-insecure-requests");
    expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
  } else {
    expect(headers["strict-transport-security"]).toBeUndefined();
  }
});

test("buyer, map and error pages have no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.exposeFunction("recordCspViolation", (value: string) => violations.push(value));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { recordCspViolation: (value: string) => void }).recordCspViolation(
        `${event.effectiveDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} on ${event.documentURI}`,
      );
    });
  });
  await signIn(page, "buyer@example.com");
  for (const path of [
    "/",
    "/companies/hemas",
    "/packs/hemas-30-day",
    "/baskets",
    "/tokens",
    "/account",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.context().clearCookies();
  await page.goto("/sign-up");
  const tile = page.locator("img.leaflet-tile-loaded").first();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => tile.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const search = page.waitForResponse(
    (response) => response.url().startsWith("https://photon.komoot.io/api/") && response.ok(),
  );
  await page.getByRole("combobox", { name: "City" }).fill("Colombo");
  await search;
  await page.goto("/e2e-error");
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
  expect(violations).toEqual([]);
});
