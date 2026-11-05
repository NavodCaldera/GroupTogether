import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { seedBrowserFixtures } from "./seed-fixtures";
const pool = () =>
  new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
let factoryId: string;
test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = pool();
  try {
    const owner = (await db.query('SELECT id FROM "User" WHERE email=$1', ["buyer3@example.com"]))
      .rows[0];
    factoryId = (await db.query('SELECT id FROM "User" WHERE email=$1', ["seller@example.com"]))
      .rows[0].id;
    await db.query(
      'INSERT INTO "User" (id,name,email,phone,"passwordHash",role,address,city,lat,lng) SELECT $1,$2,$3,$4,"passwordHash",$5,$6,$7,$8,$9 FROM "User" WHERE id=$10',
      [
        "quality-member",
        "Quality member",
        "quality-member@example.com",
        "0730000000",
        "CUSTOMER",
        "12 Flower Rd",
        "Colombo",
        6.9271,
        79.8612,
        owner.id,
      ],
    );
    await db.query(
      'INSERT INTO "Product" (id,title,brand,category,"stockType",price,status,"sellerId","factoryPrice",commission,audience,kind,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,timezone(\'UTC\',now())),($13,$14,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,timezone(\'UTC\',now()))',
      [
        "quality-product",
        "Quality review shirt",
        "Ceylon Apparel Mills",
        "APPAREL",
        "FACTORY_SURPLUS",
        "1500",
        "LIVE",
        factoryId,
        "1400",
        "100",
        "MEN",
        "men-shirts",
        "quality-other",
        "Quality other shirt",
      ],
    );
    await db.query(
      'INSERT INTO "Variant" (id,"productId",size,available,reserved,sold) VALUES ($1,$2,$3,3,1,1),($4,$5,$3,4,1,0)',
      ["quality-variant", "quality-product", "M", "quality-other-variant", "quality-other"],
    );
    await db.query(
      "INSERT INTO \"GroupCart\" (id,code,name,\"ownerId\",status,total,\"minOrderValue\",\"expiresAt\",\"updatedAt\",\"acceptedAt\",\"confirmedAt\") VALUES ($1,$2,$3,$4,$5,$6,$6,timezone('UTC',now())+interval '1 day',timezone('UTC',now()),timezone('UTC',now()),timezone('UTC',now())),($7,$8,$9,$4,$10,$11,$11,timezone('UTC',now())+interval '1 day',timezone('UTC',now()),NULL,NULL)",
      [
        "quality-delivered",
        "QTY222AA",
        "Delivered shirts",
        owner.id,
        "DELIVERED",
        "1500",
        "quality-ready",
        "QTY222AB",
        "Quality cart",
        "READY",
        "3000",
      ],
    );
    await db.query(
      'INSERT INTO "CartMember" (id,"cartId","userId") VALUES ($1,$2,$3),($4,$5,$3),($6,$5,$7)',
      [
        "quality-received-member",
        "quality-delivered",
        owner.id,
        "quality-ready-owner",
        "quality-ready",
        "quality-ready-member",
        "quality-member",
      ],
    );
    await db.query(
      'INSERT INTO "CartLine" (id,"cartId","userId","variantId",qty,"unitPrice") VALUES ($1,$2,$3,$4,1,$5),($6,$7,$8,$4,1,$5),($9,$7,$3,$10,1,$5)',
      [
        "quality-received-line",
        "quality-delivered",
        owner.id,
        "quality-variant",
        "1500",
        "quality-member-line",
        "quality-ready",
        "quality-member",
        "quality-owner-line",
        "quality-other-variant",
      ],
    );
    await db.query(
      'INSERT INTO "TokenEntry" (id,"userId",amount,kind,"eventKey",note,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,timezone(\'UTC\',now()))',
      [
        "quality-credit",
        "quality-member",
        "1000",
        "CANCELLATION",
        "credit:quality-browser",
        "Synthetic quality credit",
      ],
    );
    await db.query(
      'DELETE FROM "Notification" WHERE "userId" IN (SELECT id FROM "User" WHERE id=$1 OR "factoryId"=$1)',
      [factoryId],
    );
  } finally {
    await db.end();
  }
});
async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test("private product report, unpaid hide with Done reset, and factory removal at 360px", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, "buyer3@example.com");
  await page.goto("/c/QTY222AA");
  await page.getByLabel("Stars", { exact: true }).selectOption("2");
  await page.getByLabel("Report reason", { exact: true }).selectOption("STITCHING");
  await page.getByLabel("Report note", { exact: true }).fill("Loose sleeve seam");
  await page.getByLabel("Report photos", { exact: true }).setInputFiles({
    name: "seam.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await fits(page);
  await page.screenshot({ path: "test-results/quality-report-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Save rating", exact: true }).click();
  await expect(page.getByText("Quality review shirt: 2 / 5", { exact: true })).toBeVisible();
  const photo = await page
    .getByRole("link", { name: "Report photo", exact: true })
    .getAttribute("href");
  expect((await page.request.get(photo!)).status()).toBe(200);
  await signIn(page, "quality-member@example.com");
  expect((await page.request.get(photo!)).status()).toBe(404);
  await page.goto("/c/QTY222AB");
  await page.getByLabel("Tokens (LKR)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Apply tokens", exact: true }).click();
  await expect(page.getByText("Tokens applied:", { exact: false })).toContainText(/500/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await signIn(page, "premium@groupbasket.lk");
  expect((await page.request.get(photo!)).status()).toBe(404);
  expect((await page.request.get("/admin/factory/quality")).status()).toBe(404);
  await signIn(page, "core@groupbasket.lk");
  await page.goto("/admin/factory/quality");
  await expect(page.getByRole("heading", { name: "Quality", exact: true })).toBeVisible();
  expect((await page.request.get(photo!)).status()).toBe(200);
  await signIn(page, "factory@groupbasket.lk");
  await page.goto("/admin/factory/quality");
  const product = page.getByRole("listitem", { name: "Quality review shirt", exact: true });
  await expect(product.getByText("Loose sleeve seam", { exact: true })).toBeVisible();
  await product.getByLabel("Hide reason", { exact: true }).fill("Poor stitching");
  await product.getByRole("button", { name: "Hide product", exact: true }).click();
  await fits(page);
  await product.getByRole("button", { name: "Yes, hide", exact: true }).click();
  await expect(product.getByText("Hidden", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/quality-admin-mobile.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const verify = pool();
  try {
    const state = (
      await verify.query(
        'SELECT c.status,c.total::text,m."doneAt",(SELECT count(*)::int FROM "CartLine" WHERE id=$1) lines FROM "GroupCart" c JOIN "CartMember" m ON m."cartId"=c.id WHERE c.id=$2 AND m."userId"=$3',
        ["quality-member-line", "quality-ready", "quality-member"],
      )
    ).rows[0];
    expect(state).toEqual({ status: "OPEN", total: "1500.00", doneAt: null, lines: 0 });
  } finally {
    await verify.end();
  }
  const staffContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 360, height: 800 },
  });
  const staff = await staffContext.newPage();
  await signIn(staff, "sales@example.com");
  await staff.goto("/seller");
  const factory = page.getByRole("listitem", { name: "Ceylon Apparel Mills", exact: true });
  await factory.getByLabel("Removal reason", { exact: true }).fill("Repeated quality failures");
  await factory.getByLabel("Hold earnings", { exact: true }).check();
  await factory.getByLabel("Earnings hold note", { exact: true }).fill("Pending quality review");
  await factory.getByRole("button", { name: "Remove factory", exact: true }).click();
  await factory.getByRole("button", { name: "Yes, remove factory", exact: true }).click();
  await expect(factory.getByText("REMOVED", { exact: true })).toBeVisible();
  await staff.reload();
  await expect(staff).toHaveURL(/\/sign-in/);
  await staffContext.close();
  const final = pool();
  try {
    expect(
      (
        await final.query(
          'SELECT count(*)::int n FROM "Notification" WHERE "userId" IN (SELECT id FROM "User" WHERE id=$1 OR "factoryId"=$1)',
          [factoryId],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await final.end();
  }
});
