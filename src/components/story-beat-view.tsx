"use client";

import { motion } from "framer-motion";

type StoryBeatViewProps = {
  text: string;
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

export default function StoryBeatView({ text }: StoryBeatViewProps) {
  const beats = toBeats(text);

  return (
    <div className="space-y-3">
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
            <div className="mx-auto w-20 border-t border-white/20" aria-hidden />
          ) : null}
        </div>
      ))}
    </div>
  );
}
