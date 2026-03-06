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
} from "../src/lib/store";

function setupLiveGMRoom() {
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

  return { code: host.code, hostId: host.playerId, secondId: second.playerId, thirdId: third.playerId };
}

describe("gm state machine", () => {
  it("enforces reading -> readiness gate -> voting_open", () => {
    const room = setupLiveGMRoom();

    publishGMBeat(room.code, room.hostId, {
      title: "Signal",
      location: "Deck",
      icon: "⚡",
      rawText: "Alarms strobe red.",
      visualBeats: [{ type: "text", content: "Alarms strobe red." }],
      aiSource: "local",
    });

    publishGMChoices(room.code, room.hostId, {
      choices: [
        { id: "a", label: "Push ahead", icon: "⚔️" },
        { id: "b", label: "Scan room", icon: "🔍" },
        { id: "c", label: "Hold line", icon: "🛡️" },
      ],
      timeLimitSec: 30,
    });

    let snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("creating_choices");
    expect(snapshot.choicesOpen).toBe(false);
    expect(snapshot.turnDeadline).toBeNull();

    markGMPlayerReady(room.code, room.secondId);
    snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("creating_choices");
    expect(snapshot.gmState?.readyState.allReady).toBe(false);

    markGMPlayerReady(room.code, room.thirdId);
    snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("creating_choices");
    expect(snapshot.gmState?.readyState.allReady).toBe(false);

    markGMReady(room.code, room.hostId);
    snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("voting_open");
    expect(snapshot.gmState?.readyState.allReady).toBe(true);
    expect(snapshot.choicesOpen).toBe(true);
    expect((snapshot.turnDeadline ?? 0) > Date.now()).toBe(true);
  });
});
