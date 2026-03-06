"use client";

import { motion } from "framer-motion";

type ChoiceTimerProps = {
  secondsLeft: number;
  maxSeconds: number;
};

function colorForPercent(percent: number) {
  if (percent > 66) return "#34d399";
  if (percent > 33) return "#f59e0b";
  return "#ef4444";
}

export default function ChoiceTimer({ secondsLeft, maxSeconds }: ChoiceTimerProps) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / Math.max(1, maxSeconds)) * 100));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const stroke = colorForPercent(pct);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-black/25 px-3 py-2">
      <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden>
        <circle cx="27" cy="27" r={radius} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="5" />
        <motion.circle
          cx="27"
          cy="27"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: offset }}
          initial={false}
          transform="rotate(-90 27 27)"
          transition={{ duration: 0.3 }}
        />
      </svg>
      <div className="leading-tight">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Vote timer</p>
        <p className="text-lg font-bold" style={{ color: stroke }}>
          {secondsLeft}s
        </p>
      </div>
      {pct < 20 ? (
        <motion.p
          className="ml-auto rounded-lg bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-100"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          Hurry
        </motion.p>
      ) : null}
    </div>
  );
}
