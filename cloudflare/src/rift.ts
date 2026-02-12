import type {
  Choice,
  GenreId,
  GenrePower,
  RiftEventRecord,
  Scene,
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
}): {
  event: RiftEventRecord | null;
  nextSceneId: string;
  genrePower: GenrePower;
  chaosLevel: number;
} {
  const normalizedChoices = input.choices
    .map((choice) => ({
      id: choice.id,
      label: toChoiceLabel(choice),
      nextId: toChoiceNext(choice),
    }))
    .filter((choice): choice is { id: string; label: string; nextId: string } => Boolean(choice.nextId));

  if (
    normalizedChoices.length > 1 &&
    input.chaosLevel >= 65 &&
    input.step >= 3 &&
    (input.timeout || input.selectedChoiceId === "b")
  ) {
    const alternatives = normalizedChoices.filter(
      (choice) =>
        choice.id !== input.selectedChoiceId && choice.nextId !== input.selectedNextSceneId
    );
    if (alternatives.length > 0) {
      const seed = stableHash(`${input.roomCode}:${input.scene.id}:${input.step}:twist`);
      const selected = alternatives[seed % alternatives.length];
      const nextChaos = clamp(input.chaosLevel + 12, 0, 100);
      const event: RiftEventRecord = {
        id: `rift-twist-${input.scene.id}-${input.step}`,
        type: "scene_twist",
        title: "Rift Twist",
        description: `Reality snaps sideways. The path reroutes to "${selected.label}".`,
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
        genrePower: input.genrePower,
        chaosLevel: nextChaos,
      };
    }
  }

  const dominant = dominantGenre(input.genrePower);
  const dominantScore = dominantGenreScore(input.genrePower);

  if (input.step >= 2 && input.step % 2 === 0 && dominantScore >= 54) {
    const surgedPower = applyGenrePowerShift(input.genrePower, {
      zombie: dominant === "zombie" ? 12 : -6,
      alien: dominant === "alien" ? 12 : -6,
      haunted: dominant === "haunted" ? 12 : -6,
    });
    const nextChaos = clamp(input.chaosLevel + 6, 0, 100);
    const event: RiftEventRecord = {
      id: `rift-surge-${input.scene.id}-${input.step}`,
      type: "genre_surge",
      title: `Rift Surge: ${toGenreTitle(dominant)}`,
      description: `${toGenreTitle(dominant)} energy overwhelms the room and bends the tone forward.`,
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
    };
  }

  return {
    event: null,
    nextSceneId: input.selectedNextSceneId,
    genrePower: input.genrePower,
    chaosLevel: input.chaosLevel,
  };
}
