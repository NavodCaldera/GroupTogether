import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("brand gifts: reserve in basket, approve payment, dispatch and settle", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || testUrl === process.env.DATABASE_URL)
    throw new Error("A separate test database is required");
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  let code: string;
  let giftName: string;
  try {
    const carts = await client.query(
      `SELECT c.code FROM "GroupCart" c JOIN "User" u ON u.id=c."ownerId" WHERE u.email=$1 AND c.status='READY' LIMIT 1`,
      ["buyer2@example.com"],
    );
    const offers = await client.query(
      `SELECT o.name FROM "StockOffer" o JOIN "User" u ON u.id=o."sellerId" WHERE u.email=$1 AND o.status='ACCEPTED' LIMIT 1`,
      ["brand@example.com"],
    );
    code = carts.rows[0].code;
    giftName = offers.rows[0].name;
  } finally {
    await client.end();
  }

  await signIn(page, "premium@groupbasket.lk");
  await page.goto(`/admin/brands?cart=${code}`);
  await page.getByLabel("Eligible recipient").selectOption({ label: "Sachini Gunawardena" });
  const giftOption = await page
    .getByLabel("Gift product")
    .locator("option")
    .filter({ hasText: giftName })
    .getAttribute("value");
  await page.getByLabel("Gift product").selectOption(giftOption!);
  await page.getByRole("button", { name: "Confirm eligibility & reserve gift" }).click();
  await expect(page.getByText("Gift reserved in basket.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Unpaid basket/)).toBeVisible();

  await signIn(page, "brand@example.com");
  await page.goto("/seller?tab=products");
  await expect(page.getByRole("heading", { name: giftName, exact: true })).toBeVisible();
  await expect(page.getByText("Sachini Gunawardena", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/brand-products-mobile.png", fullPage: true });

  await signIn(page, "buyer2@example.com");
  await page.goto(`/c/${code}`);
  await expect(page.getByRole("heading", { name: "Your complimentary gift" })).toBeVisible();
  await expect(page.getByText("Separate brand delivery · Delivery paid by you")).toBeVisible();
  await page.getByRole("button", { name: "Accept & pay", exact: true }).click();
  await page.waitForURL(/\/pay$/);
  await page.getByLabel(/Bank slip/).setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: "Upload slip", exact: true }).click();
  await page.waitForURL(/\?paid=1/);

  await signIn(page, "warehouse@groupbasket.lk");
  await page.goto("/admin/slips");
  await page.getByRole("navigation", { name: "Slips to review" }).getByRole("link").first().click();
  await page.getByRole("button", { name: "Approve…" }).click();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText(/Slip approved/)).toBeVisible();

  await signIn(page, "brand@example.com");
  await page.goto("/seller?tab=orders");
  await expect(page.getByText("Sachini Gunawardena", { exact: true })).toBeVisible();
  await expect(page.getByText("Customer pays", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge order", exact: true }).click();
  await expect(page.getByText(/Acknowledged /)).toBeVisible();
  await page.getByText("Record dispatch", { exact: true }).click();
  await page.getByLabel("Courier", { exact: true }).fill("Test courier");
  await page.getByLabel("Tracking reference", { exact: true }).fill("GB-GIFT-001");
  await page.getByRole("button", { name: "Mark dispatched", exact: true }).click();
  await expect(page.getByText("GB-GIFT-001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark delivered", exact: true }).click();
  await expect(page.locator("span").filter({ hasText: /^Delivered$/ })).toBeVisible();

  await signIn(page, "premium@groupbasket.lk");
  await page.goto("/admin/brands?tab=orders");
  await page.getByRole("button", { name: "Approve gift bill", exact: true }).click();
  await expect(page.getByText("Gift bill approved.", { exact: true })).toBeVisible();
  await page.goto("/admin/brands?tab=settlements");
  await page.getByRole("checkbox").check();
  await page.getByLabel("Bank transfer reference").fill("GB-SUNDAY-001");
  await page.getByRole("button", { name: "Record completed transfer", exact: true }).click();
  await expect(page.getByText("Payment recorded.", { exact: true })).toBeVisible();

  await signIn(page, "brand@example.com");
  await page.goto("/seller?tab=settlements");
  await expect(page.getByText("GB-SUNDAY-001", { exact: true })).toBeVisible();
  await expect(page.getByText("No unpaid gift charges", { exact: true })).toBeVisible();
  await page.getByText("Raise a payment query", { exact: true }).click();
  await page
    .getByLabel("Payment query", { exact: true })
    .fill("Please confirm this bank reference.");
  await page.getByRole("button", { name: "Send payment query", exact: true }).click();
  await expect(page.getByText("Payment query open", { exact: true })).toBeVisible();
  await signIn(page, "premium@groupbasket.lk");
  await page.goto("/admin/brands?tab=settlements");
  await page.getByText("Resolve payment query", { exact: true }).click();
  await page
    .getByLabel("Resolution shared with brand", { exact: true })
    .fill("The transfer reference is correct; bank confirmation checked.");
  await page.getByRole("button", { name: "Record query resolution", exact: true }).click();
  await expect(page.getByText("Settlement updated.", { exact: true })).toBeVisible();
  await signIn(page, "brand@example.com");
  await page.goto("/seller?tab=settlements");
  await page.getByRole("button", { name: "Confirm payment received", exact: true }).click();
  await expect(page.getByText(/Receipt confirmed /)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/brand-settlements-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/seller");
  await page.screenshot({ path: "test-results/brand-overview-desktop.png", fullPage: true });
});

test("admin and brand review, reply privately, preserve drafts and approve a revision", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await signIn(page, "brand@example.com");
  await page.goto("/seller/new");
  await page.getByLabel("Product name", { exact: true }).fill("Communication review gift");
  await page.getByLabel("Product photo", { exact: true }).setInputFiles({
    name: "gift.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByLabel("Gift contents", { exact: true }).fill("Two care items in a gift box");
  await page.getByLabel("Size / weight / volume", { exact: true }).fill("200 ml");
  await page.getByLabel("Dispatch within (business days)", { exact: true }).fill("2");
  await page.getByLabel("Retail value (LKR)", { exact: true }).fill("5000");
  await page.getByLabel("GroupBasket partner price (LKR)", { exact: true }).fill("3500");
  await page.getByLabel("Quantity available for gifts", { exact: true }).fill("8");
  await page
    .getByLabel("Link on your website", { exact: true })
    .fill("https://www.serendib-atelier.example/communication-gift");
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await page.waitForURL(/\/seller\?tab=products/);
  const card = page
    .getByRole("heading", { name: "Communication review gift", exact: true })
    .locator("../..");
  const href = await card
    .getByRole("link", { name: "Discuss product & review history →", exact: true })
    .getAttribute("href");
  const id = new URL(href!, "http://localhost:3200").searchParams.get("subject")!;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  try {
    await signIn(admin, "premium@groupbasket.lk");
    await admin.goto(`/admin/brands?tab=products&offer=${id}`);
    await admin.getByLabel("Decision", { exact: true }).selectOption("changes");
    await admin
      .getByLabel("Reason / message to brand", { exact: true })
      .fill("Please improve the partner discount.");
    await admin.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(admin.getByText("Review recorded.", { exact: true })).toBeVisible();
    await admin.getByRole("link", { name: "Message brand →", exact: true }).click();
    await admin.getByLabel("Message", { exact: true }).fill("Can you offer LKR 3000 per gift?");
    await admin.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      admin.getByText("Can you offer LKR 3000 per gift?", { exact: true }),
    ).toBeVisible();
    await admin
      .getByLabel("Message", { exact: true })
      .fill("Internal margin planning: keep this private.");
    await admin.getByLabel("Internal note · GroupBasket only", { exact: true }).check();
    await admin.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      admin.getByText("Internal margin planning: keep this private.", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(href!);
    await expect(page.getByText("Can you offer LKR 3000 per gift?", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Internal margin planning: keep this private.", { exact: true }),
    ).toHaveCount(0);
    expect(await page.content()).not.toContain("Internal margin planning: keep this private.");
    await page.getByLabel("Message", { exact: true }).fill("Draft waiting for the next update");
    await admin.getByLabel("Message", { exact: true }).fill("The proposed volume is eight gifts.");
    await admin.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      page.getByText("The proposed volume is eight gifts.", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
      "Draft waiting for the next update",
    );
    await page
      .getByLabel("Message", { exact: true })
      .fill("Agreed. I will submit the revised partner price.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(
      page.getByText("Agreed. I will submit the revised partner price.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({ path: "test-results/brand-messages-mobile.png", fullPage: true });
    await page.goto(`/seller/new?offerId=${id}`);
    await page.getByLabel("GroupBasket partner price (LKR)", { exact: true }).fill("3000");
    await page.getByRole("button", { name: "Send for review", exact: true }).click();
    await page.waitForURL(/\/seller\?tab=products/);
    await admin.goto(`/admin/brands?tab=products&offer=${id}`);
    await admin.getByLabel("Decision", { exact: true }).selectOption("approve");
    await admin.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(admin.getByText(/Live approved price: LKR\s+3,000/)).toBeVisible();
    await admin.getByText("Revision history (2)", { exact: true }).click();
    await admin.getByText("Compare with previous submission", { exact: true }).click();
    const comparison = admin
      .getByText("Compare with previous submission", { exact: true })
      .locator("..");
    await expect(comparison.getByText(/^LKR\s+3,500$/)).toBeVisible();
    await expect(comparison.getByText(/^LKR\s+3,000$/)).toBeVisible();
    await admin.screenshot({ path: "test-results/admin-brand-review-desktop.png", fullPage: true });
  } finally {
    await adminContext.close();
  }
});

test("gift product form saves a photo, pack details and optional shelf life", async ({
  page,
  browser,
}) => {
  page.setDefaultTimeout(15000);
  await signIn(page, "brand@example.com");
  await page.goto("/seller/new");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByLabel("Product name", { exact: true }).fill("Browser demo gift pack");
  await page.getByLabel("Product photo", { exact: true }).setInputFiles({
    name: "gift.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("img", { name: "Gift product preview" })).toBeVisible();
  await page
    .getByLabel("Gift contents", { exact: true })
    .fill("Hand cream and body lotion in a gift box");
  await page.getByLabel("Size / weight / volume", { exact: true }).fill("2 x 100 ml");
  await page.getByLabel("Dispatch within (business days)", { exact: true }).fill("2");
  await page.getByLabel("Retail value (LKR)", { exact: true }).fill("5000");
  await page.getByLabel("GroupBasket partner price (LKR)", { exact: true }).fill("3500");
  await expect(
    page.getByText(/30% partner discount.*GroupBasket pays LKR\s+3,500 per gift/),
  ).toBeVisible();
  await page.getByLabel("Quantity available for gifts", { exact: true }).fill("20");
  await page
    .getByLabel("Link on your website", { exact: true })
    .fill("https://serendib-atelier.example/products/browser-demo");
  await expect(page.getByLabel("Description (optional)")).not.toHaveAttribute("required", "");
  await page.getByLabel("This product has an expiry or shelf life").check();
  await page.getByLabel("Minimum shelf life on delivery (days)", { exact: true }).fill("180");
  await expect(page.getByLabel(/delivery (fee|charge)/i)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/gift-product-form-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await page.waitForURL(/\/seller\?tab=products/);
  const card = page
    .getByRole("heading", { name: "Browser demo gift pack", exact: true })
    .locator("../..");
  await expect(card.getByText("2 x 100 ml", { exact: true })).toBeVisible();
  await expect(card.getByText("Within 2 business days", { exact: true })).toBeVisible();
  await expect(card.getByText("At least 180 days remaining", { exact: true })).toBeVisible();
  const photo = card.getByRole("img", { name: "Browser demo gift pack", exact: true });
  await expect
    .poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const src = await photo.getAttribute("src");
  const reviseHref = await card
    .getByRole("link", { name: "Revise submission →" })
    .getAttribute("href");
  await page.goto(reviseHref!);
  await expect(page.getByLabel("Gift contents", { exact: true })).toHaveValue(
    "Hand cream and body lotion in a gift box",
  );
  await expect(page.locator('input[name="photo"]')).not.toHaveAttribute("required", "");
  await page
    .getByLabel("Gift contents", { exact: true })
    .fill("Revised gift box with cream and lotion");
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await page.waitForURL(/\/seller\?tab=products/);
  await expect(
    page.getByText("Revised gift box with cream and lotion", { exact: true }),
  ).toBeVisible();
  const anonymous = await browser.newContext();
  try {
    expect((await anonymous.request.get(`http://localhost:3200${src}`)).status()).toBe(404);
  } finally {
    await anonymous.close();
  }
});
