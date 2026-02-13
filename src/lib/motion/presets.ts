import type { Variants } from "framer-motion";
import type { CSSProperties } from "react";
import type { MotionIntensityBand } from "./tokens";
import { MOTION_DURATIONS, MOTION_EASINGS, MOTION_INTENSITY_MULTIPLIER, MOTION_STAGGER } from "./tokens";

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATIONS.scene, ease: MOTION_EASINGS.cinematicDrift },
  },
};

export const heroRevealVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATIONS.hero, ease: MOTION_EASINGS.cinematicDrift },
  },
};

export const staggerListVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.listItems,
      delayChildren: 0.02,
    },
  },
};

export const cardRevealVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATIONS.short, ease: MOTION_EASINGS.snappy },
  },
};

export function pressureMotionCssVars(input: {
  band: MotionIntensityBand;
  intensity: number;
}) {
  const normalizedIntensity = Math.max(0, Math.min(100, input.intensity));
  const multiplier = MOTION_INTENSITY_MULTIPLIER[input.band];

  return {
    "--motion-intensity": `${normalizedIntensity}`,
    "--motion-multiplier": `${multiplier}`,
    "--motion-pulse-alpha": `${(0.08 + normalizedIntensity * 0.0035 * multiplier).toFixed(3)}`,
    "--motion-shimmer-alpha": `${(0.06 + normalizedIntensity * 0.0028 * multiplier).toFixed(3)}`,
  } as CSSProperties;
}
