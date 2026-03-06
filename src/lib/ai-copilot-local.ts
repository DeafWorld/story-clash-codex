import { nanoid } from "nanoid";
import type { GMChoice, StoryBeat } from "../types/game";

type LocalContext = {
  roomCode?: string;
  beatIndex?: number;
  recentBeats?: string[];
  winningChoiceLabel?: string | null;
  lockedChoiceLabel?: string | null;
  freeformSnippets?: string[];
};

const BEAT_OPENERS = [
  "The air turns heavy as everyone goes silent.",
  "A distant impact shakes the floor beneath your crew.",
  "Static crawls through the room and every light flickers.",
  "Something moves just outside your line of sight.",
];

const BEAT_ESCALATIONS = [
  "A warning symbol flashes, then disappears.",
  "You hear your own names whispered from two directions.",
  "The door you just locked is suddenly open.",
  "Your map updates itself with a route no one chose.",
];

const BEAT_HOOKS = [
  "You have seconds to decide what this means.",
  "The next move could save someone or doom everyone.",
  "Whatever happens now, reality will remember it.",
  "Your crew looks to each other, waiting for one call.",
];

const PERSONALITY_ICONS: Record<string, string> = {
  brave: "⚔️",
  analytical: "🔍",
  defensive: "🛡️",
  chaotic: "⚡",
  empathetic: "🤝",
  opportunistic: "🎯",
};

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
}

function pick(seed: string, options: string[]) {
  return options[stableIndex(seed, options.length)] ?? options[0] ?? "";
}

export function sanitizeFreeformInput(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const withoutControls = withoutTags.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function buildLocalBeatSuggestion(context: LocalContext): StoryBeat {
  const seed = `${context.roomCode ?? "room"}:${context.beatIndex ?? 0}`;
  const line1 = pick(`${seed}:a`, BEAT_OPENERS);
  const line2 = pick(`${seed}:b`, BEAT_ESCALATIONS);
  const line3 = context.recentBeats?.length
    ? `Last choice still echoes: "${context.recentBeats.at(-1)?.slice(0, 72) ?? "Unknown"}".`
    : pick(`${seed}:c`, BEAT_ESCALATIONS);
  const line4 = pick(`${seed}:d`, BEAT_HOOKS);
  const rawText = [line1, line2, line3, line4].join("\n");
  return {
    id: `beat-${nanoid(10)}`,
    title: "Rift Sequence",
    location: "Unknown Sector",
    icon: "⚡",
    rawText,
    visualBeats: [],
    createdBy: "ai-local",
    createdAt: Date.now(),
  };
}

export function buildLocalChoiceSuggestions(context: LocalContext): GMChoice[] {
  const seed = `${context.roomCode ?? "room"}:${context.beatIndex ?? 0}`;
  const bases = [
    { label: "Push forward now", personality: "brave", stakes: "Fast move, high risk." },
    { label: "Scan for patterns", personality: "analytical", stakes: "Slower, better intel." },
    { label: "Secure safe route", personality: "defensive", stakes: "Safer, lose momentum." },
  ];
  return bases.map((choice, index) => ({
    id: `choice-${nanoid(8)}`,
    label: choice.label,
    icon: PERSONALITY_ICONS[choice.personality] ?? "🎭",
    stakes:
      index === stableIndex(seed, 3)
        ? `${choice.stakes} Rift pressure increasing.`
        : choice.stakes,
    personality: choice.personality as GMChoice["personality"],
    order: index,
  }));
}

export function buildLocalConsequenceSuggestion(context: LocalContext): string {
  const locked = context.lockedChoiceLabel ?? context.winningChoiceLabel ?? "that call";
  const freeform = context.freeformSnippets?.[0];
  const line1 = `Your crew commits to ${locked.toLowerCase()}.`;
  const line2 = "The room reacts instantly, like it was waiting for this decision.";
  const line3 = freeform
    ? `Someone's side idea still lingers: "${sanitizeFreeformInput(freeform)}".`
    : "No one agrees on what they just saw, but everyone felt it.";
  const line4 = "Before anyone can recover, a new threat takes shape ahead.";
  return [line1, line2, line3, line4].join("\n");
}
