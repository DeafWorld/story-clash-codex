import type {
  ArchetypeProgressState,
  DeferredDirectorCallback,
  GenreId,
  GenrePower,
  Player,
  PlayerArchetype,
  PlayerProfile,
  SplitVoteConsequence,
  WorldEvent,
  WorldEventSeverity,
  WorldState,
} from "../types/game";

const MAX_CALLBACKS = 28;
const MAX_MEMORY_LINE_LENGTH = 160;

type HistoryLikeEntry = {
  sceneId: string;
  playerId: string;
  player?: string;
  playerName?: string;
  choice?: string;
  choiceLabel?: string;
};

type DirectorLineContext = {
  roomCode: string;
  step: number;
  currentPlayerName: string;
  currentArchetype: PlayerArchetype;
  callback: DeferredDirectorCallback | null;
  latestHistory: HistoryLikeEntry | null;
  latestWorldEvent: WorldEvent | null;
  splitVoteConsequence: SplitVoteConsequence | null;
};

type GlobalDirectorAIGenerator = (context: DirectorLineContext) => string;

declare global {
  // Optional injectable hook for custom AI generation in server runtime.
  // Keeping it global avoids adding any paid SDK dependency in default runtime.
  var __STORY_CLASH_DIRECTOR_AI__: GlobalDirectorAIGenerator | undefined;
}

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

