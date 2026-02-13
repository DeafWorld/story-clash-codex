export type MotionIntensityBand = "calm" | "rising" | "critical";

export const MOTION_DURATIONS = {
  micro: 0.12,
  short: 0.22,
  scene: 0.46,
  hero: 0.8,
} as const;

export const MOTION_EASINGS = {
  snappy: [0.2, 0.95, 0.23, 1] as const,
  cinematicDrift: [0.22, 0.1, 0.25, 1] as const,
  impact: [0.18, 0.9, 0.2, 1] as const,
} as const;

export const MOTION_SPRINGS = {
  uiSnap: { type: "spring", stiffness: 380, damping: 32, mass: 0.55 } as const,
  heavyInertia: { type: "spring", stiffness: 160, damping: 20, mass: 0.9 } as const,
  float: { type: "spring", stiffness: 120, damping: 22, mass: 0.8 } as const,
} as const;

export const MOTION_STAGGER = {
  cards: 0.045,
  listItems: 0.06,
  buttons: 0.075,
} as const;

export const MOTION_INTENSITY_MULTIPLIER: Record<MotionIntensityBand, number> = {
  calm: 0.75,
  rising: 1,
  critical: 1.22,
};

export const MOTION_FLAGS = {
  enabled: process.env.NEXT_PUBLIC_ENABLE_MOTION_SYSTEM !== "0",
  profile: process.env.NEXT_PUBLIC_MOTION_PROFILE?.trim().toLowerCase() ?? "cinematic_rift",
  enableRive: process.env.NEXT_PUBLIC_ENABLE_RIVE !== "0",
  enableLottie: process.env.NEXT_PUBLIC_ENABLE_LOTTIE !== "0",
} as const;
