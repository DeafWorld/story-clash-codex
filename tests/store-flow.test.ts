import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  getRecapState,
  joinRoom,
  recordMinigameScore,
  resolveMinigameSpin,
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

    const scoringPlan = [
      [host.id, 11],
      [p2.id, 22],
      [p3.id, 33],
    ] as const;

    let pickResult:
      | {
          ready: boolean;
          pick: string | null;
        }
      | null = null;
    for (const [id, score] of scoringPlan) {
      pickResult = recordMinigameScore(code, id, 1, score);
    }

    if (!pickResult) {
      throw new Error("Expected minigame result");
    }
    expect(pickResult.ready).toBe(true);

    const spun = resolveMinigameSpin(code, created.playerId);
    expect(spun.leaderboard.length).toBe(3);
    expect(spun.outcome.winnerId).toBe(spun.leaderboard[0]?.id);

    const selected = selectGenre(code, spun.outcome.winnerId, "zombie");
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
    expect(recap.worldState.resources.food.amount).toBeGreaterThanOrEqual(0);
    expect(Object.keys(recap.playerProfiles).length).toBeGreaterThanOrEqual(3);
    expect(recap.narrativeThreads.length).toBeGreaterThanOrEqual(1);

    const restarted = restartSession(code);
    expect(restarted.phase).toBe("lobby");
    expect(restarted.history.length).toBe(0);
    expect(restarted.genre).toBeNull();
    expect(restarted.chaosLevel).toBe(0);
    expect(restarted.riftHistory.length).toBe(0);
    expect(restarted.latestNarration).toBeNull();
    expect(restarted.narrationLog.length).toBe(0);
    expect(restarted.worldState.meta.gamesPlayed).toBeGreaterThanOrEqual(1);
    expect(Object.keys(restarted.playerProfiles).length).toBeGreaterThanOrEqual(3);
  });

  it("blocks non-authoritative and duplicate minigame submissions", () => {
    const created = createRoom("Host");
    const code = created.code;
    const joinTwo = joinRoom(code, "Player2");
    const joinThree = joinRoom(code, "Player3");

    startGame(code, created.playerId);

    expect(() => recordMinigameScore(code, created.playerId, 2, 940)).toThrow(/server-controlled/i);

    recordMinigameScore(code, created.playerId, 1, 11);
    expect(() => recordMinigameScore(code, created.playerId, 1, 22)).toThrow(/already locked/i);

    recordMinigameScore(code, joinTwo.playerId, 1, 22);
    recordMinigameScore(code, joinThree.playerId, 1, 33);

    expect(() => resolveMinigameSpin(code, joinTwo.playerId)).toThrow(/only host/i);
  });
});
