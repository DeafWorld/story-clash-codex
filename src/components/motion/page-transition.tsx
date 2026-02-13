"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { MOTION_DURATIONS, MOTION_EASINGS } from "../../lib/motion/tokens";
import { useReducedMotionPreference } from "../../lib/motion/reduced-motion";

type PageTransitionProps = {
  children: React.ReactNode;
  className?: string;
};

export default function PageTransition({ children, className }: PageTransitionProps) {
  const reduced = useReducedMotionPreference();

  return (
    <motion.div
      className={clsx("relative z-10", className)}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.995 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: reduced ? MOTION_DURATIONS.short : MOTION_DURATIONS.scene,
        ease: MOTION_EASINGS.cinematicDrift,
      }}
    >
      {children}
    </motion.div>
  );
}
