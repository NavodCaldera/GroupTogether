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

test("four admins: three run their stream, the core admin runs settings and admins", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const accounts = [
    {
      area: "PREMIUM",
      email: "premium@groupbasket.lk",
      home: "/admin/brands",
      title: "Brand rewards",
      tabs: ["Luxury brands", "Users"],
      denied: ["/admin/offers", "/admin/settings", "/admin/slips", "/admin/users/new-admin"],
      addUser: "Add luxury brand",
    },
    {
      area: "FACTORY",
      email: "factory@groupbasket.lk",
      home: "/admin/factory",
      title: "Apparel and factories",
      tabs: ["Factories", "Applications", "Stock", "Lots", "Products", "Offers", "Users"],
      denied: ["/admin/brands", "/admin/slips", "/admin/settings", "/admin/users/new-admin"],
      addUser: "Add factory",
    },
    {
      area: "WAREHOUSE",
      email: "buyers@groupbasket.lk",
      home: "/admin/warehouse",
      title: "Warehouse and delivery",
      tabs: ["Buyers & orders", "Slips", "Orders", "Carts", "Buyers"],
      denied: [
        "/admin/brands",
        "/admin",
        "/admin/offers",
        "/admin/settings",
        "/admin/users/new-seller",
        "/admin/users/new-admin",
      ],
      addUser: null,
    },
    {
      area: "CORE",
      email: "core@groupbasket.lk",
      home: "/admin/users",
      title: "Users",
      tabs: ["Admins", "Settings"],
      denied: ["/admin/brands", "/admin", "/admin/slips", "/admin/orders"],
      addUser: "Add admin",
    },
  ];
  const homeOf = Object.fromEntries(accounts.map((a) => [a.area, a.home]));
  for (const account of accounts) {
    await signIn(page, account.email);
    await expect(page).toHaveURL(new RegExp(account.home + "$"));
    await expect(page.getByRole("heading", { name: account.title, exact: true })).toBeVisible();
    const nav = page
      .getByRole("navigation")
      .filter({ has: page.getByRole("link", { name: new RegExp(`^${account.tabs[0]}`) }) });
    await expect(nav.getByRole("link")).toHaveText(account.tabs.map((t) => new RegExp(`^${t}`)));
    for (const route of account.denied) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(account.home + "$"));
    }
    await page.goto("/admin/users");
    if (account.addUser)
      await expect(page.getByRole("link", { name: account.addUser })).toBeVisible();
    if (account.area !== "CORE")
      await expect(page.getByRole("link", { name: "Add admin" })).toHaveCount(0);

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

  // Only the core admin adds admins, for any area; each new admin lands in their workspace.
  for (const [index, area] of ["PREMIUM", "FACTORY", "WAREHOUSE"].entries()) {
    await signIn(page, "core@groupbasket.lk");
    await page.goto("/admin/users");
    await page.getByRole("link", { name: "Add admin" }).click();
    const email = `${area.toLowerCase()}-operator@example.com`;
    await page.getByLabel("Area").selectOption(area);
    await page.getByLabel("Name", { exact: true }).fill(area + " operator");
    await page.getByLabel("Email (they sign in with this)").fill(email);
    await page.getByLabel("Mobile", { exact: true }).fill("077123456" + index);
    await page.getByLabel("Temporary password").fill("password123");
    await page.getByRole("button", { name: "Create admin account", exact: true }).click();
    await page.waitForURL("**/admin/users");
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(homeOf[area] + "$"));
  }
});
