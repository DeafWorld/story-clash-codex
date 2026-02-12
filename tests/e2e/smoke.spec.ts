import { expect, test } from "@playwright/test";

test("home page renders primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Story Clash", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Room" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join Room" })).toBeVisible();
});

test("demo lobby shows sticky top actions and immediate back navigation", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "Start Demo Room" }).click();
  await page.waitForURL(/\/lobby\/DEMO1\?/);

  await expect(page.getByRole("link", { name: "Back Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();

  await page.getByRole("link", { name: "Back Home" }).click();
  await page.waitForURL("/");
});

test("join route accepts invite query code prefill", async ({ page }) => {
  await page.goto("/join?code=ABCD&from=invite&inviter=Host");
  await expect(page.getByLabel("Room code")).toHaveValue("ABCD");
  await expect(page.getByText("Invited to room ABCD by Host.")).toBeVisible();
});

test("demo game shows narrator banner", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "Start Demo Room" }).click();
  await page.waitForURL(/\/lobby\/DEMO1\?/);
  await page.getByRole("button", { name: "Start Minigame (Demo)" }).click();
  await page.waitForURL(/\/minigame\/DEMO1\?/);
  await page.getByRole("button", { name: "Finish Demo Minigame" }).click();
  await page.waitForURL(/\/game\/DEMO1\?/);
  await expect(page.getByText(/narrator/i)).toBeVisible();
});

test("health endpoint is reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.status).toBe("ok");
});
