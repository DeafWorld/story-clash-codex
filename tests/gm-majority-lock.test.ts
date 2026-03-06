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
  submitGMVote,
} from "../src/lib/store";

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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
    rawText: "The hull groans.",
    visualBeats: [{ type: "text", content: "The hull groans." }],
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

  return { code: host.code, hostId: host.playerId, secondId: second.playerId, thirdId: third.playerId };
}

describe("gm majority lock", () => {
  it("locks when majority is reached", () => {
    const room = setupVotingRoom();

    const firstVote = submitGMVote(room.code, room.secondId, "a");
    expect(firstVote.locked).toBe(false);
    expect(firstVote.gmState.phase).toBe("voting_open");

    const secondVote = submitGMVote(room.code, room.thirdId, "a");
    expect(secondVote.locked).toBe(true);
    expect(secondVote.gmState.phase).toBe("vote_locked");
    expect(secondVote.gmState.voteState.lockedChoiceId).toBe("a");
  });

  it("uses deterministic hash tie-break for split 1-1 vote", () => {
    const room = setupVotingRoom();

    submitGMVote(room.code, room.secondId, "a");
    const lock = submitGMVote(room.code, room.thirdId, "b");

    const state = getGameState(room.code);
    const beatIndex = state.gmState?.beatIndex ?? 0;
    const topChoiceIds = ["a", "b"].sort((left, right) => left.localeCompare(right));
    const seed = `${room.code}:${beatIndex}:${topChoiceIds.join(",")}`;
    const expected = topChoiceIds[stableHash(seed) % topChoiceIds.length];

    expect(lock.locked).toBe(true);
    expect(lock.gmState.voteState.lockedChoiceId).toBe(expected);
  });
});
