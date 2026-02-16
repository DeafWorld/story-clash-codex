"use client";

import { motion } from "framer-motion";
import type { GenreId } from "../types/game";

type StoryBeatViewProps = {
  text: string;
  sceneId?: string;
  storyTitle?: string | null;
  genre?: GenreId | null;
};

type BeatKind = "dialogue" | "action" | "text";

type Beat = {
  id: string;
  kind: BeatKind;
  lines: string[];
  icon: string;
};

function classify(lines: string[]): { kind: BeatKind; icon: string } {
  const joined = lines.join(" ").toLowerCase();
  if (/"|whisper|says|voice|speaks|radio/.test(joined)) {
    return { kind: "dialogue", icon: "💬" };
  }
  if (/blood|scream|slam|roar|drag|footprints|fire|gun|collapse|shock|crawl/.test(joined)) {
    return { kind: "action", icon: "⚠️" };
  }
  return { kind: "text", icon: "•" };
}

function toBeats(text: string): Beat[] {
  const rawLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: string[][] = [];
  let current: string[] = [];

  for (const line of rawLines) {
    if (current.length >= 2 || line.length > 95) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.map((lines, index) => {
    const mapped = classify(lines);
    return {
      id: `beat-${index}`,
      kind: mapped.kind,
      icon: mapped.icon,
      lines,
    };
  });
}

function containerClass(kind: BeatKind): string {
  if (kind === "dialogue") {
    return "border-cyan-300/35 bg-cyan-500/10";
  }
  if (kind === "action") {
    return "border-rose-300/35 bg-rose-500/10";
  }
  return "border-white/15 bg-black/20";
}

const GENRE_ICON: Record<GenreId, string> = {
  zombie: "🧟",
  alien: "🛸",
  haunted: "🏚️",
};

const SCENE_LOCATION: Record<GenreId, Record<string, string>> = {
  zombie: {
    start: "Emergency Wing",
    armed: "Supply Corridor",
    exit_attempt: "Fire Exit Block",
    kitchen: "Service Kitchen",
    stairwell: "North Stairwell",
    rooftop: "Rooftop Edge",
    checkpoint_twist: "Quarantine Checkpoint",
    ending_triumph: "Escape Highway",
    ending_survival: "Safe Zone Gate",
    ending_doom: "Collapsed Roofline",
  },
  alien: {
    start: "City Core",
    subway: "Subway Shelter",
    control_room: "Emergency Comms",
    echo_chamber: "Echo Tunnel",
    reactor: "Reactor Chamber",
    uplink_spire: "Uplink Spire",
    ending_triumph: "Skyline Break",
    ending_survival: "Blast Perimeter",
    ending_doom: "Control Core",
  },
  haunted: {
    start: "Front Hall",
    library: "Locked Library",
    attic: "Attic Landing",
    chapel: "Chapel Mirror",
    undercroft: "Undercroft",
    ritual_vault: "Ritual Vault",
    ending_triumph: "Manor Exit",
    ending_survival: "Oath Gate",
    ending_doom: "Sealed Entry",
  },
};

function resolveLocation(genre: GenreId | null | undefined, sceneId: string | undefined): string {
  if (!genre || !sceneId) {
    return "Unknown Location";
  }
  return SCENE_LOCATION[genre]?.[sceneId] ?? sceneId.replaceAll("_", " ");
}

export default function StoryBeatView({ text, sceneId, storyTitle, genre }: StoryBeatViewProps) {
  const beats = toBeats(text);
  const headerIcon = genre ? GENRE_ICON[genre] : "⚡";
  const headerTitle = storyTitle ?? "Story Clash";
  const headerLocation = resolveLocation(genre, sceneId);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/15 bg-black/25 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          {headerIcon} {headerTitle}
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-100">{headerLocation}</p>
      </div>
      {beats.map((beat, index) => (
        <div key={beat.id} className="space-y-3">
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: Math.min(index * 0.04, 0.24) }}
            className={`rounded-xl border p-4 ${containerClass(beat.kind)}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg" aria-hidden>
                {beat.icon}
              </span>
              <div className="min-w-0 space-y-1">
                {beat.lines.map((line, lineIndex) => (
                  <p key={`${beat.id}-line-${lineIndex}`} className="text-base leading-7 text-zinc-100 sm:text-lg sm:leading-8">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </motion.article>
          {index < beats.length - 1 ? (
            <div className="mx-auto w-28 text-center text-xs tracking-[0.28em] text-white/35" aria-hidden>
              ━━━
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
