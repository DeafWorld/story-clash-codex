import type {
  Choice,
  EndingType,
  GenreId,
  NarrativeThread,
  NarrativeThreadType,
  Player,
  PlayerArchetype,
  PlayerProfile,
  Scene,
  WorldEventSeverity,
  WorldState,
  WorldTimelineEvent,
} from "../types/game";

const MAX_TIMELINE = 60;
const MAX_THREADS = 30;
const MAX_ARCHETYPE_EVOLUTION = 24;
const MAX_TRAUMA = 12;
const MAX_HEROIC = 12;
const LEARNING_RATE = 0.06;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function updateTowards(current: number, target: number): number {
  return clamp(current + (target - current) * LEARNING_RATE, 0, 100);
}

function toArchetypeLabel(archetype: PlayerArchetype): PlayerArchetype {
  return archetype;
}

function deriveArchetype(profile: PlayerProfile): PlayerArchetype {
  const { riskTaking, cooperation, morality, leadership } = profile.traits;
  if (leadership > 70 && morality > 60) {
    return "The Hero";
  }
  if (riskTaking > 70 && cooperation < 40) {
    return "The Renegade";
  }
  if (morality > 70 && cooperation > 70) {
    return "The Peacekeeper";
  }
  if (riskTaking < 30 && morality > 60) {
    return "The Survivor";
  }
  if (cooperation < 40 && morality < 40) {
    return "The Opportunist";
  }
  if (leadership < 40 && cooperation > 60) {
    return "The Supporter";
  }
  return "The Pragmatist";
}

function analyzeChoice(scene: Scene, choiceLabel: string, timeout = false) {
  const source = `${scene.text} ${choiceLabel}`.toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some((keyword) => source.includes(keyword));
  const isRisky = timeout || hasAny(["fight", "charge", "rush", "sprint", "breach", "blast", "override", "decoy"]);
  const isCooperative = hasAny(["help", "protect", "rescue", "cover", "share", "together", "crew", "evacuate"]);
  const isMoral = hasAny(["save", "spare", "mercy", "civilian", "child", "truth", "honor"]);
  const isInvestigative = hasAny(["signal", "whisper", "secret", "lab", "research", "vault", "relay", "anomaly"]);
  const isEmotional = timeout || hasAny(["pray", "panic", "memory", "scream", "grief", "promise"]);
  return {
    isRisky,
    isCooperative,
    isMoral,
    isInvestigative,
    isEmotional,
  };
}

function updateMostCommonEnding(current: EndingType | null, endingType: EndingType): EndingType {
  if (!current) {
    return endingType;
  }
  if (current === endingType) {
    return current;
  }
  return endingType;
}

function ensureThread(
  threads: NarrativeThread[],
  input: {
    id: string;
    type: NarrativeThreadType;
    priority: number;
    seedSceneId: string;
    detail: string;
    clue?: string;
    nowTs: number;
  }
): NarrativeThread {
  const existing = threads.find((thread) => thread.id === input.id);
  if (existing) {
    existing.status = "active";
    existing.developments.push({
      sceneId: input.seedSceneId,
      detail: input.detail,
      timestamp: input.nowTs,
    });
    if (input.clue) {
      existing.clues.push(input.clue);
    }
    existing.playerAwareness = clamp(existing.playerAwareness + 8, 0, 100);
    existing.metadata.lastMention = input.nowTs;
    existing.metadata.scenesSinceMention = 0;
    return existing;
  }

  const created: NarrativeThread = {
    id: input.id,
    type: input.type,
    priority: clamp(Math.round(input.priority), 1, 10),
    status: "active",
    seeds: [
      {
        sceneId: input.seedSceneId,
        detail: input.detail,
        timestamp: input.nowTs,
      },
    ],
    developments: [],
    payoff: null,
    clues: input.clue ? [input.clue] : [],
    playerAwareness: 20,
    metadata: {
      created: input.nowTs,
      lastMention: input.nowTs,
      scenesSinceMention: 0,
    },
  };
  threads.push(created);
  return created;
}

