"use client";

import { motion } from "framer-motion";
import type { GMChoice } from "../../types/game";

type VoteRevealProps = {
  choice: GMChoice | null;
  votes: number;
};

export default function VoteReveal({ choice, votes }: VoteRevealProps) {
  if (!choice) {
    return null;
  }

  return (
    <motion.section
      className="panel space-y-2 p-5 text-center"
      initial={{ opacity: 0, rotateX: -65, y: 8 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-fuchsia-200">Vote locked</p>
      <p className="text-2xl font-black text-white">
        <span className="mr-2">{choice.icon}</span>
        {choice.label}
      </p>
      <p className="text-sm text-zinc-300">{votes} vote{votes === 1 ? "" : "s"} secured this action.</p>
    </motion.section>
  );
}
