"use client";

import clsx from "clsx";
import type { GenrePower, RiftEventRecord } from "../types/game";

type RiftStatusCardProps = {
  genrePower: GenrePower;
  chaosLevel: number;
  activeEvent?: RiftEventRecord | null;
  compact?: boolean;
  className?: string;
};

const GENRE_META: Array<{ key: keyof GenrePower; label: string; tint: string }> = [
  { key: "zombie", label: "Outbreak", tint: "bg-lime-400" },
  { key: "alien", label: "Invasion", tint: "bg-cyan-400" },
  { key: "haunted", label: "Haunting", tint: "bg-violet-300" },
];

function chaosTone(level: number): string {
  if (level >= 80) {
    return "text-red-300";
  }
  if (level >= 60) {
    return "text-orange-300";
  }
  if (level >= 40) {
    return "text-yellow-200";
  }
  return "text-emerald-200";
}

export default function RiftStatusCard({
  genrePower,
  chaosLevel,
  activeEvent = null,
  compact = false,
  className,
}: RiftStatusCardProps) {
  return (
    <section className={clsx("rounded-2xl border border-white/15 bg-black/25 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300">Rift Core</h2>
        <span className={clsx("text-sm font-semibold", chaosTone(chaosLevel))}>Chaos {chaosLevel}%</span>
      </div>

      <div className="mb-4 h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-red-400 transition-all duration-500"
          style={{ width: `${Math.max(6, Math.min(chaosLevel, 100))}%` }}
        />
      </div>

      <div className={clsx("space-y-2", compact ? "text-xs" : "text-sm")}>
        {GENRE_META.map((genre) => (
          <div key={genre.key} className="space-y-1">
            <div className="flex items-center justify-between text-zinc-200">
              <span>{genre.label}</span>
              <span className="font-semibold">{genrePower[genre.key]}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div
                className={clsx("h-2 rounded-full transition-all duration-500", genre.tint)}
                style={{ width: `${Math.max(4, Math.min(genrePower[genre.key], 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {activeEvent ? (
        <div
          className={clsx(
            "mt-4 rounded-xl border px-3 py-3 text-sm",
            activeEvent.type === "scene_twist"
              ? "border-red-300/55 bg-red-500/15"
              : "border-cyan-300/55 bg-cyan-500/15"
          )}
        >
          <p className="font-semibold text-white">{activeEvent.title}</p>
          <p className="mt-1 text-zinc-100">{activeEvent.description}</p>
        </div>
      ) : null}
    </section>
  );
}
