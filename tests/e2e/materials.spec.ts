import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_ADMINS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

// Material Card (DEC-022) on the seeded tee: combed cotton jersey, 180 gsm, library composition.
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

let tee = "";
let owner = "";
let otherFactory = "";

async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const pool = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    return (await pool.query(text, values)).rows as T[];
  } finally {
    await pool.end();
  }
}

test.beforeAll(async () => {
  seedBrowserFixtures();
  const [row] = await sql<{ id: string; email: string; sellerId: string }>(
    `SELECT p.id, u.email, p."sellerId" FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
     WHERE p.title = 'Crew-neck cotton tee (3-pack)' LIMIT 1`,
  );
  tee = row.id;
  owner = row.email;
  const [other] = await sql<{ email: string }>(
    `SELECT email FROM "User" WHERE role = 'SELLER' AND "isBrand" = false AND "factoryId" IS NULL
     AND id <> $1 LIMIT 1`,
    [row.sellerId],
  );
  otherFactory = other.email;
});

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

const noSideScroll = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

test("a visitor sees the Material Card with sourced values only", async ({ page }) => {
  await page.goto(`/products/${tee}`);
  const card = page.getByTestId("material-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole("heading", { name: "Combed cotton jersey" })).toBeVisible();
  await expect(card.getByText("Estimated from fabric type")).toBeVisible();
  await expect(card.getByText("Feels like an everyday T-shirt")).toBeVisible();
  await expect(card.getByText("Softness: not yet measured")).toBeAttached();
  await expect(card.getByText(/^Weight: 31\.3 from the factory's figure/)).toBeAttached();
  await expect(card.getByText("180 gsm · Light")).toBeVisible();
  await expect(page.getByText(/Breathability \d of 5/)).toHaveCount(0);
  await card.getByText("How we know this").click();
  await expect(card.getByText("WEIGHT v1")).toBeVisible();
  await noSideScroll(page);
  const axe = await new AxeBuilder({ page }).include("[data-testid=material-card]").analyze();
  expect(axe.violations).toEqual([]);
});

test("the factory adds a lab result and it shows as not accredited", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/seller/products/${tee}`);
  const section = page.getByTestId("factory-material");
  await expect(section.getByRole("radio", { name: /Combed cotton jersey/ })).toBeChecked();
  await expect(section.getByRole("textbox", { name: "GSM", exact: true })).toHaveValue("180");
  await section.getByText("Add a lab result").click();
  await section.getByLabel("Test", { exact: true }).selectOption("ISO_3801:mass_per_area");
  await section.getByLabel("Result", { exact: true }).fill("176");
  await section.getByLabel("Tested on").fill("2026-10-01");
  await section.getByLabel("Other lab name").fill("Colombo Test House");
  await section.getByLabel("Report (PDF, up to 10 MB)").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  });
  await section.getByRole("button", { name: "Add result" }).click();
  await expect(section.getByText("ISO 3801: 176 g/m2 · Colombo Test House")).toBeVisible();
  await expect(section.getByText("Not accredited")).toBeVisible();
  const report = await page.request.get(
    (await section.getByRole("link", { name: "Report" }).getAttribute("href"))!,
  );
  expect(report.status()).toBe(200);
  expect(report.headers()["content-type"]).toBe("application/pdf");
  await expect(section.getByText("Factory-declared").first()).toBeVisible();
  await noSideScroll(page);

  // A result from an unchecked lab does not move the weight slider.
  await page.goto(`/products/${tee}`);
  await expect(
    page.getByTestId("material-card").getByText(/^Weight: 31\.3 from the factory's figure/),
  ).toBeAttached();
});

test("figures far from the library need a tick and reach the admin", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/seller/products/${tee}`);
  const section = page.getByTestId("factory-material");
  await section.getByRole("textbox", { name: "GSM", exact: true }).fill("300");
  await section.getByRole("button", { name: "Save material" }).click();
  await expect(section.getByRole("alert")).toContainText("Tick the box to confirm");
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "Save material" }).click();
  await expect(section.getByText("Waiting for check")).toBeVisible();

  await signIn(page, DEMO_ADMINS.FACTORY);
  await page.goto("/admin/factory/materials/reports");
  await expect(page.getByRole("link", { name: "Crew-neck cotton tee (3-pack)" })).toBeVisible();
  await page.getByRole("button", { name: "Checked" }).click();
  await expect(page.getByText("Nothing to check")).toBeVisible();
  await noSideScroll(page);
});

test("another factory cannot open the product or its lab report", async ({ page }) => {
  const [m] = await sql<{ id: string }>(
    `SELECT m.id FROM "Measurement" m JOIN "ProductMaterial" pm ON pm.id = m."productMaterialId"
     WHERE pm."productId" = $1 AND m."reportKey" IS NOT NULL LIMIT 1`,
    [tee],
  );
  await signIn(page, otherFactory);
  const res = await page.goto(`/seller/products/${tee}`);
  expect(res?.status()).toBe(404);
  const report = await page.request.get(`/api/lab-reports/${m.id}`);
  expect(report.status()).toBe(404);
});

test("the Factory admin publishes a material and explains a slider", async ({ page }) => {
  await signIn(page, DEMO_ADMINS.FACTORY);
  await page.goto("/admin/factory/materials?q=lawn");
  const row = page.getByRole("row", { name: /Cotton lawn \/ voile/ });
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(row.getByText("Published")).toBeVisible();
  await page.goto("/admin/factory/materials/clawn");
  await page.getByText("Why this value?").first().click();
  await expect(page.getByText("SOFT_EST v1")).toBeVisible();
  await noSideScroll(page);
});