function clipText(value: string | null | undefined, max = 64): string {
  if (!value) {
    return "";
  }
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1).trim()}…`;
}

function sanitizeLine(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const compact = value.replace(/\s+/g, " ").replace(/^Reality remembers:\s*/i, "").trim();
  if (!compact) {
    return null;
  }
  return clipText(compact, MAX_MEMORY_LINE_LENGTH);
}

function historyChoice(entry: HistoryLikeEntry | null): string {
  return entry?.choiceLabel ?? entry?.choice ?? "a risky move";
}

function historyPlayer(entry: HistoryLikeEntry | null): string {
  return entry?.playerName ?? entry?.player ?? "Someone";
}

function archetypeVolatility(profile: PlayerProfile | undefined): number {
  if (!profile) {
    return 18;
  }
  const evolutionLength = profile.archetypes.evolution.length;
  const traitSpread = Math.abs(profile.traits.riskTaking - profile.traits.cooperation) + Math.abs(profile.traits.morality - 50);
  return clamp(Math.round(evolutionLength * 5 + traitSpread * 0.2), 4, 100);
}

function archetypeConfidence(profile: PlayerProfile | undefined): number {
  if (!profile) {
    return 40;
  }
  const commitment = profile.patterns.totalChoices * 4;
  const stability = 100 - archetypeVolatility(profile);
  return clamp(Math.round(stability * 0.55 + commitment), 25, 99);
}

function sortGenres(power: GenrePower): GenreId[] {
  return (["zombie", "alien", "haunted"] as GenreId[]).sort((left, right) => power[right] - power[left]);
}

function severityFromPressure(pressure: number): WorldEventSeverity {
  if (pressure >= 88) {
    return "critical";
  }
  if (pressure >= 68) {
    return "high";
  }
  if (pressure >= 46) {
    return "medium";
  }
  return "low";
}

export function syncArchetypeProgress(input: {
  players: Player[];
  playerProfiles: Record<string, PlayerProfile>;
  current: Record<string, ArchetypeProgressState>;
  step: number;
  nowTs?: number;
}): Record<string, ArchetypeProgressState> {
  const nowTs = input.nowTs ?? Date.now();
  const next: Record<string, ArchetypeProgressState> = {};

  for (const player of input.players) {
    const profile = input.playerProfiles[player.id];
    const previous = input.current[player.id];
    const currentArchetype = profile?.archetypes.primary ?? "The Pragmatist";
    const changed = Boolean(previous && previous.currentArchetype !== currentArchetype);
    const shiftCount = (previous?.shiftCount ?? 0) + (changed ? 1 : 0);
    const progress = clamp(
      Math.round((profile?.patterns.totalChoices ?? 0) * 7 + (profile?.archetypes.evolution.length ?? 1) * 5),
      0,
      100
    );

    next[player.id] = {
      playerId: player.id,
      currentArchetype,
      previousArchetype: changed ? (previous?.currentArchetype ?? null) : (previous?.previousArchetype ?? null),
      progress,
      confidence: archetypeConfidence(profile),
      volatility: archetypeVolatility(profile),
      shiftCount,
      lastShiftStep: changed ? input.step : (previous?.lastShiftStep ?? null),
      updatedAt: nowTs,
    };
  }

  return next;
}

export function resolveSplitVoteConsequence(input: {
  roomCode: string;
  step: number;
  sceneId: string;
  sourcePlayerId: string;
  sourcePlayerName: string;
  choiceLabel: string;
  availableChoices: number;
  voteSplitSeverity: number;
  chaosLevel: number;
  worldState: WorldState;
}): SplitVoteConsequence | null {
  if (input.availableChoices < 2) {
    return null;
  }

  const normalizedSeverity = clamp(input.voteSplitSeverity / 100, 0, 1);
  const pressure = clamp(Math.round(normalizedSeverity * 62 + input.chaosLevel * 0.38), 0, 100);
  if (pressure < 42) {
    return null;
  }

  const highestTension = Object.entries(input.worldState.tensions).sort((left, right) => right[1] - left[1])[0];
  const tensionLabel = highestTension ? highestTension[0].replaceAll("_", " ") : "crew stability";
  const detail = `${input.sourcePlayerName} forced "${clipText(input.choiceLabel, 42)}"; ${tensionLabel} spikes and the crew fractures.`;

  return {
    id: `split-${input.roomCode}-${input.step}-${stableHash(`${input.sceneId}:${input.choiceLabel}`) % 10000}`,
    step: input.step,
    sceneId: input.sceneId,
    sourcePlayerId: input.sourcePlayerId,
    sourcePlayerName: input.sourcePlayerName,
    choiceLabel: clipText(input.choiceLabel, 48),
    severity: Number(normalizedSeverity.toFixed(3)),
    pressure,
    detail: clipText(detail, 150),
    createdAt: Date.now(),
  };
}

export function applySplitVoteImpact(input: {
  consequence: SplitVoteConsequence;
  genrePower: GenrePower;
}): {
  genreShift: Partial<Record<GenreId, number>>;
  chaosBonus: number;
  worldEvent: WorldEvent;
} {
  const ranked = sortGenres(input.genrePower);
  const lead = ranked[0];
  const secondary = ranked[1];
  const tertiary = ranked[2];
  const weight = clamp(Math.round(input.consequence.pressure / 12), 3, 9);

  const genreShift: Partial<Record<GenreId, number>> = {
    [lead]: -Math.max(2, Math.round(weight * 0.6)),
    [secondary]: Math.max(2, Math.round(weight * 0.5)),
    [tertiary]: Math.max(1, Math.round(weight * 0.35)),
  };

  return {
    genreShift,
    chaosBonus: clamp(Math.round(4 + input.consequence.pressure * 0.12), 4, 18),
    worldEvent: {
      id: `world-${input.consequence.id}`,
      type: "fractured_outcome",
      title: "Fractured outcome",
      detail: input.consequence.detail,
      severity: severityFromPressure(input.consequence.pressure),
      source: "director",
      createdAt: Date.now(),
    },
  };
}

export function scheduleDirectorCallbacks(input: {
  roomCode: string;
  step: number;
  queue: DeferredDirectorCallback[];
  historyEntry: HistoryLikeEntry;
  latestWorldEvent: WorldEvent | null;
  splitVoteConsequence: SplitVoteConsequence | null;
}): DeferredDirectorCallback[] {
  const callbacks = [...input.queue];
  const delayChoice = 2 + (stableHash(`${input.roomCode}:${input.step}:${historyChoice(input.historyEntry)}`) % 2);
  callbacks.push({
    id: `cb-choice-${input.roomCode}-${input.step}`,
    source: "choice_memory",
    createdStep: input.step,
    dueStep: input.step + delayChoice,
    sceneId: input.historyEntry.sceneId,
    playerId: input.historyEntry.playerId,
    playerName: historyPlayer(input.historyEntry),
    choiceLabel: historyChoice(input.historyEntry),
  });

  if (input.latestWorldEvent) {
    const delayWorld = 2 + (stableHash(`${input.roomCode}:${input.latestWorldEvent.id}`) % 2);
    callbacks.push({
      id: `cb-world-${input.latestWorldEvent.id}`,
      source: "world_event",
      createdStep: input.step,
      dueStep: input.step + delayWorld,
      sceneId: input.historyEntry.sceneId,
      playerId: input.historyEntry.playerId,
      playerName: historyPlayer(input.historyEntry),
      choiceLabel: historyChoice(input.historyEntry),
      worldEventId: input.latestWorldEvent.id,
      worldEventTitle: input.latestWorldEvent.title,
    });
  }

  if (input.splitVoteConsequence) {
    callbacks.push({
      id: `cb-split-${input.splitVoteConsequence.id}`,
      source: "split_consequence",
      createdStep: input.step,
      dueStep: input.step + 2,
      sceneId: input.historyEntry.sceneId,
      playerId: input.splitVoteConsequence.sourcePlayerId,
      playerName: input.splitVoteConsequence.sourcePlayerName,
      choiceLabel: input.splitVoteConsequence.choiceLabel,
    });
  }

  const unique = new Map<string, DeferredDirectorCallback>();
  for (const callback of callbacks) {
    unique.set(callback.id, callback);
  }

  return [...unique.values()]
    .sort((left, right) => {
      if (left.dueStep !== right.dueStep) {
        return left.dueStep - right.dueStep;
      }
      return left.createdStep - right.createdStep;
    })
    .slice(-MAX_CALLBACKS);
}

function localRealityLine(context: DirectorLineContext): string {
  if (context.callback?.source === "split_consequence") {
    return `${context.callback.playerName ?? "Someone"}'s split call on "${context.callback.choiceLabel ?? "the vote"}" is still splitting the crew.`;
  }
  if (context.callback?.source === "world_event") {
    return `${context.callback.playerName ?? "The crew"} caused ${clipText(context.callback.worldEventTitle, 44).toLowerCase()} two scenes ago.`;
  }
  if (context.callback?.source === "choice_memory") {
    return `${context.callback.playerName ?? "Someone"} chose "${context.callback.choiceLabel ?? "a risky move"}", and the aftermath is closing in.`;
  }
  if (context.splitVoteConsequence) {
    return `${context.splitVoteConsequence.sourcePlayerName ?? "The crew"} fractured the vote with "${context.splitVoteConsequence.choiceLabel}".`;
  }
  if (context.latestWorldEvent) {
    return `${clipText(context.latestWorldEvent.title, 52)} traces back to your last move.`;
  }
  if (context.latestHistory) {
    return `${historyPlayer(context.latestHistory)} set this path with "${clipText(historyChoice(context.latestHistory), 38)}".`;
  }
  return `${context.currentPlayerName}, your ${context.currentArchetype.replace("The ", "").toLowerCase()} instincts are shaping what comes next.`;
}

