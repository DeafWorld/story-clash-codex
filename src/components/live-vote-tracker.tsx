"use client";

import { motion } from "framer-motion";

type VoteOption = {
  id: string;
  label: string;
  color: string;
};

type PlayerLite = {
  id: string;
  name: string;
};

type LiveVoteTrackerProps = {
  players: PlayerLite[];
  picks: Record<string, string>;
  options: VoteOption[];
  title?: string;
};

function optionById(options: VoteOption[], id: string | undefined): VoteOption | null {
  if (!id) {
    return null;
  }
  return options.find((entry) => entry.id === id) ?? null;
}

export default function LiveVoteTracker({ players, picks, options, title = "Crew lock-in" }: LiveVoteTrackerProps) {
  const lockedCount = players.filter((player) => Boolean(picks[player.id])).length;
  const progress = players.length > 0 ? (lockedCount / players.length) * 100 : 0;

  return (
    <section className="panel w-full max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</p>
        <p className="text-xs font-semibold text-cyan-200">
          {lockedCount}/{players.length} locked
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full bg-cyan-300"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {players.map((player) => {
          const selected = optionById(options, picks[player.id]);
          return (
            <motion.div
              key={player.id}
              layout
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2"
              animate={{
                borderColor: selected ? "rgba(83,244,255,0.6)" : "rgba(255,255,255,0.2)",
                backgroundColor: selected ? "rgba(9,27,35,0.72)" : "rgba(6,10,18,0.45)",
              }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm font-semibold text-zinc-100">{player.name}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {selected ? (
                  <span>
                    Locked: <span style={{ color: selected.color }}>{selected.label}</span>
                  </span>
                ) : (
                  "Choosing..."
                )}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
