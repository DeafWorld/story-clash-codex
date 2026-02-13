import { describe, expect, it } from "vitest";
import { applyNarrativeDirector } from "../src/lib/narrative-director";
import { createInitialPlayerProfile } from "../src/lib/evolution-engine";
import type { NarrativeThread, Scene } from "../src/types/game";

function baseScene(id: string, text: string, tensionLevel = 3): Scene {
  return {
    id,
    text,
    tensionLevel,
    choices: [
      { id: "a", label: "Push forward", nextId: "x" },
      { id: "b", label: "Fallback", nextId: "y" },
    ],
  };
}

describe("narrative director motion", () => {
  it("returns deterministic beat + cue structure for same input shape", () => {
    const actor = createInitialPlayerProfile("p1");
    actor.archetypes.primary = "The Renegade";

    const one = applyNarrativeDirector({
      roomCode: "ABCD",
      scene: baseScene("checkpoint", "A steel door trembles under pressure.", 4),
      chaosLevel: 67,
      tensionLevel: 4,
      historyLength: 5,
      actorProfile: actor,
      narrativeThreads: [],
      activeThreadId: null,
      directorTimeline: [],
    });

    const two = applyNarrativeDirector({
      roomCode: "ABCD",
      scene: baseScene("checkpoint", "A steel door trembles under pressure.", 4),
      chaosLevel: 67,
      tensionLevel: 4,
      historyLength: 5,
      actorProfile: actor,
      narrativeThreads: [],
      activeThreadId: null,
      directorTimeline: [],
    });

    expect(one.directedScene.beatType).toBe(two.directedScene.beatType);
    expect(one.directedScene.motionCue.effectProfile).toBe(two.directedScene.motionCue.effectProfile);
    expect(one.directorTimeline.length).toBe(1);
  });

  it("resolves mature threads into payoff events when pressure is high", () => {
    const actor = createInitialPlayerProfile("p1");
    actor.archetypes.primary = "The Hero";

    const matureThread: NarrativeThread = {
      id: "thread-rift-breach",
      type: "conflict",
      priority: 9,
      status: "active",
      seeds: [{ sceneId: "s1", detail: "seed", timestamp: Date.now() - 4000 }],
      developments: [
        { sceneId: "s2", detail: "dev-1", timestamp: Date.now() - 3000 },
        { sceneId: "s3", detail: "dev-2", timestamp: Date.now() - 2000 },
      ],
      payoff: null,
      clues: ["door anomaly"],
      playerAwareness: 70,
      metadata: {
        created: Date.now() - 5000,
        lastMention: Date.now() - 2000,
        scenesSinceMention: 3,
      },
    };

    const result = applyNarrativeDirector({
      roomCode: "WXYZ",
      scene: baseScene("payoff_gate", "The old breach shudders open again.", 5),
      chaosLevel: 84,
      tensionLevel: 5,
      historyLength: 7,
      actorProfile: actor,
      narrativeThreads: [matureThread],
      activeThreadId: matureThread.id,
      directorTimeline: [],
    });

    expect(result.directedScene.beatType).toBe("payoff");
    expect(result.timelineEvents.some((event) => event.type === "thread_resolved")).toBe(true);
    expect(result.narrativeThreads[0]?.status).toBe("resolved");
  });
});
