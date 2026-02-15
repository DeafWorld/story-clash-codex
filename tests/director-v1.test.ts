import { describe, expect, it } from "vitest";
import {
  applySplitVoteImpact,
  resolveRealityRemembers,
  resolveSplitVoteConsequence,
  scheduleDirectorCallbacks,
  syncArchetypeProgress,
} from "../src/lib/director-v1";
import { createInitialPlayerProfile, createInitialWorldState } from "../src/lib/evolution-engine";
import type { Player } from "../src/types/game";

describe("director v1", () => {
  it("tracks hidden archetype progression shifts per player", () => {
    const players: Player[] = [
      { id: "p1", name: "Host", isHost: true, score: 0, orderIndex: 0 },
      { id: "p2", name: "P2", isHost: false, score: 0, orderIndex: 1 },
    ];
    const profiles = {
      p1: createInitialPlayerProfile("p1"),
      p2: createInitialPlayerProfile("p2"),
    };

    const first = syncArchetypeProgress({
      players,
      playerProfiles: profiles,
      current: {},
      step: 1,
    });
    expect(first.p1.currentArchetype).toBe("The Pragmatist");
    expect(first.p1.shiftCount).toBe(0);

    profiles.p1.archetypes.primary = "The Renegade";
    const second = syncArchetypeProgress({
      players,
      playerProfiles: profiles,
      current: first,
      step: 2,
    });
    expect(second.p1.currentArchetype).toBe("The Renegade");
    expect(second.p1.shiftCount).toBe(1);
    expect(second.p1.lastShiftStep).toBe(2);
  });

  it("resolves split-vote consequences and applies fractured impact", () => {
    const worldState = createInitialWorldState();
    const none = resolveSplitVoteConsequence({
      roomCode: "ABCD",
      step: 1,
      sceneId: "start",
      sourcePlayerId: "p1",
      sourcePlayerName: "Host",
      choiceLabel: "Wait for backup",
      availableChoices: 2,
      voteSplitSeverity: 10,
      chaosLevel: 20,
      worldState,
    });
    expect(none).toBeNull();

    const consequence = resolveSplitVoteConsequence({
      roomCode: "ABCD",
      step: 2,
      sceneId: "start",
      sourcePlayerId: "p1",
      sourcePlayerName: "Host",
      choiceLabel: "Kick open the vault",
      availableChoices: 2,
      voteSplitSeverity: 82,
      chaosLevel: 68,
      worldState,
    });
    expect(consequence).toBeTruthy();
    if (!consequence) {
      throw new Error("Expected split consequence");
    }

    const impact = applySplitVoteImpact({
      consequence,
      genrePower: { zombie: 40, alien: 34, haunted: 26 },
      sceneId: "start",
    });
    expect(Object.keys(impact.genreShift).length).toBeGreaterThanOrEqual(2);
    expect(impact.chaosBonus).toBeGreaterThanOrEqual(4);
    expect(impact.worldEvent.type).toBe("fractured_outcome");
  });

  it("queues callbacks and emits a memory line even when AI path fails", () => {
    const originalAiEnabled = process.env.NARRATIVE_AI_ENABLED;
    try {
      process.env.NARRATIVE_AI_ENABLED = "1";
      globalThis.__STORY_CLASH_DIRECTOR_AI__ = () => {
        throw new Error("boom");
      };

      const historyEntry = {
        sceneId: "start",
        sceneText: "You hear the breach alarms.",
        playerId: "p1",
        player: "Host",
        playerName: "Host",
        choice: "Break the quarantine",
        choiceLabel: "Break the quarantine",
        isFreeChoice: false,
        nextNodeId: "scene_2",
        tensionLevel: 3,
        timestamp: Date.now(),
      };

      const queue = scheduleDirectorCallbacks({
        roomCode: "ABCD",
        step: 2,
        queue: [],
        historyEntry,
        latestWorldEvent: null,
        splitVoteConsequence: null,
      });
      expect(queue.length).toBeGreaterThan(0);

      const dueStep = queue[0]?.dueStep ?? 4;
      const result = resolveRealityRemembers({
        roomCode: "ABCD",
        step: dueStep,
        currentPlayerId: "p1",
        players: [{ id: "p1", name: "Host", isHost: true, score: 0, orderIndex: 0 }],
        playerProfiles: { p1: createInitialPlayerProfile("p1") },
        queue,
        history: [historyEntry],
        worldState: createInitialWorldState(),
        splitVoteConsequence: null,
      });
      expect(result.line.length).toBeGreaterThan(8);
      expect(result.queue.length).toBe(queue.length - 1);
    } finally {
      globalThis.__STORY_CLASH_DIRECTOR_AI__ = undefined;
      if (originalAiEnabled === undefined) {
        delete process.env.NARRATIVE_AI_ENABLED;
      } else {
        process.env.NARRATIVE_AI_ENABLED = originalAiEnabled;
      }
    }
  });
});
