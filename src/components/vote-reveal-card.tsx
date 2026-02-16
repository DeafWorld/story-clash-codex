"use client";

import { motion } from "framer-motion";

type VoteRevealCardProps = {
  title: string;
  subtitle: string;
  detail: string;
  accentColor?: string;
};

export default function VoteRevealCard({ title, subtitle, detail, accentColor = "#67e8f9" }: VoteRevealCardProps) {
  return (
    <motion.section
      className="rounded-2xl border border-white/20 bg-black/30 p-5"
      initial={{ opacity: 0, rotateX: -55, y: 24 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ duration: 0.55, ease: [0.2, 0.92, 0.25, 1] }}
      style={{ transformOrigin: "50% 0%" }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Vote Result</p>
      <motion.h2
        className="mt-2 text-3xl font-black"
        animate={{ textShadow: [`0 0 0 ${accentColor}00`, `0 0 22px ${accentColor}66`, `0 0 0 ${accentColor}00`] }}
        transition={{ duration: 1.15, repeat: Infinity, repeatDelay: 0.6 }}
        style={{ color: accentColor }}
      >
        {title}
      </motion.h2>
      <p className="mt-2 text-sm font-semibold text-zinc-100">{subtitle}</p>
      <p className="mt-1 text-sm text-zinc-300">{detail}</p>
    </motion.section>
  );
}
