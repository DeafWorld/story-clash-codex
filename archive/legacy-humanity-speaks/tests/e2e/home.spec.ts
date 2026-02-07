import { expect, test } from "@playwright/test";

test("home renders verification gate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Humanity Speaks")).toBeVisible();
  await expect(page.getByRole("button", { name: /verify/i })).toBeVisible();
});
