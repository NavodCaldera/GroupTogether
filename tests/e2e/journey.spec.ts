import { type Page, expect, test } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

test("join from the panel â†’ reach 50,000 â†’ owner pays â†’ admin confirms â†’ PickMe drop", async ({
  page,
}) => {
  // Tharindu (in no cart) joins Dilan's public cart (LKR 49,800) from the open carts panel.
  await signIn(page, "buyer3@example.com");
  await page.goto("/carts");
  await page.getByRole("link", { name: /Dilan Wickramasinghe's cart/ }).click();
  await page.getByRole("button", { name: "Join this cart" }).click();
  await page.waitForURL(/\/shop\?cart=/);
  await page
    .getByRole("link", { name: /Slide sandal/ })
    .first()
    .click();
  await page.getByText("UK 8", { exact: true }).click();
  await page.getByRole("button", { name: "Add to group cart" }).click();
  // Adding stays on the product page; "View cart" in the confirmation opens the cart.
  await expect(page.getByText("Added to your cart")).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await page.waitForURL(/\/c\/[A-Z0-9]+$/);
  const cartUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Waiting for the owner to pay")).toBeVisible();

  // Dilan (the owner) accepts and uploads one bank slip.
  await signIn(page, "buyer@example.com");
  await page.goto(cartUrl);
  await page.getByRole("button", { name: "Accept & pay" }).click();
  await page.waitForURL(/\/pay$/);
  await expect(page.getByRole("heading", { name: /Pay LKR/ })).toBeVisible();
  await page.getByLabel(/Bank slip/).setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await page.getByRole("button", { name: "Upload slip" }).click();
  await page.waitForURL(/\?paid=1/);
  await expect(page.getByText("Payment in review").first()).toBeVisible();

  // The admin approves the slip and books the PickMe drop.
  await signIn(page, "admin@groupbasket.lk");
  await page.goto("/admin/slips");
  await page.getByRole("button", { name: "Approve…" }).click();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText(/Slip approved/)).toBeVisible();
  await page.getByRole("link", { name: "Book the PickMe delivery" }).click();
  await page.getByLabel(/Quoted fee/).fill("950");
  await page.getByRole("button", { name: "Mark as booked with PickMe" }).click();
  await expect(page.getByText(/Delivery booked/)).toBeVisible();

  // The owner sees it on the way, with the fee they pay the driver.
  await signIn(page, "buyer@example.com");
  await page.goto(cartUrl);
  await expect(page.getByText("On the way").first()).toBeVisible();
  await expect(page.getByText(/LKR\s?950/)).toBeVisible();
});

test("a private cart is hidden from the panel but opens from its link", async ({ page }) => {
  await page.goto("/carts");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Sachini Gunawardena's cart")).toHaveCount(0);

  await signIn(page, "buyer2@example.com");
  await page.goto("/my-carts");
  await page.getByRole("link", { name: /Sachini Gunawardena's cart/ }).click();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  const url = page.url();

  // Tharindu's cart from the first journey is on its way (no longer active), so he can join.
  await signIn(page, "buyer3@example.com");
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Join this cart" })).toBeVisible();
});
