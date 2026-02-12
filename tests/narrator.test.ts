import { describe, expect, it } from "vitest";
import { deriveNarrationTone, generateNarrationLine } from "../src/lib/narrator";

describe("narrator", () => {
  it("returns deterministic output for identical context", () => {
    const context = {
      code: "ABCD",
      trigger: "choice_submitted" as const,
      genre: "zombie" as const,
      sceneId: "stairwell",
      historyLength: 4,
      tensionLevel: 4,
      playerId: "p1",
      playerName: "Host",
      choiceLabel: "Fight through",
      endingType: null,
    };

    const first = generateNarrationLine(context);
    const second = generateNarrationLine(context);

    expect(first.text).toBe(second.text);
    expect(first.tone).toBe(second.tone);
  });

  it("derives tone from tension and ending", () => {
    expect(
      deriveNarrationTone({
        genre: "zombie",
        tensionLevel: 5,
        trigger: "scene_enter",
      })
    ).toBe("desperate");

    expect(
      deriveNarrationTone({
        genre: "haunted",
        tensionLevel: 2,
        trigger: "ending",
        endingType: "triumph",
      })
    ).toBe("hopeful");
  });

  it("sanitizes unsafe free-choice text and enforces max length", () => {
    const line = generateNarrationLine({
      code: "ABCD",
      trigger: "choice_submitted",
      genre: "zombie",
      sceneId: "start",
      historyLength: 2,
      tensionLevel: 4,
      playerId: "p1",
      playerName: "Host",
      freeText: "fuck this corridor and jump/jump/jump with way too much text repeated repeatedly repeatedly",
      endingType: null,
    });

    expect(line.text.length).toBeLessThanOrEqual(140);
    expect(line.text.toLowerCase()).not.toContain("fuck");
  });
});