function maybeGenerateAiRealityLine(context: DirectorLineContext): string | null {
  if (process.env.NARRATIVE_AI_ENABLED !== "1") {
    return null;
  }

  try {
    const generator = globalThis.__STORY_CLASH_DIRECTOR_AI__;
    if (typeof generator !== "function") {
      return null;
    }
    return sanitizeLine(generator(context));
  } catch {
    return null;
  }
}

export function resolveRealityRemembers(input: {
  roomCode: string;
  step: number;
  currentPlayerId: string | null;
  players: Player[];
  playerProfiles: Record<string, PlayerProfile>;
  queue: DeferredDirectorCallback[];
  history: HistoryLikeEntry[];
  worldState: WorldState;
  splitVoteConsequence: SplitVoteConsequence | null;
}): { line: string; queue: DeferredDirectorCallback[] } {
  const callbacks = [...input.queue];
  const dueIndex = callbacks.findIndex((entry) => entry.dueStep <= input.step);
  const callback = dueIndex >= 0 ? callbacks.splice(dueIndex, 1)[0] : null;
  const latestHistory = input.history.at(-1) ?? null;
  const latestWorldEvent = input.worldState.timeline.at(-1) ?? null;
  const activePlayer =
    input.players.find((entry) => entry.id === input.currentPlayerId) ??
    input.players.find((entry) => entry.id === latestHistory?.playerId) ??
    input.players[0] ??
    null;
  const currentProfile = activePlayer ? input.playerProfiles[activePlayer.id] : undefined;

  const context: DirectorLineContext = {
    roomCode: input.roomCode,
    step: input.step,
    currentPlayerName: activePlayer?.name ?? "Player",
    currentArchetype: currentProfile?.archetypes.primary ?? "The Pragmatist",
    callback,
    latestHistory,
    latestWorldEvent,
    splitVoteConsequence: input.splitVoteConsequence,
  };

  const aiLine = maybeGenerateAiRealityLine(context);
  const line = aiLine ?? sanitizeLine(localRealityLine(context)) ?? "The Rift is watching every move.";
  return {
    line,
    queue: callbacks,
  };
}
