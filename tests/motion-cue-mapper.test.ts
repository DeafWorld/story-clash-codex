import { describe, expect, it } from "vitest";
import { cueToBand, intensityToBand, sceneMotionClass, transitionDurationFromCue } from "../src/lib/motion/orchestrator";
import { defaultMotionCue } from "../src/lib/narrative-director";

describe("motion cue mapper", () => {
  it("maps intensity thresholds to expected bands", () => {
    expect(intensityToBand(12)).toBe("calm");
    expect(intensityToBand(55)).toBe("rising");
    expect(intensityToBand(92)).toBe("critical");
  });

  it("falls back safely when cue is missing", () => {
    expect(cueToBand(null)).toBe("calm");
    expect(sceneMotionClass(undefined)).toBe("motion-band-calm");
  });

  it("uses transition style to derive durations", () => {
    const baseCue = defaultMotionCue();
    expect(transitionDurationFromCue(baseCue)).toBeGreaterThan(0.2);
    expect(
      transitionDurationFromCue({
        ...baseCue,
        transitionStyle: "hard_cut",
      })
    ).toBeLessThan(0.2);
  });
});
