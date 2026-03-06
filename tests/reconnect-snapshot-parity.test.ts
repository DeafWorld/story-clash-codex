import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  joinRoom,
  lockGMVoteIfDue,
  markGMPlayerReady,
  markGMReady,
  markPlayerConnection,
  publishGMBeat,
  publishGMChoices,
  publishGMConsequence,
  recordMinigameScore,
  resolveMinigameSpin,
  selectGenre,
  startGame,
  submitGMVote,
} from "../src/lib/store";

function setupBaseRoom() {
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

  return {
    code: host.code,
    hostId: host.playerId,
    secondId: second.playerId,
    thirdId: third.playerId,
  };
}

function publishBeatAndChoices(room: ReturnType<typeof setupBaseRoom>) {
  publishGMBeat(room.code, room.hostId, {
    title: "Bridge",
    location: "Deck",
    icon: "⚡",
    rawText: "Reality thins around the bulkhead.",
    visualBeats: [{ type: "text", content: "Reality thins around the bulkhead." }],
    aiSource: "local",
  });

  publishGMChoices(room.code, room.hostId, {
    choices: [
      { id: "a", label: "Push ahead", icon: "⚔️" },
      { id: "b", label: "Scan room", icon: "🔍" },
      { id: "c", label: "Hold line", icon: "🛡️" },
    ],
    timeLimitSec: 10,
  });
}

describe("authoritative reconnect parity", () => {
  it("restores reading phase snapshot after disconnect/reconnect", () => {
    const room = setupBaseRoom();

    publishGMBeat(room.code, room.hostId, {
      title: "Reading",
      location: "Corridor",
      icon: "📖",
      rawText: "Read this before choosing.",
      visualBeats: [{ type: "text", content: "Read this before choosing." }],
      aiSource: "local",
    });

    const before = getGameState(room.code);
    expect(before.gmState?.phase).toBe("reading");

    markPlayerConnection(room.code, room.secondId, false);
    markPlayerConnection(room.code, room.secondId, true);

    const after = getGameState(room.code);
    expect(after.gmState?.phase).toBe("reading");
    expect(after.gmState?.currentBeat?.rawText).toBe(before.gmState?.currentBeat?.rawText);
  });

  it("restores voting snapshot and blocks replayed vote actions", () => {
    const room = setupBaseRoom();
    publishBeatAndChoices(room);

    markGMPlayerReady(room.code, room.secondId);
    markGMPlayerReady(room.code, room.thirdId);
    markGMReady(room.code, room.hostId);

    let snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("voting_open");

    submitGMVote(room.code, room.secondId, "a");

    markPlayerConnection(room.code, room.secondId, false);
    markPlayerConnection(room.code, room.secondId, true);

    snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("voting_open");
    expect(snapshot.gmState?.voteState.votesByPlayerId[room.secondId]).toBe("a");

    expect(() => submitGMVote(room.code, room.secondId, "b")).toThrow(/already voted/i);
  });

  it("restores vote_locked and writing_consequence snapshots", () => {
    const room = setupBaseRoom();
    publishBeatAndChoices(room);

    markGMPlayerReady(room.code, room.secondId);
    markGMPlayerReady(room.code, room.thirdId);
    markGMReady(room.code, room.hostId);

    submitGMVote(room.code, room.secondId, "a");
    const lock = submitGMVote(room.code, room.thirdId, "a");
    expect(lock.locked).toBe(true);

    markPlayerConnection(room.code, room.thirdId, false);
    markPlayerConnection(room.code, room.thirdId, true);

    let snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("vote_locked");
    expect(snapshot.gmState?.voteState.lockedChoiceId).toBe("a");

    publishGMConsequence(room.code, room.hostId, "The corridor compresses and spits the crew forward.");
    markPlayerConnection(room.code, room.secondId, false);
    markPlayerConnection(room.code, room.secondId, true);

    snapshot = getGameState(room.code);
    expect(snapshot.gmState?.phase).toBe("writing_consequence");
    expect(snapshot.gmState?.currentOutcomeText).toMatch(/corridor compresses/i);

    const forced = lockGMVoteIfDue(room.code, true);
    expect(forced.locked).toBe(false);
  });
});
