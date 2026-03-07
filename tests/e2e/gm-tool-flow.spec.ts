import { expect, test } from "@playwright/test";
import { deterministicTieBreakChoice } from "../../protocol/deterministic-lock";

function roomCodeFromLobbyUrl(url: string): string {
  const match = url.match(/\/lobby\/([A-Z0-9]{4})\?/);
  if (!match) {
    throw new Error(`Could not extract room code from url: ${url}`);
  }
  return match[1] as string;
}

function playerIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const playerId = parsed.searchParams.get("player");
  if (!playerId) {
    throw new Error(`Could not extract player id from url: ${url}`);
  }
  return playerId;
}

test.describe("GM Tool V1.2 Flow", () => {
  test.setTimeout(300_000);

  test("host + players complete readiness -> vote lock -> consequence -> recap transcript", async ({ browser }) => {
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

    const code = roomCodeFromLobbyUrl(host.url());

    await p2.goto("/join");
    await p2.getByLabel("Room code").fill(code);
    await p2.getByLabel("Display name").fill("Player 2");
    await p2.getByRole("button", { name: "Join Room" }).click();
    await p2.waitForURL(new RegExp(`/lobby/${code}\\?player=`));

    await p3.goto("/join");
    await p3.getByLabel("Room code").fill(code);
    await p3.getByLabel("Display name").fill("Player 3");
    await p3.getByRole("button", { name: "Join Room" }).click();
    await p3.waitForURL(new RegExp(`/lobby/${code}\\?player=`));

    await expect(host.getByText("Player 2")).toBeVisible({ timeout: 20_000 });
    await expect(host.getByText("Player 3")).toBeVisible({ timeout: 20_000 });

    await host.getByRole("button", { name: "Start Game" }).click();

    await host.waitForURL(new RegExp(`/minigame/${code}`));
    await p2.waitForURL(new RegExp(`/minigame/${code}`));
    await p3.waitForURL(new RegExp(`/minigame/${code}`));

    await host.getByRole("button", { name: /Pick Zombie Outbreak/i }).click();
    await p2.getByRole("button", { name: /Pick Alien Invasion/i }).click();
    await p3.getByRole("button", { name: /Pick Haunted Manor/i }).click();

    await host.getByRole("button", { name: /^Spin Genre Wheel$/ }).click();

    await host.waitForURL(new RegExp(`/gm/${code}`), { timeout: 45_000 });
    await p2.waitForURL(new RegExp(`/play/${code}`), { timeout: 45_000 });
    await p3.waitForURL(new RegExp(`/play/${code}`), { timeout: 45_000 });

    await host.getByPlaceholder(/Write 2-4 short lines/i).fill(
      "Thunder rips through the station.\nGhost Child: \"You are late.\"\n[The floor trembles under your crew.]\nReality bends around your next decision."
    );
    await host.getByRole("button", { name: "Publish Beat" }).click();

    await expect(p2.getByText("Reading phase")).toBeVisible({ timeout: 15_000 });
    await expect(p3.getByText("Reading phase")).toBeVisible({ timeout: 15_000 });

    const choiceLabels = host.getByPlaceholder("Choice label (2-5 words)");
    await choiceLabels.nth(0).fill("Push ahead");
    await choiceLabels.nth(1).fill("Scan the room");
    await choiceLabels.nth(2).fill("Fortify position");

    await host.getByRole("button", { name: "Publish Choices" }).click();

    await expect(p2.getByText("Choose your action")).toHaveCount(0);
    await expect(p2.getByText("Reading phase")).toBeVisible();

    await p2.getByRole("button", { name: "Ready for Choices" }).click();
    await p3.getByRole("button", { name: "Ready for Choices" }).click();
    await host.getByRole("button", { name: "Mark GM Ready" }).click();

    await expect(p2.getByText("Choose your action")).toBeVisible({ timeout: 20_000 });
    await expect(p3.getByText("Choose your action")).toBeVisible({ timeout: 20_000 });
    await expect(p2.getByText("Vote timer")).toBeVisible();

    await p2.getByRole("button", { name: /Push ahead/i }).click();
    await p3.getByRole("button", { name: /Push ahead/i }).click();

    await expect(host.getByText("Vote locked", { exact: false })).toBeVisible({ timeout: 20_000 });

    await host.getByPlaceholder(/Write 3-5 short lines/i).fill(
      "The crew surges forward in one motion.\nThe corridor snaps shut behind you.\nA distant alarm answers with a human scream.\nYour path is open, but no longer safe."
    );
    await host.getByRole("button", { name: "Publish Consequence" }).click();

    await expect(p2.getByText("Consequence")).toBeVisible({ timeout: 15_000 });
    await expect(p2.getByText("The crew surges forward in one motion.")).toBeVisible({ timeout: 15_000 });

    await host.getByRole("button", { name: "Go To Recap" }).click();
    await host.waitForURL(new RegExp(`/recap/${code}`), { timeout: 20_000 });

    await expect(host.getByRole("heading", { name: "GM Transcript" })).toBeVisible({ timeout: 20_000 });
    await expect(host.getByText("vote lock", { exact: false })).toBeVisible();

    await hostContext.close();
    await p2Context.close();
    await p3Context.close();
  });

  test("reconnect mid-vote preserves parity and deterministic lock outcome", async ({ browser }) => {
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
    const code = roomCodeFromLobbyUrl(host.url());

    await p2.goto("/join");
    await p2.getByLabel("Room code").fill(code);
    await p2.getByLabel("Display name").fill("Player 2");
    await p2.getByRole("button", { name: "Join Room" }).click();
    await p2.waitForURL(new RegExp(`/lobby/${code}\\?player=`));

    await p3.goto("/join");
    await p3.getByLabel("Room code").fill(code);
    await p3.getByLabel("Display name").fill("Player 3");
    await p3.getByRole("button", { name: "Join Room" }).click();
    await p3.waitForURL(new RegExp(`/lobby/${code}\\?player=`));
    const p3PlayerId = playerIdFromUrl(p3.url());

    await host.getByRole("button", { name: "Start Game" }).click();
    await host.waitForURL(new RegExp(`/minigame/${code}`));
    await p2.waitForURL(new RegExp(`/minigame/${code}`));
    await p3.waitForURL(new RegExp(`/minigame/${code}`));

    await host.getByRole("button", { name: /Pick Zombie Outbreak/i }).click();
    await p2.getByRole("button", { name: /Pick Alien Invasion/i }).click();
    await p3.getByRole("button", { name: /Pick Haunted Manor/i }).click();
    await host.getByRole("button", { name: /^Spin Genre Wheel$/ }).click();

    await host.waitForURL(new RegExp(`/gm/${code}`), { timeout: 45_000 });
    await p2.waitForURL(new RegExp(`/play/${code}`), { timeout: 45_000 });
    await p3.waitForURL(new RegExp(`/play/${code}`), { timeout: 45_000 });

    await host.getByPlaceholder(/Write 2-4 short lines/i).fill(
      "Power arcs across the bulkhead.\nGhost Child: \"Split and you break.\"\n[The deck twists under your crew.]\nChoose quickly."
    );
    await host.getByRole("button", { name: "Publish Beat" }).click();
    await expect(p2.getByText("Reading phase")).toBeVisible({ timeout: 15_000 });

    const choiceLabels = host.getByPlaceholder("Choice label (2-5 words)");
    await choiceLabels.nth(0).fill("Push ahead");
    await choiceLabels.nth(1).fill("Scan room");
    await choiceLabels.nth(2).fill("Fortify");
    await host.getByRole("button", { name: "Publish Choices" }).click();

    await p2.getByRole("button", { name: "Ready for Choices" }).click();
    await p3.getByRole("button", { name: "Ready for Choices" }).click();
    await host.getByRole("button", { name: "Mark GM Ready" }).click();

    await expect(p2.getByText("Choose your action")).toBeVisible({ timeout: 20_000 });
    await expect(p3.getByText("Choose your action")).toBeVisible({ timeout: 20_000 });
    await p2.getByRole("button", { name: /Push ahead/i }).click();
    await expect(p2.getByText("You voted for:", { exact: false })).toBeVisible({ timeout: 10_000 });

    await p3.close();
    await host.waitForTimeout(900);

    const reconnectP3 = await p3Context.newPage();
    await reconnectP3.goto(`/play/${code}?player=${p3PlayerId}`);
    await expect(reconnectP3.getByText("Choose your action")).toBeVisible({ timeout: 20_000 });
    await reconnectP3.getByRole("button", { name: /Scan room/i }).click();
    await expect(reconnectP3.getByText("You voted for:", { exact: false })).toBeVisible({ timeout: 10_000 });

    const expectedLockedChoiceId = deterministicTieBreakChoice({
      roomCode: code,
      beatIndex: 1,
      topChoiceIds: ["gm-choice-1", "gm-choice-2"],
    });
    const expectedLabel = expectedLockedChoiceId === "gm-choice-1" ? "Push ahead" : "Scan room";

    await expect(host.getByText("Vote locked", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(host.getByText(expectedLabel)).toBeVisible({ timeout: 20_000 });

    await hostContext.close();
    await p2Context.close();
    await p3Context.close();
  });
});
