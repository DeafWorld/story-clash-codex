import { expect, test, type Page } from "@playwright/test";

const RUN_LIVE_E2E = process.env.RUN_LIVE_E2E === "1";

function roomCodeFromLobbyUrl(url: string): string {
  const match = url.match(/\/lobby\/([A-Z0-9]{4})\?/);
  if (!match) {
    throw new Error(`Could not extract room code from url: ${url}`);
  }
  return match[1];
}

async function waitForActiveTurn(pages: Page[]) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const page of pages) {
      const badge = page.locator("text=Your Turn,");
      // eslint-disable-next-line no-await-in-loop
      if (await badge.isVisible().catch(() => false)) {
        return page;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for active turn page");
}

test.describe("Live Multiplayer Flow (Cloudflare Worker)", () => {
  test.setTimeout(240_000);

  test("runs a full session to recap", async ({ browser }) => {
    test.skip(!RUN_LIVE_E2E, "Set RUN_LIVE_E2E=1 to run the full live multiplayer flow.");

    const hostContext = await browser.newContext();
    const p2Context = await browser.newContext();
    const p3Context = await browser.newContext();

    const host = await hostContext.newPage();
    const p2 = await p2Context.newPage();
    const p3 = await p3Context.newPage();

    await host.goto("/create");
    await host.getByLabel("Display Name").fill("Host");
    await host.getByRole("button", { name: "Create Live Room" }).click();
    await host.waitForURL(/\/lobby\/[A-Z0-9]{4}\?player=/);
    await expect(host.getByRole("link", { name: "Back Home" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Invite" })).toBeVisible();

    const code = roomCodeFromLobbyUrl(host.url());

    await p2.goto("/join");
    await p2.getByLabel("Room code").fill(code);
    await p2.getByLabel("Display name").fill("Player 2");
    await p2.getByRole("button", { name: "Join Room" }).click();
    await p2.waitForURL(new RegExp(`/lobby/${code}\\?player=`));
    await expect(p2.getByText("Player 2")).toBeVisible({ timeout: 20_000 });

    await p3.goto("/join");
    await p3.getByLabel("Room code").fill(code);
    await p3.getByLabel("Display name").fill("Player 3");
    await p3.getByRole("button", { name: "Join Room" }).click();
    await p3.waitForURL(new RegExp(`/lobby/${code}\\?player=`));
    await expect(p3.getByText("Player 3")).toBeVisible({ timeout: 20_000 });

    await expect(host.getByText("Player 2")).toBeVisible({ timeout: 20_000 });
    await expect(host.getByText("Player 3")).toBeVisible({ timeout: 20_000 });

    const startButton = host.getByRole("button", { name: "Start Game" });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await host.waitForURL(new RegExp(`/minigame/${code}`));
    await p2.waitForURL(new RegExp(`/minigame/${code}`));
    await p3.waitForURL(new RegExp(`/minigame/${code}`));
    await expect(host.getByRole("link", { name: "Back to Lobby" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Invite" })).toBeVisible();

    await expect(host.getByRole("button", { name: /Pick Zombie Outbreak/i })).toBeVisible({ timeout: 30_000 });
    await expect(p2.getByRole("button", { name: /Pick Alien Invasion/i })).toBeVisible({ timeout: 30_000 });
    await expect(p3.getByRole("button", { name: /Pick Haunted Manor/i })).toBeVisible({ timeout: 30_000 });

    await host.getByRole("button", { name: /Pick Zombie Outbreak/i }).click();
    await p2.getByRole("button", { name: /Pick Alien Invasion/i }).click();
    await p3.getByRole("button", { name: /Pick Haunted Manor/i }).click();

    await host.getByRole("button", { name: /^Spin Genre Wheel$/ }).click();

    await host.waitForURL(new RegExp(`/game/${code}`), { timeout: 45_000 });
    await p2.waitForURL(new RegExp(`/game/${code}`), { timeout: 45_000 });
    await p3.waitForURL(new RegExp(`/game/${code}`), { timeout: 45_000 });
    await expect(host.getByRole("link", { name: "Back to Lobby" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect(host.getByText(/narrator/i)).toBeVisible();

    // Four turns to reach ending: start -> armed -> stairwell -> checkpoint_twist -> ending_survival
    const gamePages: any[] = [host, p2, p3];

    let active = await waitForActiveTurn(gamePages);
    await active.getByRole("button", { name: "Rip open the supply locker for a weapon" }).click();
    await host.waitForTimeout(1200);

    active = await waitForActiveTurn(gamePages);
    await active.getByRole("button", { name: "Charge the hallway before they surround you" }).click();
    await host.waitForTimeout(1200);

    active = await waitForActiveTurn(gamePages);
    await active.getByRole("button", { name: "Fight upward through the swarm" }).click();
    await host.waitForTimeout(1200);

    active = await waitForActiveTurn(gamePages);
    await active.getByRole("button", { name: "Run the decon lane under floodlights" }).click();

    await host.waitForURL(new RegExp(`/recap/${code}`), { timeout: 30_000 });
    await p2.waitForURL(new RegExp(`/recap/${code}`), { timeout: 30_000 });
    await p3.waitForURL(new RegExp(`/recap/${code}`), { timeout: 30_000 });
    await expect(host.getByRole("link", { name: "Back Home" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Invite" })).toBeVisible();

    // Timeline fades in after a short delay; ensure recap page is actually populated.
    await expect(host.getByRole("heading", { name: "How your story unfolded" })).toBeVisible({ timeout: 30_000 });

    await hostContext.close();
    await p2Context.close();
    await p3Context.close();
  });
});
