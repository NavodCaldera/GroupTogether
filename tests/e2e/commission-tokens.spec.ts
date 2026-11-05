import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { seedBrowserFixtures } from "./seed-fixtures";
let code: string;
const pool = () =>
  new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
async function fixture() {
  seedBrowserFixtures();
  const db = pool();
  try {
    const owner = (await db.query('SELECT id FROM "User" WHERE email=$1', ["buyer@example.com"]))
      .rows[0];
    const member = (await db.query('SELECT id FROM "User" WHERE email=$1', ["buyer3@example.com"]))
      .rows[0];
    const cart = (
      await db.query('SELECT id,code FROM "GroupCart" WHERE "ownerId"=$1 AND status=$2 LIMIT 1', [
        owner.id,
        "OPEN",
      ])
    ).rows[0];
    code = cart.code;
    await db.query(
      'UPDATE "Variant" v SET available=v.available+x.qty,reserved=v.reserved-x.qty FROM (SELECT "variantId",SUM(qty)::int qty FROM "CartLine" WHERE "cartId"=$1 GROUP BY "variantId") x WHERE v.id=x."variantId"',
      [cart.id],
    );
    await db.query('DELETE FROM "CartLine" WHERE "cartId"=$1', [cart.id]);
    const variant = (
      await db.query(
        'SELECT v.id FROM "Variant" v JOIN "Product" p ON p.id=v."productId" WHERE p."sellerId" IS NULL AND p.category=$1 AND v.available>=2 LIMIT 1',
        ["APPAREL"],
      )
    ).rows[0];
    await db.query('UPDATE "Variant" SET available=available-2,reserved=reserved+2 WHERE id=$1', [
      variant.id,
    ]);
    await db.query(
      'INSERT INTO "CartMember" (id,"cartId","userId") VALUES ($1,$2,$3) ON CONFLICT ("cartId","userId") DO NOTHING',
      ["token-member", cart.id, member.id],
    );
    await db.query(
      'INSERT INTO "CartLine" (id,"cartId","userId","variantId",qty,"unitPrice") VALUES ($1,$2,$3,$4,1,$5),($6,$2,$7,$4,1,$8)',
      [
        "token-owner-line",
        cart.id,
        owner.id,
        variant.id,
        "48500",
        "token-member-line",
        member.id,
        "1500",
      ],
    );
    await db.query('UPDATE "GroupCart" SET total=$1,status=$2,"expiresAt"=$4 WHERE id=$3', [
      "50000",
      "READY",
      cart.id,
      new Date(Date.now() + 86400000),
    ]);
    await db.query(
      'INSERT INTO "TokenEntry" (id,"userId",amount,kind,"eventKey",note) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        "token-browser-credit",
        member.id,
        "3000",
        "CANCELLATION",
        "credit:browser",
        "Synthetic token credit",
      ],
    );
  } finally {
    await db.end();
  }
}
test.beforeAll(fixture);

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
test("commission preview and owned token line work at 360px through payment", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, "seller@example.com");
  await page.goto("/seller/new");
  await expect(page.getByLabel("Buyer price")).toHaveText("\u2014");
  await page.getByLabel("Factory price (LKR)").fill("1400");
  await expect(page.getByLabel("Buyer price")).toHaveText(/1,500/);
  await fits(page);
  await page.screenshot({ path: "test-results/commission-preview-mobile.png", fullPage: true });
  await signIn(page, "core@groupbasket.lk");
  await page.goto("/admin/settings");
  await expect(page.getByLabel("Commission per piece (LKR)")).toHaveValue("100");
  await signIn(page, "buyer3@example.com");
  await page.goto(`/c/${code}`);
  await expect(page.getByRole("button", { name: "Apply tokens" })).toHaveCount(1);
  const input = page.getByLabel("Tokens (LKR)", { exact: true });
  await input.focus();
  await expect(input).toBeFocused();
  await input.fill("1500");
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Apply tokens" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Tokens applied:", { exact: false })).toContainText(/1,500/);
  await expect(page.getByRole("button", { name: "Apply tokens" })).toHaveCount(0);
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/tokens-cart-mobile.png", fullPage: true });
  await page.goto("/account");
  await expect(page.getByText("Balance:")).toContainText(/1,500/);
  await expect(page.getByText("Synthetic token credit")).toBeVisible();
  await expect(page.getByText("Tokens applied to item")).toBeVisible();
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/tokens-account-mobile.png", fullPage: true });
  await page.goto(`/c/${code}`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await signIn(page, "buyer@example.com");
  await page.goto("/account?before=token-browser-credit");
  await expect(page.getByText("Synthetic token credit")).toHaveCount(0);
  await expect(page.getByText("Balance:")).toContainText(/LKR.*0/);
  await page.goto(`/c/${code}`);
  // The owner's own line has no token balance; no other member's controls are exposed.
  await expect(page.getByRole("button", { name: "Apply tokens" })).toHaveCount(0);
  await page.getByRole("button", { name: "Accept & pay", exact: true }).click();
  await page.waitForURL(/\/pay$/);
  await expect(page.getByRole("heading", { name: /Pay LKR.*48,500/ })).toBeVisible();
  await fits(page);
  await page.getByLabel(/Bank slip/).setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: "Upload slip" }).click();
  await page.waitForURL(/paid=1/);
  const db = pool();
  try {
    expect(
      (
        await db.query(
          'SELECT amount::text FROM "PaymentSlip" s JOIN "GroupCart" c ON c.id=s."cartId" WHERE c.code=$1 ORDER BY s."createdAt" DESC LIMIT 1',
          [code],
        )
      ).rows[0].amount,
    ).toBe("48500.00");
  } finally {
    await db.end();
  }
});