function eventSeverity(amount: number, crisisPoint: number): WorldEventSeverity {
  if (amount <= crisisPoint * 0.5) {
    return "critical";
  }
  if (amount <= crisisPoint) {
    return "high";
  }
  if (amount <= crisisPoint + 8) {
    return "medium";
  }
  return "low";
}

function appendTimeline(world: WorldState, events: WorldTimelineEvent[]) {
  if (!events.length) {
    return;
  }
  world.timeline = [...world.timeline, ...events].slice(-MAX_TIMELINE);
}

function applyWorldTick(world: WorldState) {
  Object.values(world.resources).forEach((resource) => {
    if (resource.trend === "declining") {
      resource.amount = clamp(resource.amount - 1, 0, 100);
    } else if (resource.trend === "critical") {
      resource.amount = clamp(resource.amount - 2, 0, 100);
    }
  });

  const foodLevel = world.resources.food.amount;
  if (foodLevel < 30) {
    world.tensions.food_shortage = clamp(world.tensions.food_shortage + 3, 0, 100);
  } else {
    world.tensions.food_shortage = clamp(world.tensions.food_shortage - 2, 0, 100);
  }
}

function applyChoiceToWorld(input: {
  world: WorldState;
  analysis: ReturnType<typeof analyzeChoice>;
  genre: GenreId | null;
  tensionLevel: number;
  timeout?: boolean;
}) {
  const { world, analysis, timeout } = input;

  const resourceDelta = {
    food: analysis.isCooperative ? -1 : -2,
    medicine: analysis.isMoral ? -1 : 0,
    ammunition: analysis.isRisky ? -2 : -1,
    fuel: analysis.isRisky ? -2 : -1,
  } as const;

  world.resources.food.amount = clamp(world.resources.food.amount + resourceDelta.food, 0, 100);
  world.resources.medicine.amount = clamp(world.resources.medicine.amount + resourceDelta.medicine, 0, 100);
  world.resources.ammunition.amount = clamp(world.resources.ammunition.amount + resourceDelta.ammunition, 0, 100);
  world.resources.fuel.amount = clamp(world.resources.fuel.amount + resourceDelta.fuel, 0, 100);

  if (analysis.isCooperative) {
    world.factions.survivors.loyalty = clamp(world.factions.survivors.loyalty + 4, 0, 100);
    world.factions.military.relationships.survivors = clamp(
      (world.factions.military.relationships.survivors ?? 0) + 3,
      -100,
      100
    );
    world.tensions.faction_conflict = clamp(world.tensions.faction_conflict - 5, 0, 100);
    world.tensions.morale_crisis = clamp(world.tensions.morale_crisis - 3, 0, 100);
  } else {
    world.factions.survivors.loyalty = clamp(world.factions.survivors.loyalty - 2, 0, 100);
    world.tensions.faction_conflict = clamp(world.tensions.faction_conflict + 4, 0, 100);
  }

  if (analysis.isMoral) {
    world.factions.scientists.loyalty = clamp(world.factions.scientists.loyalty + 3, 0, 100);
    world.factions.survivors.relationships.scientists = clamp(
      (world.factions.survivors.relationships.scientists ?? 0) + 2,
      -100,
      100
    );
  } else {
    world.tensions.morale_crisis = clamp(world.tensions.morale_crisis + 3, 0, 100);
  }

  if (analysis.isRisky) {
    world.tensions.external_threat = clamp(world.tensions.external_threat + 7, 0, 100);
  } else {
    world.tensions.external_threat = clamp(world.tensions.external_threat + 2, 0, 100);
  }

  if (analysis.isEmotional) {
    world.tensions.disease_outbreak = clamp(world.tensions.disease_outbreak + 2, 0, 100);
  }

  if (timeout) {
    world.tensions.morale_crisis = clamp(world.tensions.morale_crisis + 8, 0, 100);
  }

  const tensionBump = clamp(input.tensionLevel, 1, 5) * 2;
  world.tensions.external_threat = clamp(world.tensions.external_threat + tensionBump, 0, 100);

  Object.values(world.resources).forEach((resource) => {
    if (resource.amount <= resource.crisisPoint) {
      resource.trend = "critical";
    } else if (resource.amount <= resource.crisisPoint + 10) {
      resource.trend = "declining";
    } else {
      resource.trend = "stable";
    }
  });
}

