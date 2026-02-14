import { describe, expect, it } from "vitest";
import { evaluateRiftEvent } from "../src/rift";
import type { Choice, Scene } from "../src/types";

const SCENE: Scene = {
  id: "storm_gate",
  text: "Sirens fail, the metal gate shudders, and static cuts every command.",
  tensionLevel: 5,
};

const CHOICES: Choice[] = [
  { id: "a", label: "Seal blast doors", nextId: "seal" },
  { id: "b", label: "Rush the corridor", nextId: "rush" },
  { id: "c", label: "Drop power grid", nextId: "power" },
];

describe("cloudflare room rift evaluation", () => {
  it("creates deterministic event decisions", () => {
    const one = evaluateRiftEvent({
      roomCode: "WXYZ",
      step: 5,
      scene: SCENE,
      choices: CHOICES,
      selectedChoiceId: "b",
      selectedNextSceneId: "rush",
      playerId: "player-1",
      genrePower: { zombie: 64, alien: 20, haunted: 16 },
      chaosLevel: 77,
      voteSplitSeverity: 58,
      scenesSinceLastRift: 3,
      recentTensionDelta: 2,
    });

    const two = evaluateRiftEvent({
      roomCode: "WXYZ",
      step: 5,
      scene: SCENE,
      choices: CHOICES,
      selectedChoiceId: "b",
      selectedNextSceneId: "rush",
      playerId: "player-1",
      genrePower: { zombie: 64, alien: 20, haunted: 16 },
      chaosLevel: 77,
      voteSplitSeverity: 58,
      scenesSinceLastRift: 3,
      recentTensionDelta: 2,
    });

    expect(one.decision.probability).toBe(two.decision.probability);
    expect(one.decision.roll).toBe(two.decision.roll);
    expect(one.event?.type ?? null).toBe(two.event?.type ?? null);
  });

  it("returns no event for low-pressure contexts", () => {
    const result = evaluateRiftEvent({
      roomCode: "WXYZ",
      step: 2,
      scene: SCENE,
      choices: CHOICES,
      selectedChoiceId: "a",
      selectedNextSceneId: "seal",
      playerId: "player-1",
      genrePower: { zombie: 35, alien: 33, haunted: 32 },
      chaosLevel: 16,
      voteSplitSeverity: 8,
      scenesSinceLastRift: 8,
      recentTensionDelta: -1,
    });

    expect(result.event).toBeNull();
    expect(result.decision.triggered).toBe(false);
  });
});
