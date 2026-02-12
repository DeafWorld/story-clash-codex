import { containsProfanity } from "./profanity";
import type { EndingType, GenreId, NarrationLine, NarrationTone, NarrationTrigger } from "./types";

type NarrationContext = {
  code: string;
  trigger: NarrationTrigger;
  genre: GenreId | null;
  sceneId?: string | null;
  historyLength: number;
  tensionLevel: number;
  playerId?: string | null;
  playerName?: string | null;
  choiceLabel?: string | null;
  freeText?: string | null;
  endingType?: EndingType | null;
};

const MAX_NARRATION_LENGTH = 140;
const UNSAFE_WORD_PATTERN = /\b(fuck|shit|bitch|asshole|nigger|faggot)\b/i;

const SCENE_BANK: Record<NarrationTone, string[]> = {
  calm: [
    "The air settles for a breath. {player} reads the room.",
    "A fragile calm hangs over the crew. {player} takes point.",
  ],
  uneasy: [
    "Something shifts just out of sight. {player}, your call.",
    "The room feels wrong in a new way. {player} steps in.",
  ],
  urgent: [
    "Pressure climbs fast. {player} has seconds to decide.",
    "Heartbeat pace rises. {player} is on deck.",
  ],
  desperate: [
    "No margin left. {player} moves or everyone pays.",
    "The edge is here. {player} must act now.",
  ],
  hopeful: [
    "A narrow opening appears. {player} can push it wider.",
    "The odds still bite, but {player} sees a line forward.",
  ],
  grim: [
    "The silence feels heavy. {player} walks into it.",
    "The scene darkens. {player} braces for impact.",
  ],
};

const CHOICE_BANK: Record<NarrationTone, string[]> = {
  calm: ["{player} commits to {choice}.", "{player} keeps it steady with {choice}."],
  uneasy: ["{player} chooses {choice}, and the mood tilts.", "A careful gamble: {player} goes with {choice}."],
  urgent: ["No hesitation. {player} locks in {choice}.", "Clock ticking, {player} fires off {choice}."],
  desperate: ["At the brink, {player} throws everything at {choice}.", "Under full pressure, {player} calls {choice}."],
  hopeful: ["The team leans in as {player} picks {choice}.", "Momentum swings when {player} selects {choice}."],
  grim: ["{player} takes the hard road: {choice}.", "The cost is visible as {player} chooses {choice}."],
};

const TIMEOUT_BANK: Record<NarrationTone, string[]> = {
  calm: ["Silence wins the turn. Fate makes the move.", "No call in time. The story chooses for the crew."],
  uneasy: ["The clock steals the turn. Random fate steps in.", "Hesitation costs dearly. Chance decides this beat."],
  urgent: ["Timer hit zero. Control slips to chaos.", "Too late. The room answers with a random move."],
  desperate: ["Time is up. Panic takes the wheel.", "The deadline snaps shut. Survival mode picks for you."],
  hopeful: ["A missed moment, but the story still moves.", "The turn times out. There is still a path ahead."],
  grim: ["No decision landed. The dark made one anyway.", "The timer dies, and the story turns colder."],
};

const ENDING_BANK: Record<EndingType, string[]> = {
  triumph: ["Against the odds, the crew carves out a win.", "The plan holds. Hope survives this chapter."],
  survival: ["Barely breathing, but still standing. The crew lives on.", "It is not pretty, but the crew escapes the worst."],
  doom: ["The night takes its payment. This run ends in ruin.", "The story closes hard. Nobody forgets this ending."],
};

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickTemplate(options: string[], seed: string): string {
  if (options.length === 0) {
    return "The story moves.";
  }
  const index = stableHash(seed) % options.length;
  return options[index] ?? options[0];
}

function normalizeSpacing(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function sanitizeChoiceEcho(choiceLabel: string | null | undefined, freeText: string | null | undefined): string {
  const candidate = freeText && freeText.trim().length > 0 ? freeText : choiceLabel;
  if (!candidate) {
    return "a risky call";
  }

  const normalized = normalizeSpacing(candidate)
    .replace(/["'`]/g, "")
    .replace(/[^a-zA-Z0-9 ,.?!:-]/g, "")
    .slice(0, 52);

  if (!normalized) {
    return "a risky call";
  }

  if (containsProfanity(normalized) || UNSAFE_WORD_PATTERN.test(normalized)) {
    return "an unspoken move";
  }

  return normalized;
}

function applyTemplate(template: string, fields: Record<string, string>): string {
  return Object.entries(fields).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), template);
}

export function deriveNarrationTone(input: {
  genre: GenreId | null;
  tensionLevel: number;
  trigger: NarrationTrigger;
  endingType?: EndingType | null;
}): NarrationTone {
  if (input.trigger === "ending") {
    if (input.endingType === "triumph") {
      return "hopeful";
    }
    if (input.endingType === "survival") {
      return "uneasy";
    }
    return "grim";
  }

  if (input.trigger === "turn_timeout") {
    return input.tensionLevel >= 4 ? "desperate" : "urgent";
  }

  if (input.tensionLevel >= 5) {
    return "desperate";
  }
  if (input.tensionLevel >= 4) {
    return "urgent";
  }
  if (input.tensionLevel >= 3) {
    return "uneasy";
  }

  if (input.genre === "haunted") {
    return "grim";
  }

  return "calm";
}

export function generateNarrationLine(context: NarrationContext): NarrationLine {
  const trigger = context.trigger;
  const tensionLevel = Math.min(5, Math.max(1, Math.round(context.tensionLevel || 1)));
  const endingType = context.endingType ?? null;
  const tone = deriveNarrationTone({ genre: context.genre, tensionLevel, trigger, endingType });

  const player = normalizeSpacing(context.playerName || "The crew").slice(0, 22) || "The crew";
  const choice = sanitizeChoiceEcho(context.choiceLabel, context.freeText);

  const seedBase = [
    context.code,
    context.sceneId ?? "none",
    String(context.historyLength),
    trigger,
    tone,
    context.genre ?? "none",
    endingType ?? "none",
    context.playerId ?? "none",
  ].join("|");

  let template = "The story moves.";
  if (trigger === "scene_enter") {
    template = pickTemplate(SCENE_BANK[tone], seedBase);
  } else if (trigger === "choice_submitted") {
    template = pickTemplate(CHOICE_BANK[tone], seedBase);
  } else if (trigger === "turn_timeout") {
    template = pickTemplate(TIMEOUT_BANK[tone], seedBase);
  } else if (trigger === "ending") {
    template = pickTemplate(ENDING_BANK[endingType ?? "doom"], seedBase);
  }

  const rendered = trimToLength(normalizeSpacing(applyTemplate(template, { player, choice })), MAX_NARRATION_LENGTH);

  const createdAt = Date.now();
  return {
    id: `nar-${stableHash(`${seedBase}|${createdAt}`).toString(16)}`,
    text: rendered,
    tone,
    trigger,
    roomCode: context.code,
    sceneId: context.sceneId ?? null,
    playerId: context.playerId ?? null,
    tensionLevel,
    genre: context.genre,
    endingType,
    createdAt,
  };
}
