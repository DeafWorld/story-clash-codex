"use client";

import { motion } from "framer-motion";

type RealityRemembersProps = {
  line: string | null;
};

export default function RealityRemembers({ line }: RealityRemembersProps) {
  if (!line) {
    return null;
  }

  return (
    <motion.div
      className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <span className="font-semibold">Reality remembers:</span> {line}
    </motion.div>
  );
}
