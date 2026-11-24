import { expect, test, type Page } from "@playwright/test";
import { seedBrowserFixtures } from "./seed-fixtures";

test.beforeAll(seedBrowserFixtures);

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("resell an item, reserve a contact's listing and hand it over", async ({ browser }) => {
  test.setTimeout(180_000);

  // Dilan resells one pack of cream crackers from his ordered CBL basket, at what he paid.
  const dilan = await browser.newPage();
  await signIn(dilan, "buyer@example.com");
  await dilan.goto("/account");
  await dilan.getByRole("link", { name: "Purchase history" }).click();
  await dilan.getByRole("link", { name: /CBL Group/ }).click();
  const crackers = dilan.getByTestId("purchase-item").filter({ hasText: "Cream crackers" });
  await expect(crackers).toContainText("Bought 2 · 2 left to resell");
  await crackers.getByText("Resell", { exact: true }).click();
  await expect(crackers.getByRole("textbox", { name: /price/i })).toHaveCount(0);
  await crackers.getByLabel("Public pickup spot").fill("Liberty Plaza main entrance");
  await crackers.getByLabel("Unopened, in the original packaging").check();
  await crackers.getByRole("button", { name: "List for resale" }).click();
  await expect(crackers).toContainText("1 left to resell");

  // Tharindu lives far away but is Sachini's contact: he sees her contacts-only listing.
  const tharindu = await browser.newPage();
  await signIn(tharindu, "buyer3@example.com");
  await tharindu.goto("/reselling");
  await tharindu.getByTestId("listing").filter({ hasText: "Marie biscuits" }).click();
  await tharindu.getByRole("button", { name: "Reserve" }).click();
  await expect(tharindu.getByTestId("my-reservation")).toContainText("You reserved 1 · Reserved");
  await expect(tharindu.getByText("Pickup: Kollupitiya railway station")).toBeVisible();
  await expect(tharindu.getByTestId("listing-available")).toHaveText("0 available");

  // Nearby buyers never see a contacts-only listing; Dilan sees only Sachini's open one.
  await dilan.goto("/reselling");
  await expect(dilan.getByTestId("listing")).toHaveText([/Cream crackers/]);

  // Sachini confirms the handover.
  const sachini = await browser.newPage();
  await signIn(sachini, "buyer2@example.com");
  await sachini.goto("/reselling/mine");
  const biscuits = sachini.getByTestId("my-listing").filter({ hasText: "Marie biscuits" });
  await biscuits.getByRole("button", { name: "Collected" }).click();
  await expect(biscuits).toContainText("0 available · 0 reserved · 1 collected");
});
