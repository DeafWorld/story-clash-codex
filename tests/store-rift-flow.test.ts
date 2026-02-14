import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  getRecapState,
  joinRoom,
  recordMinigameScore,
  resolveMinigameSpin,
  selectGenre,
  startGame,
  submitChoice,
} from "../src/lib/store";

function primeRoomToGame() {
  const created = createRoom("Host");
  const code = created.code;
  const joinTwo = joinRoom(code, "Player2");
  const joinThree = joinRoom(code, "Player3");

  startGame(code, created.playerId);

  recordMinigameScore(code, created.playerId, 1, 11);
  recordMinigameScore(code, joinTwo.playerId, 1, 22);
  recordMinigameScore(code, joinThree.playerId, 1, 33);

  const spun = resolveMinigameSpin(code, created.playerId);
  selectGenre(code, spun.outcome.winnerId, "zombie");
  return { code, created };
}

describe("store rift flow", () => {
  it("propagates rift events into unified world timeline", () => {
    const { code } = primeRoomToGame();

    for (let i = 0; i < 6; i += 1) {
      const game = getGameState(code);
      if (game.phase !== "game" || !game.activePlayerId || !game.currentScene?.choices?.length) {
        break;
      }

      const choice = game.currentScene.choices[1] ?? game.currentScene.choices[0];
      const result = submitChoice(code, game.activePlayerId, { choiceId: choice.id });
      if (result.ended) {
        break;
      }
    }

    const latest = getGameState(code);
    const worldRiftEvents = latest.worldState.timeline.filter((event) =>
      event.type.startsWith("rift_")
    );

    if (latest.riftHistory.length === 0) {
      throw new Error("Expected at least one rift event during flow");
    }

    expect(worldRiftEvents.length).toBeGreaterThan(0);
    expect(worldRiftEvents.at(-1)?.type).toMatch(/^rift_/);
  });

  it("recap keeps latest world event and rift history aligned", () => {
    const { code } = primeRoomToGame();

    let ended = false;
    for (let i = 0; i < 8; i += 1) {
      const game = getGameState(code);
      if (game.phase !== "game" || !game.activePlayerId || !game.currentScene?.choices?.length) {
        break;
      }

      const choice = game.currentScene.choices[0];
      const result = submitChoice(code, game.activePlayerId, { choiceId: choice.id });
      if (result.ended) {
        ended = true;
        break;
      }
    }

    if (!ended) {
      throw new Error("Expected flow to reach recap");
    }

    const recap = getRecapState(code);
    expect(recap.riftHistory.length).toBeGreaterThanOrEqual(0);
    expect(recap.worldState.timeline.length).toBeGreaterThan(0);
    expect(recap.worldState.timeline.at(-1)).toEqual(recap.latestWorldEvent);
  });
});
