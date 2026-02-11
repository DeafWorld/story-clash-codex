import { expect, test } from "@playwright/test";

test("home page renders primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Story Clash", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Room" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join Room" })).toBeVisible();
});

test("health endpoint is reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.status).toBe("ok");
});
