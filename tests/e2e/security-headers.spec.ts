import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { LocalDiskStorage } from "../../src/server/storage/local";
import { seedBrowserFixtures } from "./seed-fixtures";

let fixture: { productId: string; slipId: string; cartId: string; participantId: string };
test.beforeAll(async () => {
  seedBrowserFixtures();
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const pool = new Pool({ connectionString: url });
  try {
    const owner = (
      await pool.query('SELECT id FROM "User" WHERE email = $1', ["buyer@example.com"])
    ).rows[0];
    const participant = (
      await pool.query('SELECT id FROM "User" WHERE email = $1', ["buyer3@example.com"])
    ).rows[0];
    const cart = (
      await pool.query('SELECT id FROM "GroupCart" WHERE "ownerId" = $1 AND status = $2 LIMIT 1', [
        owner.id,
        "OPEN",
      ])
    ).rows[0];
    const product = (
      await pool.query(
        'SELECT p.id FROM "Product" p WHERE p."sellerId" IS NULL AND EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id AND v.available > 0) LIMIT 1',
      )
    ).rows[0];
    const key = "e2e/security-headers.png";
    await new LocalDiskStorage(".data/test-uploads").put(
      key,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await pool.query('UPDATE "Product" SET "photoKey" = $1, "photoType" = $2 WHERE id = $3', [
      key,
      "image/png",
      product.id,
    ]);
    const slipId = "e2e-security-slip";
    await pool.query(
      'INSERT INTO "PaymentSlip" (id, "cartId", "uploaderId", amount, "storageKey", "contentType") VALUES ($1, $2, $3, $4, $5, $6)',
      [slipId, cart.id, owner.id, "1.00", key, "image/png"],
    );
    await pool.query(
      'INSERT INTO "CartMessage" (id, "cartId", "participantId", "authorId", body) VALUES ($1, $2, $3, $3, $4)',
      ["e2e-security-chat", cart.id, participant.id, "Security header test conversation"],
    );
    fixture = { productId: product.id, slipId, cartId: cart.id, participantId: participant.id };
  } finally {
    await pool.end();
  }
});
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

test("an owner's slip retains exactly one restrictive CSP", async ({ page }) => {
  await signIn(page, "buyer@example.com");
  const response = await page.request.get(`/api/slips/${fixture.slipId}`);
  expect(response.ok()).toBe(true);
  const csp = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "content-security-policy");
  expect(csp).toHaveLength(1);
  expect(csp[0].value).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
});

test("buyer, admin, photo, chat, map and error pages have no CSP violations", async ({ page }) => {
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
  await page.goto("/shop");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto(`/products/${fixture.productId}`);
  const photo = page.locator(`img[src="/api/photos/${fixture.productId}"]`).first();
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await page.goto(`/messages?c=${fixture.cartId}&with=${fixture.participantId}`);
  await page.getByPlaceholder("Write a message").fill("CSP permits chat messages");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("CSP permits chat messages", { exact: true })).toBeVisible();
  await signIn(page, "buyers@groupbasket.lk");
  await page.goto("/admin/slips");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
