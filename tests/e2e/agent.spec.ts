import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { Client } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO, DEMO_AGENTS, DEMO_PICKUP_CODE } from "../../src/lib/demo-accounts";
import { seedBrowserFixtures } from "./seed-fixtures";

test.describe.configure({ mode: "serial" });
test.beforeAll(seedBrowserFixtures);

/** Rows the seed does not make, written to the test DB. */
async function sql(text: string, values: unknown[] = []) {
  config({ quiet: true });
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
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

async function inspect(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
}

const section = (page: Page, name: string | RegExp) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name }) });

test("the agent marks the courier basket received", async ({ page }) => {
  await signIn(page, DEMO.baskets.WITH_COURIER.agent);
  await expect(page).toHaveURL(/\/agent$/);
  const arriving = section(page, /Arriving today/);
  await expect(arriving.getByText("Sunil Fernando")).toBeVisible();
  await expect(arriving.getByText("WP-KX-7781")).toBeVisible();
  await expect(arriving.getByText(/1,200/)).toBeVisible();
  await arriving.getByRole("button", { name: "Mark received" }).click();
  await expect(page.getByRole("status").getByText("Basket received")).toBeVisible();
  await expect(section(page, /Arriving today/)).toHaveCount(0);
  await expect(
    section(page, /Waiting for pickup/).getByText("Ravindu", { exact: false }),
  ).toBeVisible();
});

test("the agent types the buyer's code and hands over", async ({ page }) => {
  await signIn(page, DEMO.readyAgent);
  await page.getByLabel("Pickup code").fill(DEMO_PICKUP_CODE);
  await page.getByRole("button", { name: "Find" }).click();
  const items = page.getByRole("group", { name: "Items to hand over" });
  await expect(page.getByText("Dilan Wickramasinghe")).toBeVisible();
  await expect(items.getByRole("checkbox")).toHaveCount(2);
  await page.getByRole("button", { name: "Hand over" }).click();
  await expect(page.getByRole("status").getByText("Handed over")).toBeVisible();
  await expect(items).toHaveCount(0);
  await expect(section(page, /Waiting for pickup/).getByText("Dilan Wickramasinghe")).toHaveCount(
    0,
  );
  // Nothing is left to hand over on that code.
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByRole("alert").getByText("Code not found")).toBeVisible();
});

test("the agent collects a buyer's return", async ({ page }) => {
  await signIn(page, DEMO.returnAgent);
  const returns = section(page, /Returns to collect/);
  await expect(returns.getByText("Sachini Gunawardena")).toBeVisible();
  await returns.getByRole("button", { name: "Collected" }).click();
  await expect(page.getByRole("status").getByText("Return collected")).toBeVisible();
  await expect(section(page, /Returns to collect/).getByText("Sachini Gunawardena")).toHaveCount(0);
  await page.getByRole("link", { name: "Returns", exact: true }).click();
  await expect(page).toHaveURL(/\/agent\/returns$/);
  // A buyer-fault return stays with the agent to resell (DEC-017).
  const resale = section(page, /To resell/);
  await expect(resale.getByText(/× 1/)).toBeVisible();
  await expect(resale.getByText("Buyer gets")).toBeVisible();
  await resale.getByRole("button", { name: "Sold" }).click();
  await expect(page.getByRole("status").getByText("Marked sold")).toBeVisible();
  await expect(section(page, /To resell/).getByText(/× 1/)).toHaveCount(0);
});

test("an applicant sees the application; a buyer cannot open the agent screens", async ({
  page,
}) => {
  await signIn(page, DEMO_AGENTS.applicant);
  await page.goto("/agents/apply");
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  await page.goto("/agent");
  await expect(page).toHaveURL(/\/agents\/apply$/);
  await inspect(page);
  await signIn(page, DEMO.readyBuyer);
  await page.goto("/agent/pickups");
  await expect(page).not.toHaveURL(/\/agent\//);
});

test("an approved applicant saves hours, pays the deposit and lands on the deposit page", async ({
  page,
}) => {
  await sql(
    `UPDATE "Agent" SET status = 'APPROVED' WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
    [DEMO_AGENTS.applicant],
  );
  await signIn(page, DEMO_AGENTS.applicant);
  await page.goto("/agent/hours");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").getByText("Open on at least one day")).toBeVisible();
  await page.getByLabel("Monday", { exact: true }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").getByText("Hours saved")).toBeVisible();

  await page.goto("/agents/apply");
  await page.getByRole("button", { name: "Pay deposit" }).click();
  await expect(page).toHaveURL(/\/demo-pay\//);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL(/\/agent\/deposit\//);
  await expect(page.getByRole("heading", { name: "Deposit paid", level: 1 })).toBeVisible();
  await inspect(page);
  await page.getByRole("main").getByRole("link", { name: "Agent home" }).click();
  await expect(page).toHaveURL(/\/agent$/);
});

for (const width of [1280, 360])
  test(`agent screens pass axe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, DEMO.readyAgent);
    for (const path of [
      "/agent",
      "/agent/pickups",
      "/agent/returns",
      "/agent/tokens",
      "/agent/hours",
    ]) {
      await page.goto(path);
      await inspect(page);
    }
    await page.goto("/agent/tokens");
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page.getByRole("button", { name: "Confirm leave" })).toBeVisible();
    await inspect(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Leave" })).toBeVisible();
  });
