import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { seedBrowserFixtures } from "./seed-fixtures";
test.beforeEach(async () => {
  seedBrowserFixtures();
  const db = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    const factory = (await db.query('SELECT id FROM "User" WHERE email=$1', ["seller@example.com"]))
      .rows[0].id;
    const buyer = (await db.query('SELECT id FROM "User" WHERE email=$1', ["buyer3@example.com"]))
      .rows[0].id;
    await db.query(
      `INSERT INTO "Product" (id,title,brand,category,"stockType",price,status,"sellerId",audience,kind,"updatedAt") VALUES ('fault-shirt','Fault review shirt','Lanka','APPAREL','FACTORY_SURPLUS',1500,'LIVE',$1,'MEN','men-shirts',now())`,
      [factory],
    );
    await db.query(
      `INSERT INTO "Variant" (id,"productId",size,available,sold) VALUES ('fault-size','fault-shirt','M',5,2)`,
    );
    await db.query(
      `INSERT INTO "GroupCart" (id,code,"ownerId",status,total,"minOrderValue","expiresAt","updatedAt") VALUES ('fault-cart','FAULT123',$1,'DELIVERED',3000,1500,now(),now())`,
      [buyer],
    );
    await db.query(
      `INSERT INTO "CartLine" (id,"cartId","userId","variantId",qty,"unitPrice","returnedQty") VALUES ('fault-line','fault-cart',$1,'fault-size',2,1500,1)`,
      [buyer],
    );
    await db.query(
      `INSERT INTO "ReturnRequest" (id,"cartLineId","buyerId","factoryId",qty,reason,fault,note,status,"factoryDueAt","updatedAt") VALUES ('fault-first','fault-line',$1,$2,1,'DAMAGED','FACTORY','First seam','COMPLETED',now()+interval '1 day',now()),('fault-second','fault-line',$1,$2,1,'DAMAGED','FACTORY','Second seam','WAITING_FACTORY',now()+interval '1 day',now())`,
      [buyer, factory],
    );
    await db.query(
      `INSERT INTO "FactoryFault" (id,"factoryId","returnId",units,"confirmedBy","confirmedById") VALUES ('fault-prior',$1,'fault-first',1,'FACTORY',$1)`,
      [factory],
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
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}
for (const width of [1280, 360])
  test(`second fault, private discussion and Continue at ${width}px`, async ({ page }) => {
    test.setTimeout(180000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 800 });
    await signIn(page, "seller@example.com");
    await page.goto("/seller/returns");
    // The smallest card enclosing the reason and its decision form.
    const second = page.getByText("Second seam", { exact: true }).locator("..");
    await second.getByRole("button", { name: "Save decision", exact: true }).click();
    await expect(page.getByText("Your shop is on hold", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Faults", exact: true })).toBeVisible();
    await accessible(page);
    await page.getByRole("link", { name: "Hold messages", exact: true }).click();
    const holdUrl = page.url();
    await page.getByLabel("Hold message", { exact: true }).fill("We inspected the stitching");
    await page.getByRole("button", { name: "Send hold message", exact: true }).click();
    await expect(page.getByText("We inspected the stitching", { exact: true })).toBeVisible();
    await accessible(page);
    await page.screenshot({ path: `test-results/fault-owner-${width}.png`, fullPage: true });
    await signIn(page, "factory@groupbasket.lk");
    await page.goto("/admin/factory/quality");
    await page.getByRole("link", { name: "Hold messages", exact: true }).click();
    await expect(page.getByText("We inspected the stitching", { exact: true })).toBeVisible();
    await page.getByLabel("Hold message", { exact: true }).fill("Inspection reviewed");
    await page.getByRole("button", { name: "Send hold message", exact: true }).click();
    await expect(page.getByText("Inspection reviewed", { exact: true })).toBeVisible();
    await page.getByLabel("Decision note", { exact: true }).fill("Continue following inspection");
    await accessible(page);
    await page.screenshot({ path: `test-results/fault-admin-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).focus();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("CONTINUE", { exact: true })).toBeVisible();
    await signIn(page, "seller@example.com");
    await page.goto("/seller/returns");
    await expect(page.getByText("Your shop is on hold", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Hold messages", exact: true }).first().click();
    await expect(page.getByText("Inspection reviewed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send hold message", exact: true })).toHaveCount(
      0,
    );
    await accessible(page);
    for (const email of [
      "sales@example.com",
      "packing@example.com",
      "brand@example.com",
      "premium@groupbasket.lk",
      "buyers@groupbasket.lk",
      "buyer3@example.com",
    ]) {
      await signIn(page, email);
      expect((await page.request.get(holdUrl, { maxRedirects: 0 })).status()).toBe(404);
    }
    await page.goto("/shop?q=Fault+review+shirt");
    await expect(page.getByRole("link", { name: /Fault review shirt/ }).first()).toBeVisible();
  });
