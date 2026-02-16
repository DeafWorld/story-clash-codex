"use client";

import { motion } from "framer-motion";

type ChoiceTimerProps = {
  seconds: number;
  maxSeconds?: number;
};

function tone(percentage: number) {
  if (percentage > 66) {
    return { color: "#39ff14", label: "Steady" };
  }
  if (percentage > 33) {
    return { color: "#ffd166", label: "Pressure rising" };
  }
  return { color: "#ff4d6d", label: "Decide now" };
}

export default function ChoiceTimer({ seconds, maxSeconds = 30 }: ChoiceTimerProps) {
  const clampedSeconds = Math.max(0, Math.min(maxSeconds, seconds));
  const percentage = (clampedSeconds / maxSeconds) * 100;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percentage / 100);
  const status = tone(percentage);

  return (
    <div className="rounded-2xl border border-white/20 bg-black/30 px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="relative h-[92px] w-[92px]">
          <svg width="92" height="92" viewBox="0 0 92 92" className="block">
            <circle cx="46" cy="46" r={radius} fill="none" stroke="rgba(173,198,255,0.2)" strokeWidth="7" />
            <motion.circle
              cx="46"
              cy="46"
              r={radius}
              fill="none"
              stroke={status.color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 46 46)"
              animate={{ strokeDashoffset: dashOffset, stroke: status.color }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <strong className="text-2xl font-black" style={{ color: status.color }}>
              {clampedSeconds}
            </strong>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Choice Timer</p>
          <p className="text-sm font-semibold" style={{ color: status.color }}>
            {status.label}
          </p>
          <p className="text-xs text-zinc-400">All eyes are on this turn.</p>
        </div>
      </div>

      {percentage <= 20 ? (
        <motion.p
          className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-rose-300"
          animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.03, 1] }}
          transition={{ duration: 0.7, repeat: Infinity }}
        >
          Time is collapsing
        </motion.p>
      ) : null}
    </div>
  );
}
