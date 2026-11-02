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

test("three area admins each run their whole stream, with no unrestricted admin", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const accounts = [
    {
      area: "PREMIUM",
      email: "premium@groupbasket.lk",
      home: "/admin/brands",
      title: "Brand rewards",
      tabs: ["Brand rewards", "Users"],
      denied: ["/admin/offers", "/admin/settings", "/admin/slips", "/admin/users/new-packer"],
      addUser: "Add premium brand",
    },
    {
      area: "FACTORY",
      email: "factory@groupbasket.lk",
      home: "/admin/factory",
      title: "Apparel and factories",
      tabs: ["Factory apparel", "Stock", "Lots", "Products", "Offers", "Users", "Settings"],
      denied: ["/admin/brands", "/admin/slips", "/admin/users/new-packer"],
      addUser: "Add factory seller",
    },
    {
      area: "WAREHOUSE",
      email: "buyers@groupbasket.lk",
      home: "/admin/warehouse",
      title: "Warehouse and delivery",
      tabs: ["Warehouse & delivery", "Slips", "Orders", "Carts", "Users", "Settings"],
      denied: ["/admin/brands", "/admin", "/admin/offers", "/admin/users/new-seller"],
      addUser: "Add packing staff",
    },
  ];
  for (const [index, account] of accounts.entries()) {
    await signIn(page, account.email);
    await expect(page).toHaveURL(new RegExp(account.home + "$"));
    await expect(page.getByRole("heading", { name: account.title, exact: true })).toBeVisible();
    const nav = page
      .getByRole("navigation")
      .filter({ has: page.getByRole("link", { name: "Users" }) });
    await expect(nav.getByRole("link")).toHaveText(account.tabs.map((t) => new RegExp(`^${t}`)));
    for (const route of account.denied) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(account.home + "$"));
    }

    // Each area adds its own admins; the new admin lands in the same workspace.
    await page.goto("/admin/users");
    await expect(page.getByRole("link", { name: account.addUser })).toBeVisible();
    await page.getByRole("link", { name: "Add admin", exact: true }).click();
    const email = `${account.area.toLowerCase()}-operator@example.com`;
    await page.getByLabel("Name", { exact: true }).fill(account.area + " operator");
    await page.getByLabel("Email (they sign in with this)").fill(email);
    await page.getByLabel("Mobile", { exact: true }).fill("077123456" + index);
    await page.getByLabel("Temporary password").fill("password123");
    await page.getByRole("button", { name: "Create admin account", exact: true }).click();
    await page.waitForURL("**/admin/users");
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(account.home + "$"));

    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: "test-results/admin-" + account.area.toLowerCase() + "-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});
