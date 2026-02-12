import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  getRecapState,
  joinRoom,
  recordMinigameScore,
  restartSession,
  selectGenre,
  startGame,
  submitChoice,
} from "../src/lib/store";

describe("store multiplayer flow", () => {
  it("runs create -> lobby -> minigame -> game -> recap -> restart", () => {
    const created = createRoom("Host");
    const code = created.code;

    const joinTwo = joinRoom(code, "Player2");
    const joinThree = joinRoom(code, "Player3");

    expect(joinTwo.playerId).toBeTruthy();
    expect(joinThree.playerId).toBeTruthy();
    expect(startGame(code, created.playerId).startAt).toBeGreaterThan(0);

    const players = getGameState(code).players;
    const host = players.find((player) => player.id === created.playerId);
    const p2 = players.find((player) => player.id === joinTwo.playerId);
    const p3 = players.find((player) => player.id === joinThree.playerId);

    if (!host || !p2 || !p3) {
      throw new Error("Test room players missing");
    }

    // Deterministic leaderboard: Host first, Player2 second, Player3 third.
    const scoringPlan = [
      [host.id, 95],
      [p2.id, 70],
      [p3.id, 30],
    ] as const;

    let finalResult:
      | {
          ready: boolean;
          leaderboard: Array<{ id: string }>;
        }
      | null = null;
    for (let round = 1; round <= 3; round += 1) {
      for (const [id, score] of scoringPlan) {
        finalResult = recordMinigameScore(code, id, round, score);
      }
    }

    if (!finalResult) {
      throw new Error("Expected minigame result");
    }
    expect(finalResult.ready).toBe(true);
    expect(finalResult.leaderboard[0]?.id).toBe(host.id);

    const selected = selectGenre(code, host.id, "zombie");
    expect(selected.genre).toBe("zombie");
    expect(selected.scene.id).toBe("start");
    expect(selected.narration?.trigger).toBe("scene_enter");

    const firstTurn = getGameState(code);
    const firstPlayer = firstTurn.activePlayerId;
    if (!firstPlayer) {
      throw new Error("No active player for first turn");
    }

    const one = submitChoice(code, firstPlayer, { choiceId: "a" });
    expect(one.ended).toBe(false);
    if (one.ended) {
      throw new Error("Game unexpectedly ended at first decision");
    }
    expect(one.nextScene?.id).toBe("armed");
    expect(one.narration?.trigger).toBe("choice_submitted");

    const secondTurn = getGameState(code);
    if (!secondTurn.activePlayerId) {
      throw new Error("No active player for second turn");
    }
    const two = submitChoice(code, secondTurn.activePlayerId, { choiceId: "a" });
    expect(two.ended).toBe(false);
    if (two.ended) {
      throw new Error("Game unexpectedly ended at second decision");
    }
    expect(two.nextScene?.id).toBe("stairwell");

    const thirdTurn = getGameState(code);
    if (!thirdTurn.activePlayerId) {
      throw new Error("No active player for third turn");
    }
    const three = submitChoice(code, thirdTurn.activePlayerId, { choiceId: "a" });
    expect(three.ended).toBe(false);
    if (three.ended) {
      throw new Error("Game unexpectedly ended at third decision");
    }
    expect(three.nextScene?.id).toBe("checkpoint_twist");

    const fourthTurn = getGameState(code);
    if (!fourthTurn.activePlayerId) {
      throw new Error("No active player for fourth turn");
    }
    const four = submitChoice(code, fourthTurn.activePlayerId, { choiceId: "a" });
    expect(four.ended).toBe(true);
    if (!four.ended) {
      throw new Error("Expected game to end at fourth decision");
    }
    expect(four.nextScene?.id).toBe("ending_survival");
    expect(four.endingType).toBe("survival");
    expect(four.history.length).toBe(4);
    expect(four.narration?.trigger).toBe("choice_submitted");
    expect(four.endingNarration?.trigger).toBe("ending");

    const recap = getRecapState(code);
    expect(recap.genre).toBe("zombie");
    expect(recap.endingType).toBe("survival");
    expect(recap.history.length).toBe(4);
    expect(recap.genrePower.zombie).toBeGreaterThanOrEqual(0);
    expect(recap.chaosLevel).toBeGreaterThanOrEqual(0);
    expect(recap.riftHistory.length).toBeGreaterThan(0);
    expect(recap.latestNarration?.trigger).toBe("ending");
    expect(recap.narrationLog.length).toBeGreaterThan(0);

    const restarted = restartSession(code);
    expect(restarted.phase).toBe("lobby");
    expect(restarted.history.length).toBe(0);
    expect(restarted.genre).toBeNull();
    expect(restarted.chaosLevel).toBe(0);
    expect(restarted.riftHistory.length).toBe(0);
    expect(restarted.latestNarration).toBeNull();
    expect(restarted.narrationLog.length).toBe(0);
  });
});