function createCrisisEvents(input: { roomCode: string; step: number; world: WorldState; nowTs: number }): WorldTimelineEvent[] {
  const events: WorldTimelineEvent[] = [];
  for (const [resourceId, resource] of Object.entries(input.world.resources)) {
    if (resource.amount > resource.crisisPoint) {
      continue;
    }
    const scarId = `crisis_${resourceId}`;
    if (input.world.scars.includes(scarId)) {
      continue;
    }
    input.world.scars.push(scarId);
    events.push({
      id: `evt-${input.roomCode}-${input.step}-${resourceId}-crisis`,
      type: "resource_crisis",
      title: `${resourceId} crisis`,
      detail: `${resourceId.toUpperCase()} dropped to ${resource.amount}. Crew stability is collapsing.`,
      severity: eventSeverity(resource.amount, resource.crisisPoint),
      createdAt: input.nowTs,
    });
  }
  return events;
}

function createFactionConflictEvent(input: {
  roomCode: string;
  step: number;
  world: WorldState;
  nowTs: number;
}): WorldTimelineEvent | null {
  const relationships: Array<{ a: string; b: string; value: number }> = [];
  for (const [factionName, faction] of Object.entries(input.world.factions)) {
    for (const [other, value] of Object.entries(faction.relationships)) {
      relationships.push({ a: factionName, b: other, value });
    }
  }
  relationships.sort((left, right) => left.value - right.value);
  const worst = relationships[0];
  if (!worst || worst.value > -40) {
    return null;
  }
  const seed = `${input.roomCode}:${input.step}:faction:${worst.a}:${worst.b}`;
  if (stableHash(seed) % 100 >= 35) {
    return null;
  }

  return {
    id: `evt-${input.roomCode}-${input.step}-faction-${worst.a}-${worst.b}`,
    type: "faction_conflict",
    title: "Faction conflict",
    detail: `${worst.a} and ${worst.b} escalate toward open conflict.`,
    severity: worst.value <= -70 ? "critical" : "high",
    createdAt: input.nowTs,
  };
}

function createTensionOverflowEvent(input: {
  roomCode: string;
  step: number;
  world: WorldState;
  nowTs: number;
}): WorldTimelineEvent | null {
  const tensions = Object.entries(input.world.tensions).sort((left, right) => right[1] - left[1]);
  const strongest = tensions[0];
  if (!strongest || strongest[1] < 85) {
    return null;
  }
  const [key] = strongest;
  return {
    id: `evt-${input.roomCode}-${input.step}-overflow-${key}`,
    type: "tension_overflow",
    title: "Timeline fracture",
    detail: `Rift pressure overflowed on ${key.replaceAll("_", " ")} and destabilized reality.`,
    severity: "critical",
    createdAt: input.nowTs,
  };
}

