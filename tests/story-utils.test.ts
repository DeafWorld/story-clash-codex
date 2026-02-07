import { describe, expect, it } from "vitest";
import zombieSource from "../src/data/stories/zombie.json";
import {
  getNeutralNextNodeId,
  getNextNodeIdFromChoice,
  getNextNodeIdFromFreeChoice,
  getNodeById,
  getStoryStartNode,
  normalizeSceneNode,
} from "../src/lib/story-utils";
import type { StoryTree } from "../src/types/game";

const zombie = zombieSource as StoryTree;

describe("story-utils", () => {
  it("returns the start scene", () => {
    const start = getStoryStartNode(zombie);
    expect(start.id).toBe("start");
    expect(start.choices.length).toBeGreaterThan(0);
  });

  it("resolves explicit choice by id", () => {
    const start = getStoryStartNode(zombie);
    const nextId = getNextNodeIdFromChoice(start, "a");
    expect(nextId).toBe("armed");
  });

  it("maps free choice text using scene keywords", () => {
    const start = getStoryStartNode(zombie);
    const nextFight = getNextNodeIdFromFreeChoice(start, "grab a weapon and fight");
    const nextEscape = getNextNodeIdFromFreeChoice(start, "run to the exit now");

    expect(nextFight).toBe("armed");
    expect(nextEscape).toBe("exit_attempt");
  });

  it("falls back to neutral branch when no free-choice mapping exists", () => {
    const middleScene = normalizeSceneNode({
      id: "mid",
      text: "mid",
      choices: [
        { id: "a", text: "left", next: "left" },
        { id: "b", text: "right", next: "right" },
      ],
    });

    expect(getNeutralNextNodeId(middleScene)).toBe("right");
    expect(getNextNodeIdFromFreeChoice(middleScene, "anything")).toBe("right");
  });

  it("returns null for unknown node ids", () => {
    expect(getNodeById(zombie, "missing-node")).toBeNull();
  });
});
