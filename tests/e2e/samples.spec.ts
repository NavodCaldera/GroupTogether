import { expect, test, type Page } from "@playwright/test";
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
test("group requests a design sample, accepts transport, and tracks warehouse delivery", async ({
  page,
}) => {
  await signIn(page, "buyer@example.com");
  await page.goto("/samples");
  await expect(
    page.getByText("Request a sample before your group buys.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Pattern / size details").fill("Browser sample blue pattern M");
  await page.getByRole("button", { name: "Request sample", exact: true }).click();
  const card = page.locator("div.rounded-xl").filter({ hasText: "Browser sample blue pattern M" });
  await expect(card).toContainText("requested");
  await signIn(page, "buyers@groupbasket.lk");
  await page.goto("/admin/warehouse");
  const warehouseCard = page
    .locator("div.rounded-xl")
    .filter({ hasText: "Browser sample blue pattern M" });
  await warehouseCard.getByLabel("Group transport quote (LKR)").fill("450.25");
  await warehouseCard.getByRole("button", { name: "Update sample", exact: true }).click();
  await expect(warehouseCard).toContainText("quoted");
  await signIn(page, "buyer@example.com");
  await page.goto("/samples");
  await expect(card).toContainText(/450\.25/);
  await expect(card).toContainText("Sample sending fee:");
  await card.getByRole("button", { name: "Accept group transport cost" }).click();
  await expect(card).toContainText("accepted");
  await signIn(page, "buyers@groupbasket.lk");
  await page.goto("/admin/warehouse");
  await warehouseCard.getByLabel("Courier", { exact: true }).fill("Manual sample courier");
  await warehouseCard.getByLabel("Tracking reference").fill("SAMPLE-BROWSER-1");
  await warehouseCard.getByRole("button", { name: "Update sample", exact: true }).click();
  await expect(warehouseCard).toContainText("dispatched");
  await warehouseCard.getByRole("button", { name: "Update sample", exact: true }).click();
  await expect(warehouseCard).toContainText("delivered");
  await signIn(page, "buyer@example.com");
  await page.goto("/samples");
  await expect(card).toContainText("delivered");
  await expect(card).toContainText("SAMPLE-BROWSER-1");
});
