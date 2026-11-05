import { expect, test } from "@playwright/test";

test("a render error shows the friendly boundary, not a raw crash page", async ({ page }) => {
  await page.goto("/e2e-error");
  const alert = page.getByRole("alert").filter({ hasText: "Something went wrong" });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to home" })).toBeVisible();
  await expect(alert).not.toContainText("e2e boundary check");
  await expect(page.getByText("Application error")).toHaveCount(0);
});
