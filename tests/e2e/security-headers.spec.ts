import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { LocalDiskStorage } from "../../src/server/storage/local";
import { seedBrowserFixtures } from "./seed-fixtures";

let fixture: { productId: string; docId: string };
test.beforeAll(async () => {
  seedBrowserFixtures();
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const pool = new Pool({ connectionString: url });
  try {
    const product = (
      await pool.query(
        `SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId" WHERE u."isBrand" = false AND p.status = 'LIVE' AND EXISTS (SELECT 1 FROM "Variant" v WHERE v."productId" = p.id AND v.available > 0) LIMIT 1`,
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
    const docId = "e2e-security-doc";
    await pool.query(
      `INSERT INTO "FactoryApplication" (id, "businessName", "brNumber", "ownerName", "ownerNic", phone, email, address, city, "bankName", "bankBranch", "accountName", "accountNumber") VALUES ($1, 'CSP Mill', 'PV0001', 'Owner', '900000000V', '0770000999', 'csp@example.com', '1 Mill Rd', 'Colombo', 'Bank', 'Branch', 'CSP Mill', '0001')`,
      ["e2e-security-application"],
    );
    await pool.query(
      'INSERT INTO "FactoryDocument" (id, "applicationId", kind, "storageKey", "contentType") VALUES ($1, $2, $3, $4, $5)',
      [docId, "e2e-security-application", "BR_CERT", key, "image/png"],
    );
    fixture = { productId: product.id, docId };
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

test("a private factory document retains exactly one restrictive CSP", async ({ page }) => {
  await signIn(page, "factory@groupbasket.lk");
  const response = await page.request.get(`/api/partner-docs/${fixture.docId}`);
  expect(response.ok()).toBe(true);
  const csp = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "content-security-policy");
  expect(csp).toHaveLength(1);
  expect(csp[0].value).toBe("default-src 'none'; sandbox");
});

test("buyer, admin, photo, map and error pages have no CSP violations", async ({ page }) => {
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
  await signIn(page, "buyers@groupbasket.lk");
  await page.goto("/admin/agents");
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
