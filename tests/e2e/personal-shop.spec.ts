import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";

// The shop shows a buyer their own audience from gender and date of birth (owner, 2026-11-21).
test.use({ contextOptions: { reducedMotion: "reduce" } });

async function sql(text: string, values: unknown[] = []) {
  const pool = new Pool({
    connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL),
  });
  try {
    return (await pool.query(text, values)).rows;
  } finally {
    await pool.end();
  }
}

test("sign-up asks for gender and date of birth", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Gender")).toBeVisible();
  await expect(page.getByLabel("Date of birth")).toBeVisible();
});

test("a woman's shop has no audience box and no men's clothing", async ({ page }, info) => {
  const email = `personal-${info.project.name}@example.com`;
  const phone = info.project.name.includes("mobile") ? "0779990001" : "0779990002";
  await sql(`DELETE FROM "User" WHERE email = $1`, [email]);
  await sql(
    `INSERT INTO "User" (id, name, email, phone, "passwordHash", gender, "birthDate", city, address, lat, lng)
     SELECT $1, 'Nadeesha Perera', $2, $3, "passwordHash", 'FEMALE', '1995-04-12', city, address, lat, lng
     FROM "User" WHERE email = $4`,
    [`personal-${info.project.name}`, email, phone, DEMO_BUYERS.tharindu],
  );

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  await page.goto("/shop");
  await expect(page.getByRole("combobox", { name: "Audience" })).toHaveCount(0);
  await expect(page.getByText("Cotton blouse")).toBeVisible();
  await expect(page.getByText("Oxford button-down shirt")).toHaveCount(0);
  const categories = page.getByRole("combobox", { name: "Category" });
  await expect(categories.getByRole("option", { name: "Dresses" })).toBeAttached();
  await expect(categories.getByRole("option", { name: "Jeans", exact: true })).toHaveCount(0);

  await page.goto("/account");
  await expect(page.getByLabel("Gender")).toHaveValue("FEMALE");
  await expect(page.getByLabel("Date of birth")).toHaveValue("1995-04-12");
});
