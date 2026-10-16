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
  // Ishara joins Amaya's public cart (LKR 49,800) from the open carts panel.
  await signIn(page, "ishara@example.com");
  await page.goto("/carts");
  await page.getByRole("link", { name: /Office sneaker run/ }).click();
  await page.getByRole("button", { name: "Join this cart" }).click();
  await page.waitForURL(/\/shop\?cart=/);
  await page
    .getByRole("link", { name: /Slide sandal/ })
    .first()
    .click();
  await page.getByText("UK 8", { exact: true }).click();
  await page.getByRole("button", { name: "Add to group cart" }).click();
  await page.waitForURL(/\/c\/[A-Z0-9]+\?added=1/);
  const cartUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Waiting for the owner to accept")).toBeVisible();

  // Amaya (the owner) accepts and uploads one bank slip.
  await signIn(page, "amaya@example.com");
  await page.goto(cartUrl);
  await page.getByRole("button", { name: "Accept the order and pay" }).click();
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
  await signIn(page, "admin@grouptogether.lk");
  await page.goto("/admin/slips");
  await page.getByRole("button", { name: "Approve and confirm order" }).click();
  await expect(page.getByText(/Slip approved/)).toBeVisible();
  await page.getByLabel(/Quoted fee/).fill("950");
  await page.getByRole("button", { name: "Mark as booked with PickMe" }).click();
  await expect(page.getByText(/Delivery booked/)).toBeVisible();

  // The owner sees it on the way, with the fee they pay the driver.
  await signIn(page, "amaya@example.com");
  await page.goto(cartUrl);
  await expect(page.getByText("On the way").first()).toBeVisible();
  await expect(page.getByText(/LKR\s?950/)).toBeVisible();
});

test("a private cart is hidden from the panel but opens from its link", async ({ page }) => {
  await page.goto("/carts");
  await expect(page.getByText("Family school shoes")).toBeVisible();
  await expect(page.getByText("Ravi's friends only")).toHaveCount(0);

  await signIn(page, "ravi@example.com");
  await page.goto("/my-carts");
  await page.getByRole("link", { name: /Ravi's friends only/ }).click();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();
  const url = page.url();

  await signIn(page, "kasun@example.com");
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Join this cart" })).toBeVisible();
});
