import { describe, expect, it } from "vitest";
import { evaluateRiftEvent } from "../src/lib/rift";
import type { Choice, Scene } from "../src/types/game";

const TEST_SCENE: Scene = {
  id: "checkpoint",
  text: "The corridor lights flicker while distant footsteps close in.",
  tensionLevel: 4,
};

const TEST_CHOICES: Choice[] = [
  { id: "a", label: "Hold position", nextId: "hold" },
  { id: "b", label: "Run through the east wing", nextId: "east" },
  { id: "c", label: "Drop into maintenance shaft", nextId: "shaft" },
];

describe("evaluateRiftEvent", () => {
  it("is deterministic for the same context", () => {
    const first = evaluateRiftEvent({
      roomCode: "ABCD",
      step: 6,
      scene: TEST_SCENE,
      choices: TEST_CHOICES,
      selectedChoiceId: "b",
      selectedNextSceneId: "east",
      playerId: "p1",
      genrePower: { zombie: 61, alien: 24, haunted: 15 },
      chaosLevel: 74,
      voteSplitSeverity: 66,
      scenesSinceLastRift: 3,
      recentTensionDelta: 2,
    });

    const second = evaluateRiftEvent({
      roomCode: "ABCD",
      step: 6,
      scene: TEST_SCENE,
      choices: TEST_CHOICES,
      selectedChoiceId: "b",
      selectedNextSceneId: "east",
      playerId: "p1",
      genrePower: { zombie: 61, alien: 24, haunted: 15 },
      chaosLevel: 74,
      voteSplitSeverity: 66,
      scenesSinceLastRift: 3,
      recentTensionDelta: 2,
    });

    expect(first.decision.roll).toBe(second.decision.roll);
    expect(first.decision.probability).toBe(second.decision.probability);
    expect(first.event?.type ?? null).toBe(second.event?.type ?? null);
    expect(first.nextSceneId).toBe(second.nextSceneId);
  });

  it("raises trigger probability when chaos and imbalance rise", () => {
    const low = evaluateRiftEvent({
      roomCode: "ABCD",
      step: 3,
      scene: TEST_SCENE,
      choices: TEST_CHOICES,
      selectedChoiceId: "a",
      selectedNextSceneId: "hold",
      playerId: "p1",
      genrePower: { zombie: 35, alien: 33, haunted: 32 },
      chaosLevel: 22,
      voteSplitSeverity: 10,
      scenesSinceLastRift: 6,
      recentTensionDelta: 0,
    });

    const high = evaluateRiftEvent({
      roomCode: "ABCD",
      step: 3,
      scene: TEST_SCENE,
      choices: TEST_CHOICES,
      selectedChoiceId: "a",
      selectedNextSceneId: "hold",
      playerId: "p1",
      genrePower: { zombie: 72, alien: 19, haunted: 9 },
      chaosLevel: 83,
      voteSplitSeverity: 72,
      scenesSinceLastRift: 4,
      recentTensionDelta: 3,
    });

    expect(high.decision.probability).toBeGreaterThan(low.decision.probability);
  });

  it("does not hard-force an event at a fixed step", () => {
    const result = evaluateRiftEvent({
      roomCode: "CALM",
      step: 3,
      scene: TEST_SCENE,
      choices: TEST_CHOICES,
      selectedChoiceId: "a",
      selectedNextSceneId: "hold",
      playerId: "p1",
      genrePower: { zombie: 36, alien: 34, haunted: 30 },
      chaosLevel: 18,
      voteSplitSeverity: 5,
      scenesSinceLastRift: 8,
      recentTensionDelta: -1,
    });

    expect(result.decision.triggered).toBe(false);
    expect(result.event).toBeNull();
  });
});
