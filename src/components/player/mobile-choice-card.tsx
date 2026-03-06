"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import type { GMChoice } from "../../types/game";

type MobileChoiceCardProps = {
  choice: GMChoice;
  index: number;
  voteCount: number;
  totalVotes: number;
  voterNames: string[];
  selected: boolean;
  disabled?: boolean;
  onSelect: (choiceId: string) => void;
};

function personalityColor(personality: GMChoice["personality"], index: number) {
  if (personality === "brave") return "from-red-500/30 to-red-700/35";
  if (personality === "analytical") return "from-cyan-500/30 to-blue-700/35";
  if (personality === "defensive") return "from-emerald-500/30 to-emerald-700/35";
  if (personality === "chaotic") return "from-fuchsia-500/30 to-purple-700/35";
  if (personality === "empathetic") return "from-amber-400/30 to-orange-700/35";
  if (personality === "opportunistic") return "from-yellow-500/25 to-lime-700/35";
  return index % 2 === 0 ? "from-cyan-500/25 to-blue-700/35" : "from-fuchsia-500/25 to-purple-700/35";
}

export default function MobileChoiceCard({
  choice,
  index,
  voteCount,
  totalVotes,
  voterNames,
  selected,
  disabled,
  onSelect,
}: MobileChoiceCardProps) {
  const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={() => onSelect(choice.id)}
      disabled={disabled}
      className={clsx(
        "w-full min-h-[72px] rounded-xl border px-4 py-3 text-left transition",
        "bg-gradient-to-br",
        personalityColor(choice.personality, index),
        selected ? "border-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.25)]" : "border-white/20",
        disabled ? "cursor-not-allowed opacity-85" : "hover:border-white/45"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">
            <span className="mr-2">{choice.icon}</span>
            {choice.label}
          </p>
          <p className="mt-1 text-xs text-zinc-200">{choice.stakes ?? "No clear downside."}</p>
        </div>
        {selected ? <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[11px] text-cyan-100">Your vote</span> : null}
      </div>

      <div className="mt-2 space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full bg-cyan-300"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-[11px] text-zinc-300">
          {voteCount} vote{voteCount === 1 ? "" : "s"} {voterNames.length ? `• ${voterNames.join(", ")}` : ""}
        </p>
      </div>
    </motion.button>
  );
}
