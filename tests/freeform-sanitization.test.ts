import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  joinRoom,
  markGMPlayerReady,
  markGMReady,
  publishGMBeat,
  publishGMChoices,
  recordMinigameScore,
  resolveMinigameSpin,
  selectGenre,
  startGame,
  submitGMFreeform,
} from "../src/lib/store";
import { sanitizeFreeformInput } from "../src/lib/ai-copilot-local";

function setupVotingRoom() {
  const host = createRoom("Host");
  const second = joinRoom(host.code, "Second");
  const third = joinRoom(host.code, "Third");

  startGame(host.code, host.playerId);
  recordMinigameScore(host.code, host.playerId, 1, 11);
  recordMinigameScore(host.code, second.playerId, 1, 22);
  recordMinigameScore(host.code, third.playerId, 1, 33);
  const spin = resolveMinigameSpin(host.code, host.playerId);

  const storyMasterId = getGameState(host.code).turnOrder[0];
  selectGenre(host.code, storyMasterId, spin.outcome.winningGenre);

  publishGMBeat(host.code, host.playerId, {
    title: "Rift",
    location: "Hall",
    icon: "⚡",
    rawText: "Air pressure drops.",
    visualBeats: [{ type: "text", content: "Air pressure drops." }],
    aiSource: "local",
  });

  publishGMChoices(host.code, host.playerId, {
    choices: [
      { id: "a", label: "Push ahead", icon: "⚔️" },
      { id: "b", label: "Scan room", icon: "🔍" },
      { id: "c", label: "Hold line", icon: "🛡️" },
    ],
    timeLimitSec: 30,
  });

  markGMPlayerReady(host.code, second.playerId);
  markGMPlayerReady(host.code, third.playerId);
  markGMReady(host.code, host.playerId);

  return { code: host.code, secondId: second.playerId };
}

describe("freeform sanitization", () => {
  it("strips html, control chars, and enforces length", () => {
    const raw = "<script>alert(1)</script>  Hello\u0001\u0002\n\tworld   ";
    const sanitized = sanitizeFreeformInput(raw);
    expect(sanitized.includes("<script>")).toBe(false);
    expect(sanitized.includes("\u0001")).toBe(false);
    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized).toContain("Hello");
  });

  it("stores one sanitized freeform per player per beat (latest overwrite)", () => {
    const room = setupVotingRoom();
    submitGMFreeform(room.code, room.secondId, "<b>First</b> message");
    submitGMFreeform(room.code, room.secondId, "Second\u0004\u0005 message");

    const snapshot = getGameState(room.code);
    const entry = snapshot.gmState?.voteState.freeformByPlayerId[room.secondId];
    expect(entry).toBeTruthy();
    expect(entry?.text).toBe("Second message");
  });
});