function updateProfileFromChoice(input: {
  profile: PlayerProfile;
  genre: GenreId | null;
  choiceId: string;
  choiceLabel: string;
  sceneId: string;
  sceneText: string;
  choices: Choice[];
  decisionMs?: number;
  analysis: ReturnType<typeof analyzeChoice>;
  endingType?: EndingType | null;
}) {
  const { profile, analysis } = input;
  profile.traits.riskTaking = updateTowards(profile.traits.riskTaking, analysis.isRisky ? 92 : 28);
  profile.traits.cooperation = updateTowards(profile.traits.cooperation, analysis.isCooperative ? 88 : 30);
  profile.traits.morality = updateTowards(profile.traits.morality, analysis.isMoral ? 86 : 35);
  profile.traits.leadership = updateTowards(profile.traits.leadership, input.choiceId === "a" ? 78 : 44);
  profile.traits.curiosity = updateTowards(profile.traits.curiosity, analysis.isInvestigative ? 90 : 42);
  profile.traits.emotional = updateTowards(profile.traits.emotional, analysis.isEmotional ? 84 : 38);

  profile.patterns.totalChoices += 1;
  profile.patterns.averageDecisionTime =
    profile.patterns.totalChoices <= 1
      ? input.decisionMs ?? 9000
      : Math.round(
          (profile.patterns.averageDecisionTime * (profile.patterns.totalChoices - 1) + (input.decisionMs ?? 9000)) /
            profile.patterns.totalChoices
        );

  if (input.choiceId !== "a") {
    profile.patterns.controversialChoices += 1;
  }

  if (input.genre) {
    profile.history.favoriteStories.push(input.genre);
    const tally = profile.history.favoriteStories.reduce<Record<GenreId, number>>(
      (acc, genre) => {
        acc[genre] = (acc[genre] ?? 0) + 1;
        return acc;
      },
      { zombie: 0, alien: 0, haunted: 0 }
    );
    const sorted = (Object.entries(tally) as Array<[GenreId, number]>).sort((left, right) => right[1] - left[1]);
    profile.patterns.favorsGenre = sorted[0]?.[0] ?? null;
    profile.patterns.avoidGenre = sorted[sorted.length - 1]?.[0] ?? null;
  }

  if (analysis.isMoral && analysis.isRisky) {
    profile.history.heroicMoments = [...profile.history.heroicMoments, input.sceneId].slice(-MAX_HEROIC);
  }
  if (!analysis.isMoral || input.choiceLabel.toLowerCase().includes("sacrifice")) {
    profile.history.traumaticMoments = [...profile.history.traumaticMoments, input.sceneId].slice(-MAX_TRAUMA);
  }
  if (input.choiceLabel.toLowerCase().includes("betray")) {
    profile.history.betrayals += 1;
  }

  if (input.endingType) {
    profile.history.endings = [...profile.history.endings, input.endingType].slice(-20);
    profile.history.sessionsPlayed += 1;
  }

  const nextArchetype = deriveArchetype(profile);
  if (nextArchetype !== profile.archetypes.primary) {
    profile.archetypes.primary = toArchetypeLabel(nextArchetype);
    profile.archetypes.evolution = [
      ...profile.archetypes.evolution,
      {
        archetype: toArchetypeLabel(nextArchetype),
        timestamp: Date.now(),
        traits: deepClone(profile.traits),
      },
    ].slice(-MAX_ARCHETYPE_EVOLUTION);
  }

  const alternatives = input.choices.map((choice) => choice.id).filter((choiceId) => choiceId !== input.choiceId);
  profile.predictions = {
    nextChoice: input.choices[0]?.id ?? null,
    confidence: clamp(
      Math.round((profile.traits.riskTaking + profile.traits.cooperation + profile.traits.morality) / 3),
      35,
      95
    ),
    alternatives: alternatives.slice(0, 2),
  };
}

