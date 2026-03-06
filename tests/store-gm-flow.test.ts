import { describe, expect, it } from "vitest";
import {
  createRoom,
  getRecapState,
  joinRoom,
  markGMPlayerReady,
  markGMReady,
  publishGMBeat,
  publishGMChoices,
  publishGMConsequence,
  recordMinigameScore,
  resolveMinigameSpin,
  selectGenre,
  startGame,
  submitGMVote,
} from "../src/lib/store";

describe("store gm flow integration", () => {
  it("runs authoritative gm loop into recap transcript", () => {
    const host = createRoom("Host");
    const second = joinRoom(host.code, "Second");
    const third = joinRoom(host.code, "Third");

    startGame(host.code, host.playerId);
    recordMinigameScore(host.code, host.playerId, 1, 11);
    recordMinigameScore(host.code, second.playerId, 1, 22);
    recordMinigameScore(host.code, third.playerId, 1, 33);

    const spin = resolveMinigameSpin(host.code, host.playerId);
    selectGenre(host.code, spin.outcome.winnerId, spin.outcome.winningGenre);

    publishGMBeat(host.code, host.playerId, {
      title: "Bridge",
      location: "Main Deck",
      icon: "⚡",
      rawText: "Power flickers across the bridge.",
      visualBeats: [{ type: "text", content: "Power flickers across the bridge." }],
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

    submitGMVote(host.code, second.playerId, "a");
    const locked = submitGMVote(host.code, third.playerId, "a");
    expect(locked.locked).toBe(true);

    publishGMConsequence(host.code, host.playerId, "The crew surges forward and the corridor folds inward.");

    const recap = getRecapState(host.code);
    expect(recap.sessionMode).toBe("gm");
    expect(recap.gmTranscript?.map((entry) => entry.phase)).toEqual(["beat", "vote_lock", "consequence"]);
  });
});
