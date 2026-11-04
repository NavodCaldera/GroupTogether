import { expect, test } from "@playwright/test";

test("white light mode by default, dark mode on request, remembered", async ({ page }) => {
  await page.goto("/shop");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg()).toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  expect(await bg()).not.toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
