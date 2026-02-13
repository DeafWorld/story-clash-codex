"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import type { MotionCue } from "../../types/game";
import { cueToBand } from "../../lib/motion/orchestrator";
import { useReducedMotionPreference } from "../../lib/motion/reduced-motion";

type PressurePulseLayerProps = {
  cue?: MotionCue | null;
};

export default function PressurePulseLayer({ cue }: PressurePulseLayerProps) {
  const reduced = useReducedMotionPreference();
  const band = cueToBand(cue);

  if (reduced) {
    return null;
  }

  const duration = band === "critical" ? 1.4 : band === "rising" ? 2.8 : 4.6;
  const alpha = band === "critical" ? 0.22 : band === "rising" ? 0.16 : 0.1;

  return (
    <motion.div
      aria-hidden
      className={clsx("pointer-events-none absolute inset-0 z-0 mix-blend-screen", "motion-pressure-layer")}
      animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.03, 1] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      style={{
        background:
          band === "critical"
            ? `radial-gradient(circle at 50% 20%, rgba(255,59,59,${alpha}), transparent 55%)`
            : band === "rising"
              ? `radial-gradient(circle at 45% 15%, rgba(83,244,255,${alpha}), transparent 55%)`
              : `radial-gradient(circle at 50% 22%, rgba(173,198,255,${alpha}), transparent 62%)`,
      }}
    />
  );
}
