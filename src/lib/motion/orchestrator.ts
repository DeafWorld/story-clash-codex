import type { MotionCue } from "../../types/game";
import type { MotionIntensityBand } from "./tokens";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function intensityToBand(intensity: number): MotionIntensityBand {
  const normalized = clamp(Math.round(intensity), 0, 100);
  if (normalized >= 72) {
    return "critical";
  }
  if (normalized >= 40) {
    return "rising";
  }
  return "calm";
}

export function cueToBand(cue: MotionCue | null | undefined): MotionIntensityBand {
  if (!cue) {
    return "calm";
  }
  return intensityToBand(cue.intensity);
}

export function transitionDurationFromCue(cue: MotionCue | null | undefined) {
  if (!cue) {
    return 0.22;
  }
  if (cue.transitionStyle === "hard_cut") {
    return 0.14;
  }
  if (cue.transitionStyle === "surge") {
    return 0.34;
  }
  return 0.24;
}

export function sceneMotionClass(cue: MotionCue | null | undefined) {
  const band = cueToBand(cue);
  if (!cue) {
    return "motion-band-calm";
  }
  if (cue.beat === "fracture") {
    return "motion-band-fracture";
  }
  if (cue.beat === "payoff") {
    return "motion-band-payoff";
  }
  if (cue.beat === "cooldown") {
    return "motion-band-cooldown";
  }
  if (band === "critical") {
    return "motion-band-critical";
  }
  if (band === "rising") {
    return "motion-band-rising";
  }
  return "motion-band-calm";
}
