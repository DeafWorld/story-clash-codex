import { describe, expect, it } from "vitest";
import { applyEvolutionStep, createInitialPlayerProfile, createInitialWorldState } from "../src/lib/evolution-engine";
import type { Player } from "../src/types/game";

function basePlayers(): Player[] {
  return [
    { id: "p1", name: "Host", isHost: true, score: 0, orderIndex: 0, turnOrder: 0, rounds: [] },
    { id: "p2", name: "P2", isHost: false, score: 0, orderIndex: 1, turnOrder: 1, rounds: [] },
    { id: "p3", name: "P3", isHost: false, score: 0, orderIndex: 2, turnOrder: 2, rounds: [] },
  ];
}

describe("evolution engine", () => {
  it("updates player traits and world pressure after a risky choice", () => {
    const players = basePlayers();
    const result = applyEvolutionStep({
      roomCode: "ABCD",
      players,
      worldState: createInitialWorldState(),
      playerProfiles: {
        p1: createInitialPlayerProfile("p1"),
      },
      narrativeThreads: [],
      actorPlayerId: "p1",
      genre: "zombie",
      scene: {
        id: "start",
        text: "Sirens break across the compound walls.",
        choices: [
          { id: "a", label: "Charge the breach before it collapses", nextId: "next" },
          { id: "b", label: "Regroup and secure civilians", nextId: "next" },
        ],
      },
      choiceId: "a",
      choiceLabel: "Charge the breach before it collapses",
      choices: [
        { id: "a", label: "Charge the breach before it collapses", nextId: "next" },
        { id: "b", label: "Regroup and secure civilians", nextId: "next" },
      ],
      tensionLevel: 4,
      chaosLevel: 35,
      historyLength: 3,
    });

    expect(result.playerProfiles.p1?.traits.riskTaking ?? 0).toBeGreaterThan(50);
    expect(result.worldState.tensions.external_threat).toBeGreaterThan(0);
    expect(result.chaosLevel).toBeGreaterThanOrEqual(35);
  });

  it("creates crisis events and survival threads when resources collapse", () => {
    const world = createInitialWorldState();
    world.resources.food.amount = 8;

    const result = applyEvolutionStep({
      roomCode: "WXYZ",
      players: basePlayers(),
      worldState: world,
      playerProfiles: {
        p1: createInitialPlayerProfile("p1"),
        p2: createInitialPlayerProfile("p2"),
        p3: createInitialPlayerProfile("p3"),
      },
      narrativeThreads: [],
      actorPlayerId: "p2",
      genre: "haunted",
      scene: {
        id: "checkpoint",
        text: "The pantry doors buckle and the last crates split open.",
        choices: [{ id: "a", label: "Ration the last cans", nextId: "next" }],
      },
      choiceId: "a",
      choiceLabel: "Ration the last cans",
      choices: [{ id: "a", label: "Ration the last cans", nextId: "next" }],
      tensionLevel: 5,
      chaosLevel: 58,
      historyLength: 6,
    });

    expect(result.timelineEvents.some((event) => event.type === "resource_crisis")).toBe(true);
    expect(result.narrativeThreads.length).toBeGreaterThan(0);
    expect(result.activeThreadId).toBeTruthy();
  });
});
