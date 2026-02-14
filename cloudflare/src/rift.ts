import type {
  Choice,
  GenreId,
  GenrePower,
  RiftDecision,
  RiftEventRecord,
  Scene,
  WorldEvent,
} from "./types";

const GENRES: GenreId[] = ["zombie", "alien", "haunted"];
const BASE_GENRE_POWER: GenrePower = {
  zombie: 34,
  alien: 33,
  haunted: 33,
};

const GENRE_KEYWORDS: Record<GenreId, string[]> = {
  zombie: [
    "fight",
    "charge",
    "weapon",
    "swarm",
    "horde",
    "barricade",
    "crowbar",
    "flare",
    "bleed",
    "outbreak",
    "escape",
  ],
  alien: [
    "reactor",
    "uplink",
    "beacon",
    "fleet",
    "drone",
    "signal",
    "comms",
    "code",
    "relay",
    "plasma",
    "orbit",
  ],
  haunted: [
    "spirit",
    "whisper",
    "mirror",
    "crypt",
    "ritual",
    "ghost",
    "chapel",
    "candles",
    "lullaby",
    "vault",
    "manor",
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function stableRoll(seed: string): number {
  const hash = stableHash(seed);
  return ((hash % 10_000) + 0.5) / 10_000;
}

function normalizeGenrePower(raw: Partial<Record<GenreId, number>>): GenrePower {
  const values = GENRES.map((genre) => Math.max(1, Math.round(raw[genre] ?? 0)));
  const total = values.reduce((sum, value) => sum + value, 0);
  const normalized = values.map((value) => Math.round((value / total) * 100));

  let diff = 100 - normalized.reduce((sum, value) => sum + value, 0);
  const order = [...GENRES.keys()].sort((a, b) => values[b] - values[a]);
  let cursor = 0;

  while (diff !== 0 && order.length > 0) {
    const idx = order[cursor % order.length];
    if (diff > 0) {
      normalized[idx] += 1;
      diff -= 1;
    } else if (normalized[idx] > 1) {
      normalized[idx] -= 1;
      diff += 1;
    } else {
      cursor += 1;
      continue;
    }
    cursor += 1;
  }

  return {
    zombie: normalized[0],
    alien: normalized[1],
    haunted: normalized[2],
  };
}

function scoreText(text: string, genre: GenreId): number {
  const lower = text.toLowerCase();
  return GENRE_KEYWORDS[genre].reduce(
    (score, keyword) => (lower.includes(keyword) ? score + 1 : score),
    0
  );
}

function toChoiceLabel(choice: Choice): string {
  return choice.label ?? choice.text ?? "Continue";
}

function toChoiceNext(choice: Choice): string | null {
  return choice.nextId ?? choice.next ?? null;
}

function toGenreTitle(genre: GenreId): string {
  if (genre === "zombie") {
    return "Outbreak";
  }
  if (genre === "alien") {
    return "Invasion";
  }
  return "Haunting";
}

function rankedGenres(power: GenrePower): GenreId[] {
  return [...GENRES].sort((left, right) => power[right] - power[left]);
}

function probabilisticBand(probability: number): string {
  if (probability >= 0.72) {
    return "critical_pressure";
  }
  if (probability >= 0.5) {
    return "high_pressure";
  }
  if (probability >= 0.3) {
    return "rising_pressure";
  }
  return "low_pressure";
}

function evaluateRiftProbability(input: {
  chaosLevel: number;
  genreImbalance: number;
  voteSplitSeverity: number;
  scenesSinceLastRift: number;
  recentTensionDelta: number;
  timeout?: boolean;
}): number {
  const base = 0.06;
  const chaosFactor = clamp(input.chaosLevel, 0, 100) * 0.0055;
  const imbalanceFactor = clamp(input.genreImbalance, 0, 60) * 0.006;
  const voteSplitFactor = clamp(input.voteSplitSeverity, 0, 100) * 0.0022;
  const tensionFactor = clamp(input.recentTensionDelta, -4, 4) * 0.045;
  const timeoutBoost = input.timeout ? 0.1 : 0;

  const cooldownPenalty =
    input.scenesSinceLastRift <= 1
      ? 0.22
      : input.scenesSinceLastRift === 2
        ? 0.1
        : input.scenesSinceLastRift >= 6
          ? -0.03
          : 0;

  return clamp(
    base + chaosFactor + imbalanceFactor + voteSplitFactor + tensionFactor + timeoutBoost - cooldownPenalty,
    0.03,
    0.92
  );
}

export function createInitialGenrePower(selectedGenre: GenreId | null = null): GenrePower {
  if (!selectedGenre) {
    return { ...BASE_GENRE_POWER };
  }
  const boosted = applyGenrePowerShift(BASE_GENRE_POWER, {
    [selectedGenre]: 18,
    zombie: selectedGenre === "zombie" ? 18 : -9,
    alien: selectedGenre === "alien" ? 18 : -9,
    haunted: selectedGenre === "haunted" ? 18 : -9,
  });
  return boosted;
}

export function applyGenrePowerShift(
  current: GenrePower,
  shift: Partial<Record<GenreId, number>>
): GenrePower {
  return normalizeGenrePower({
    zombie: current.zombie + (shift.zombie ?? 0),
    alien: current.alien + (shift.alien ?? 0),
    haunted: current.haunted + (shift.haunted ?? 0),
  });
}

export function dominantGenre(power: GenrePower): GenreId {
  return GENRES.reduce((best, genre) => (power[genre] > power[best] ? genre : best), "zombie");
}

export function dominantGenreScore(power: GenrePower): number {
  return Math.max(power.zombie, power.alien, power.haunted);
}

export function genreImbalanceScore(power: GenrePower): number {
  const ranked = rankedGenres(power);
  const top = power[ranked[0]];
  const second = power[ranked[1]];
  return clamp(top - second, 0, 100);
}

export function deriveVoteSplitSeverity(input: {
  availableChoices: number;
  recentChoiceTargets: string[];
  selectedNextSceneId: string;
}): number {
  const size = Math.max(1, input.availableChoices);
  const allTargets = [...input.recentChoiceTargets.slice(-4), input.selectedNextSceneId].filter(Boolean);
  const uniqueTargets = new Set(allTargets);
  const diversityRatio = clamp(uniqueTargets.size / size, 0, 1);
  const recencyBoost = Math.min(22, Math.max(0, allTargets.length - 2) * 6);
  return clamp(Math.round(diversityRatio * 100 + recencyBoost), 0, 100);
}

export function deriveRecentTensionDelta(input: {
  currentTension: number;
  recentTensions: number[];
}): number {
  const baseline = input.recentTensions.length
    ? input.recentTensions.reduce((sum, value) => sum + value, 0) / input.recentTensions.length
    : input.currentTension;
  return clamp(Math.round(input.currentTension - baseline), -4, 4);
}

export function scenesSinceLastRift(input: { historyLength: number; riftHistory: RiftEventRecord[] }): number {
  const latest = input.riftHistory.at(-1);
  if (!latest) {
    return input.historyLength + 1;
  }
  return Math.max(1, input.historyLength + 1 - latest.step);
}

export function deriveChoiceGenreShift(input: {
  selectedGenre: GenreId;
  scene: Scene;
  choiceLabel: string;
  timeout?: boolean;
}): Partial<Record<GenreId, number>> {
  const combined = `${input.scene.text} ${input.choiceLabel}`;
  const scores: Record<GenreId, number> = {
    zombie: scoreText(combined, "zombie"),
    alien: scoreText(combined, "alien"),
    haunted: scoreText(combined, "haunted"),
  };

  const primary = dominantGenre({
    zombie: scores.zombie + (input.selectedGenre === "zombie" ? 1 : 0),
    alien: scores.alien + (input.selectedGenre === "alien" ? 1 : 0),
    haunted: scores.haunted + (input.selectedGenre === "haunted" ? 1 : 0),
  });

  const secondary = GENRES.filter((genre) => genre !== primary).sort(
    (a, b) => scores[b] - scores[a]
  )[0];

  const shift: Partial<Record<GenreId, number>> = {
    zombie: -2,
    alien: -2,
    haunted: -2,
  };

  shift[input.selectedGenre] = (shift[input.selectedGenre] ?? 0) + 4;
  shift[primary] = (shift[primary] ?? 0) + 7;
  if (secondary) {
    shift[secondary] = (shift[secondary] ?? 0) + 2;
  }

  if (input.timeout) {
    const timeoutBias = GENRES.find((genre) => genre !== primary) ?? input.selectedGenre;
    shift[timeoutBias] = (shift[timeoutBias] ?? 0) + 4;
  }

  return shift;
}

export function computeChaosLevel(input: {
  genrePower: GenrePower;
  selectedGenre: GenreId | null;
  tensionLevel: number;
  timeout?: boolean;
  bonus?: number;
}): number {
  if (!input.selectedGenre) {
    return 0;
  }

  const values = Object.values(input.genrePower);
  const spread = Math.max(...values) - Math.min(...values);
  const spillover = 100 - input.genrePower[input.selectedGenre];
  const tension = clamp(input.tensionLevel, 1, 5) * 8;
  const timeoutBoost = input.timeout ? 10 : 0;
  const bonus = input.bonus ?? 0;
  const chaos = spillover * 0.5 + spread * 0.25 + tension + timeoutBoost + bonus;

  return clamp(Math.round(chaos), 0, 100);
}

export function toWorldEventFromRift(event: RiftEventRecord): WorldEvent {
  return {
    id: `world-${event.id}`,
    type: event.type,
    title: event.title,
    detail: event.description,
    severity:
      event.chaosLevel >= 82
        ? "critical"
        : event.chaosLevel >= 66
          ? "high"
          : event.chaosLevel >= 45
            ? "medium"
            : "low",
    source: "rift",
    createdAt: event.createdAt,
  };
}

export function appendWorldEvent(
  timeline: WorldEvent[],
  event: WorldEvent,
  limit = 60
): { timeline: WorldEvent[]; latest: WorldEvent } {
  const next = [...timeline, event].slice(-limit);
  return { timeline: next, latest: event };
}

export function evaluateRiftEvent(input: {
  roomCode: string;
  step: number;
  scene: Scene;
  choices: Choice[];
  selectedChoiceId?: string;
  selectedNextSceneId: string;
  playerId: string | null;
  genrePower: GenrePower;
  chaosLevel: number;
  timeout?: boolean;
  voteSplitSeverity?: number;
  scenesSinceLastRift?: number;
  recentTensionDelta?: number;
}): {
  event: RiftEventRecord | null;
  nextSceneId: string;
  genrePower: GenrePower;
  chaosLevel: number;
  decision: RiftDecision;
} {
  const normalizedChoices = input.choices
    .map((choice) => ({
      id: choice.id,
      label: toChoiceLabel(choice),
      nextId: toChoiceNext(choice),
    }))
    .filter((choice): choice is { id: string; label: string; nextId: string } => Boolean(choice.nextId));

  const imbalance = genreImbalanceScore(input.genrePower);
  const triggerProbability = evaluateRiftProbability({
    chaosLevel: input.chaosLevel,
    genreImbalance: imbalance,
    voteSplitSeverity: input.voteSplitSeverity ?? 0,
    scenesSinceLastRift: input.scenesSinceLastRift ?? 4,
    recentTensionDelta: input.recentTensionDelta ?? 0,
    timeout: input.timeout,
  });
  const roll = stableRoll(`${input.roomCode}:${input.scene.id}:${input.step}:${input.chaosLevel}:${imbalance}:${input.voteSplitSeverity ?? 0}`);

  if (roll >= triggerProbability) {
    return {
      event: null,
      nextSceneId: input.selectedNextSceneId,
      genrePower: input.genrePower,
      chaosLevel: input.chaosLevel,
      decision: {
        triggered: false,
        selectedType: null,
        probability: Number(triggerProbability.toFixed(3)),
        roll: Number(roll.toFixed(3)),
        reason: probabilisticBand(triggerProbability),
      },
    };
  }

  const typeRoll = stableRoll(`${input.roomCode}:${input.scene.id}:${input.step}:type`);
  const fractureScore =
    clamp(input.chaosLevel, 0, 100) * 0.6 +
    clamp(input.voteSplitSeverity ?? 0, 0, 100) * 0.35 +
    clamp(input.recentTensionDelta ?? 0, -4, 4) * 6 +
    (input.timeout ? 10 : 0);

  const selectedType: RiftEventRecord["type"] =
    fractureScore >= 64 && typeRoll < clamp(fractureScore / 100, 0.25, 0.9)
      ? "rift_reality_fracture"
      : "rift_genre_surge";

  if (selectedType === "rift_reality_fracture") {
    const alternatives = normalizedChoices.filter(
      (choice) =>
        choice.id !== input.selectedChoiceId && choice.nextId !== input.selectedNextSceneId
    );

    if (alternatives.length > 0) {
      const seed = stableHash(`${input.roomCode}:${input.scene.id}:${input.step}:fracture`);
      const selected = alternatives[seed % alternatives.length];
      const ranked = rankedGenres(input.genrePower);
      const shiftedPower = applyGenrePowerShift(input.genrePower, {
        [ranked[0]]: -8,
        [ranked[1]]: 6,
        [ranked[2]]: 6,
      });
      const nextChaos = clamp(input.chaosLevel + 14, 0, 100);
      const event: RiftEventRecord = {
        id: `rift-fracture-${input.scene.id}-${input.step}`,
        type: "rift_reality_fracture",
        title: "Reality Fracture",
        description: `The Rift tears open and reroutes fate toward "${selected.label}".`,
        step: input.step,
        sceneId: input.scene.id,
        playerId: input.playerId,
        choiceId: input.selectedChoiceId ?? null,
        originalNextSceneId: input.selectedNextSceneId,
        nextSceneId: selected.nextId,
        chaosLevel: nextChaos,
        createdAt: Date.now(),
      };
      return {
        event,
        nextSceneId: selected.nextId,
        genrePower: shiftedPower,
        chaosLevel: nextChaos,
        decision: {
          triggered: true,
          selectedType,
          probability: Number(triggerProbability.toFixed(3)),
          roll: Number(roll.toFixed(3)),
          reason: "fracture_path_override",
        },
      };
    }
  }

  const dominant = dominantGenre(input.genrePower);
  const dominantScore = dominantGenreScore(input.genrePower);
  const surgeStrength = clamp(Math.round(dominantScore / 7), 8, 14);
  const surgedPower = applyGenrePowerShift(input.genrePower, {
    zombie: dominant === "zombie" ? surgeStrength : -Math.round(surgeStrength / 2),
    alien: dominant === "alien" ? surgeStrength : -Math.round(surgeStrength / 2),
    haunted: dominant === "haunted" ? surgeStrength : -Math.round(surgeStrength / 2),
  });
  const nextChaos = clamp(input.chaosLevel + 8, 0, 100);
  const event: RiftEventRecord = {
    id: `rift-surge-${input.scene.id}-${input.step}`,
    type: "rift_genre_surge",
    title: `Rift Surge: ${toGenreTitle(dominant)}`,
    description: `${toGenreTitle(dominant)} pressure surges and warps the room's momentum.`,
    step: input.step,
    sceneId: input.scene.id,
    playerId: input.playerId,
    choiceId: input.selectedChoiceId ?? null,
    targetGenre: dominant,
    chaosLevel: nextChaos,
    createdAt: Date.now(),
  };

  return {
    event,
    nextSceneId: input.selectedNextSceneId,
    genrePower: surgedPower,
    chaosLevel: nextChaos,
    decision: {
      triggered: true,
      selectedType: "rift_genre_surge",
      probability: Number(triggerProbability.toFixed(3)),
      roll: Number(roll.toFixed(3)),
      reason: "genre_pressure_surge",
    },
  };
}
