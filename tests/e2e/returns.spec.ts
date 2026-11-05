import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { seedBrowserFixtures } from "./seed-fixtures";
const pool = () =>
  new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
async function seed() {
  seedBrowserFixtures();
  const db = pool();
  try {
    const buyer = (await db.query('SELECT id FROM "User" WHERE email=$1', ["buyer3@example.com"]))
      .rows[0].id;
    const factory = (await db.query('SELECT id FROM "User" WHERE email=$1', ["seller@example.com"]))
      .rows[0].id;
    await db.query(
      'INSERT INTO "Product" (id,title,brand,category,"stockType",price,status,"sellerId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())',
      [
        "return-product",
        "Lanka Shirts shirt",
        "Lanka Shirts",
        "APPAREL",
        "FACTORY_SURPLUS",
        "1500",
        "LIVE",
        factory,
      ],
    );
    await db.query(
      'INSERT INTO "Variant" (id,"productId",size,available,sold) VALUES ($1,$2,$3,4,1)',
      ["return-variant", "return-product", "M"],
    );
    await db.query(
      'INSERT INTO "GroupCart" (id,code,name,"ownerId",status,total,"minOrderValue","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6,now(),now())',
      ["return-cart", "RET222AA", "Lanka Shirts order", buyer, "DELIVERED", "1500"],
    );
    await db.query('INSERT INTO "CartMember" (id,"cartId","userId") VALUES ($1,$2,$3)', [
      "return-member",
      "return-cart",
      buyer,
    ]);
    await db.query(
      'INSERT INTO "CartLine" (id,"cartId","userId","variantId",qty,"unitPrice") VALUES ($1,$2,$3,$4,1,$5)',
      ["return-line", "return-cart", buyer, "return-variant", "1500"],
    );
    await db.query(
      'INSERT INTO "Delivery" (id,"cartId",provider,status,"deliveredAt","updatedAt") VALUES ($1,$2,$3,$4,timezone(\'UTC\',now()),timezone(\'UTC\',now()))',
      ["return-delivery", "return-cart", "manual", "DELIVERED"],
    );
  } finally {
    await db.end();
  }
}
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
for (const width of [1280, 360])
  test(`Lanka Shirts return, private review, manual pickup and tokens at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed();
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "buyer3@example.com");
    await page.goto("/c/RET222AA");
    await page.getByText("Return · Lanka Shirts shirt · M", { exact: true }).click();
    await page.getByLabel("Return reason", { exact: true }).selectOption("DAMAGED");
    await page.getByLabel("Return note", { exact: true }).fill("Torn sleeve seam");
    await page.getByLabel("Return photos", { exact: true }).setInputFiles({
      name: "seam.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByLabel("Return note", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Request return", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Waiting for approval", { exact: true })).toBeVisible();
    await expect(page.getByText("Send return", { exact: true })).toHaveCount(0);
    const photo = page.getByRole("link", { name: "Return photo 1" });
    expect((await page.request.get((await photo.getAttribute("href"))!)).status()).toBe(200);
    await signIn(page, "sales@example.com");
    await page.goto("/seller/returns");
    await page.getByLabel("Decision", { exact: true }).selectOption("reject");
    await page.getByLabel("Refusal reason", { exact: true }).fill("Please review the torn seam");
    await page.getByRole("button", { name: "Save decision", exact: true }).click();
    await expect(page.getByText("with admin", { exact: true })).toBeVisible();
    await signIn(page, "buyer3@example.com");
    await page.goto("/c/RET222AA");
    await expect(page.getByRole("button", { name: "Ask an admin", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Messages", exact: true })).toHaveCount(0);
    await expect(page.getByText("Waiting for approval", { exact: true })).toBeVisible();
    await signIn(page, "factory@groupbasket.lk");
    await page.goto("/admin/factory/returns");
    await page.getByRole("link", { name: "Messages", exact: true }).click();
    const thread = page.getByRole("region", { name: "Return messages" });
    await thread.getByLabel("Message", { exact: true }).fill("Can you confirm the seam defect?");
    await thread.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      thread.getByText("Can you confirm the seam defect?", { exact: true }),
    ).toBeVisible();
    const detail = page.url();
    await signIn(page, "sales@example.com");
    await page.goto("/seller/returns");
    await page.getByRole("link", { name: "Messages", exact: true }).click();
    const factoryThread = page.getByRole("region", { name: "Return messages" });
    await expect(
      factoryThread.getByText("Can you confirm the seam defect?", { exact: true }),
    ).toBeVisible();
    await factoryThread
      .getByLabel("Message", { exact: true })
      .fill("Confirmed: the sleeve seam is torn.");
    await factoryThread.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      factoryThread.getByText("Confirmed: the sleeve seam is torn.", { exact: true }),
    ).toBeVisible();
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/return-thread-${width}.png`, fullPage: true });
    await signIn(page, "factory@groupbasket.lk");
    await page.goto(detail);
    await expect(
      page.getByText("Confirmed: the sleeve seam is torn.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Return note", { exact: true }).fill("Defect confirmed");
    await page.getByRole("button", { name: "Save final decision", exact: true }).click();
    await expect(page.getByText("accepted", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toHaveCount(0);
    await page.getByLabel("PickMe reference", { exact: true }).fill("PICKME-RETURN-123");
    await page.getByLabel("Driver", { exact: true }).fill("Nimal");
    await page.getByRole("button", { name: "Save pickup", exact: true }).click();
    await expect(page.getByText(/PickMe: PICKME-RETURN-123/)).toBeVisible();
    await fits(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/returns-${width}.png`, fullPage: true });
    await signIn(page, "seller@example.com");
    await page.goto("/seller/returns");
    await page.getByRole("button", { name: "Mark received", exact: true }).click();
    await expect(page.getByText("completed", { exact: true })).toBeVisible();
    await signIn(page, "buyer3@example.com");
    await page.goto("/account");
    await expect(page.getByText("Returned clothing item", { exact: true })).toBeVisible();
    await expect(page.getByText(/1,500/).first()).toBeVisible();
    await fits(page);
    const db = pool();
    try {
      expect(
        (
          await db.query(
            'SELECT amount::text FROM "TokenEntry" WHERE kind=$1 AND "returnId" IS NOT NULL',
            ["RETURN"],
          )
        ).rows,
      ).toEqual([{ amount: "1500.00" }]);
      expect(
        (await db.query('SELECT status,"notEarned" FROM "CartLine" WHERE id=$1', ["return-line"]))
          .rows[0],
      ).toEqual({ status: "RETURNED", notEarned: true });
    } finally {
      await db.end();
    }
  });