export function createInitialWorldState(): WorldState {
  return {
    factions: {
      survivors: {
        loyalty: 50,
        power: 30,
        leader: null,
        traits: ["desperate", "paranoid"],
        relationships: {
          scientists: -20,
          military: 15,
        },
      },
      scientists: {
        loyalty: 70,
        power: 40,
        leader: "Dr. Chen",
        traits: ["rational", "secretive"],
        relationships: {
          survivors: -20,
          military: 30,
        },
      },
      military: {
        loyalty: 80,
        power: 60,
        leader: "Commander Shaw",
        traits: ["authoritarian", "pragmatic"],
        relationships: {
          survivors: 15,
          scientists: 30,
        },
      },
    },
    resources: {
      food: { amount: 45, trend: "declining", crisisPoint: 20 },
      medicine: { amount: 30, trend: "stable", crisisPoint: 15 },
      ammunition: { amount: 60, trend: "declining", crisisPoint: 25 },
      fuel: { amount: 20, trend: "critical", crisisPoint: 10 },
    },
    scars: [],
    tensions: {
      food_shortage: 0,
      faction_conflict: 0,
      external_threat: 0,
      morale_crisis: 0,
      disease_outbreak: 0,
    },
    timeline: [],
    meta: {
      gamesPlayed: 0,
      mostCommonEnding: null,
      rarePath: false,
      communityChoiceInfluence: 0,
    },
  };
}

export function createInitialPlayerProfile(playerId: string): PlayerProfile {
  const traits = {
    riskTaking: 50,
    cooperation: 50,
    morality: 50,
    leadership: 50,
    curiosity: 50,
    emotional: 50,
  };
  return {
    id: playerId,
    traits,
    archetypes: {
      primary: "The Pragmatist",
      secondary: null,
      evolution: [
        {
          archetype: "The Pragmatist",
          timestamp: Date.now(),
          traits: deepClone(traits),
        },
      ],
    },
    patterns: {
      favorsGenre: null,
      avoidGenre: null,
      averageDecisionTime: 0,
      changesVote: 0,
      controversialChoices: 0,
      totalChoices: 0,
    },
    history: {
      sessionsPlayed: 0,
      endings: [],
      favoriteStories: [],
      traumaticMoments: [],
      heroicMoments: [],
      betrayals: 0,
    },
    predictions: {
      nextChoice: null,
      confidence: 0,
      alternatives: [],
    },
  };
}

export function ensurePlayerProfiles(players: Player[], current: Record<string, PlayerProfile> = {}): Record<string, PlayerProfile> {
  const next = deepClone(current);
  players.forEach((player) => {
    if (!next[player.id]) {
      next[player.id] = createInitialPlayerProfile(player.id);
    }
  });
  Object.keys(next).forEach((playerId) => {
    if (!players.some((player) => player.id === playerId)) {
      delete next[playerId];
    }
  });
  return next;
}

export type EvolutionInput = {
  roomCode: string;
  players: Player[];
  worldState: WorldState;
  playerProfiles: Record<string, PlayerProfile>;
  narrativeThreads: NarrativeThread[];
  actorPlayerId: string;
  genre: GenreId | null;
  scene: Scene;
  choiceId: string;
  choiceLabel: string;
  choices: Choice[];
  tensionLevel: number;
  chaosLevel: number;
  timeout?: boolean;
  historyLength: number;
  endingType?: EndingType | null;
  decisionMs?: number;
};

export type EvolutionResult = {
  worldState: WorldState;
  playerProfiles: Record<string, PlayerProfile>;
  narrativeThreads: NarrativeThread[];
  activeThreadId: string | null;
  chaosLevel: number;
  timelineEvents: WorldTimelineEvent[];
};