test("fully token-covered owner acceptance confirms without a bank-slip screen", async ({
  page,
}) => {
  await fixture();
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, "buyer3@example.com");
  await page.goto(`/c/${code}`);
  await page.getByLabel("Tokens (LKR)", { exact: true }).fill("1500");
  await page.getByRole("button", { name: "Apply tokens" }).click();
  await expect(page.getByText("Tokens applied:", { exact: false })).toContainText(/1,500/);
  const db = pool();
  try {
    await db.query(
      `INSERT INTO "TokenEntry" (id,"userId",amount,kind,"eventKey",note,"createdAt") SELECT $1,id,$2,$3,$4,$5,timezone('UTC',now()) FROM "User" WHERE email=$6`,
      [
        "zero-due-owner-credit",
        "48500",
        "CANCELLATION",
        "credit:zero-due-owner",
        "Synthetic zero-due credit",
        "buyer@example.com",
      ],
    );
  } finally {
    await db.end();
  }
  await page.goto(`/c/${code}`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await signIn(page, "buyer@example.com");
  await page.goto(`/c/${code}`);
  await page.getByLabel("Tokens (LKR)", { exact: true }).fill("48500");
  await page.getByRole("button", { name: "Apply tokens" }).click();
  await expect(page.getByText("Tokens applied:", { exact: false })).toContainText(/48,500/);
  await page.getByRole("button", { name: "Accept & pay", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${code}$`));
  await expect(page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Pay LKR/ })).toHaveCount(0);
  await page.goto(`/c/${code}/pay`);
  await expect(page).toHaveURL(new RegExp(`/c/${code}$`));
  await fits(page);
  await page.screenshot({ path: "test-results/zero-due-confirmed-mobile.png", fullPage: true });
  const verify = pool();
  try {
    const result = (
      await verify.query(
        'SELECT c.status,(SELECT count(*)::int FROM "PaymentSlip" s WHERE s."cartId"=c.id) slips,(SELECT count(*)::int FROM "TokenEntry" e JOIN "CartLine" l ON l.id=e."cartLineId" WHERE l."cartId"=c.id AND e.kind=$2) spends FROM "GroupCart" c WHERE c.code=$1',
        [code, "SPEND"],
      )
    ).rows[0];
    expect(result).toEqual({ status: "CONFIRMED", slips: 0, spends: 2 });
  } finally {
    await verify.end();
  }
});

test("member Done, Undo and owner Remove work at 360px", async ({ page }) => {
  await fixture();
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, "buyer@example.com");
  await page.goto(`/c/${code}`);
  await expect(page.getByRole("button", { name: "Accept & pay", exact: true })).toBeDisabled();
  await expect(page.getByText("0 of 1 done", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(1);
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await signIn(page, "buyer3@example.com");
  await page.goto(`/c/${code}`);
  const done = page.getByRole("button", { name: "Done", exact: true });
  await done.focus();
  await expect(done).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: "test-results/member-done-mobile.png", fullPage: true });
  await signIn(page, "buyer@example.com");
  await page.goto(`/c/${code}`);
  await expect(page.getByText("1 of 1 done", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept & pay", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await signIn(page, "buyer3@example.com");
  await page.goto(`/c/${code}`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await signIn(page, "buyer@example.com");
  await page.goto(`/c/${code}`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Yes, remove", exact: true })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: "test-results/member-remove-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Yes, remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