export function applyEvolutionStep(input: EvolutionInput): EvolutionResult {
  const nowTs = Date.now();
  const world = deepClone(input.worldState);
  const profiles = ensurePlayerProfiles(input.players, input.playerProfiles);
  const threads = deepClone(input.narrativeThreads);

  applyWorldTick(world);

  const analysis = analyzeChoice(input.scene, input.choiceLabel, input.timeout);
  applyChoiceToWorld({
    world,
    analysis,
    genre: input.genre,
    tensionLevel: input.tensionLevel,
    timeout: input.timeout,
  });

  const events = createCrisisEvents({
    roomCode: input.roomCode,
    step: input.historyLength,
    world,
    nowTs,
  });
  const conflict = createFactionConflictEvent({
    roomCode: input.roomCode,
    step: input.historyLength,
    world,
    nowTs,
  });
  if (conflict) {
    events.push(conflict);
  }
  const overflow = createTensionOverflowEvent({
    roomCode: input.roomCode,
    step: input.historyLength,
    world,
    nowTs,
  });
  if (overflow) {
    events.push(overflow);
  }

  appendTimeline(world, events);

  const actorProfile = profiles[input.actorPlayerId] ?? createInitialPlayerProfile(input.actorPlayerId);
  profiles[input.actorPlayerId] = actorProfile;
  updateProfileFromChoice({
    profile: actorProfile,
    genre: input.genre,
    choiceId: input.choiceId,
    choiceLabel: input.choiceLabel,
    sceneId: input.scene.id,
    sceneText: input.scene.text,
    choices: input.choices,
    decisionMs: input.decisionMs,
    analysis,
    endingType: input.endingType,
  });

  threads.forEach((thread) => {
    thread.metadata.scenesSinceMention += 1;
  });

  if (analysis.isInvestigative) {
    ensureThread(threads, {
      id: `thread-mystery-${input.scene.id}`,
      type: "mystery",
      priority: 8,
      seedSceneId: input.scene.id,
      detail: "A hidden layer of the Rift was uncovered.",
      clue: input.choiceLabel,
      nowTs,
    });
  }
  if (analysis.isCooperative) {
    ensureThread(threads, {
      id: "thread-alliance-balance",
      type: "relationship",
      priority: 6,
      seedSceneId: input.scene.id,
      detail: "Crew alliances shifted under pressure.",
      clue: "Trust was negotiated in real time.",
      nowTs,
    });
  }

  events.forEach((event) => {
    if (event.type === "resource_crisis") {
      ensureThread(threads, {
        id: `thread-${event.id}`,
        type: "survival",
        priority: 9,
        seedSceneId: input.scene.id,
        detail: event.detail,
        clue: event.title,
        nowTs,
      });
    }
    if (event.type === "faction_conflict") {
      ensureThread(threads, {
        id: "thread-faction-war",
        type: "conflict",
        priority: 9,
        seedSceneId: input.scene.id,
        detail: event.detail,
        clue: "Rift diplomacy is failing.",
        nowTs,
      });
    }
    if (event.type === "tension_overflow") {
      ensureThread(threads, {
        id: "thread-timeline-fracture",
        type: "quest",
        priority: 10,
        seedSceneId: input.scene.id,
        detail: event.detail,
        clue: "Reality is no longer stable.",
        nowTs,
      });
    }
  });

  const activeCandidates = threads
    .filter((thread) => thread.status === "active")
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.metadata.scenesSinceMention - left.metadata.scenesSinceMention;
    });
  const activeThread = activeCandidates[0] ?? null;
  if (activeThread) {
    activeThread.metadata.scenesSinceMention = 0;
    activeThread.metadata.lastMention = nowTs;
  }

  if (input.endingType) {
    world.meta.gamesPlayed += 1;
    world.meta.mostCommonEnding = updateMostCommonEnding(world.meta.mostCommonEnding, input.endingType);
    world.meta.rarePath =
      input.chaosLevel >= 70 || events.some((event) => event.type === "tension_overflow");
  }

  const pressure =
    world.tensions.external_threat +
    world.tensions.faction_conflict +
    world.tensions.food_shortage +
    world.tensions.morale_crisis;
  const evolvedChaos = clamp(Math.round(input.chaosLevel * 0.7 + pressure * 0.08 + events.length * 3), 0, 100);

  return {
    worldState: world,
    playerProfiles: profiles,
    narrativeThreads: threads.slice(-MAX_THREADS),
    activeThreadId: activeThread?.id ?? null,
    chaosLevel: evolvedChaos,
    timelineEvents: events,
  };
}
