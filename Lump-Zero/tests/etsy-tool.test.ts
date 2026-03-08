import { describe, expect, it } from "vitest";
import { aspectRatioLabel, calculateEtsyImageResult } from "@factory/tool-widgets";

describe("etsy tool calculations", () => {
  it("keeps aspect-ratio labels compact", () => {
    expect(aspectRatioLabel(1600, 400)).toBe("4:1");
    expect(aspectRatioLabel(2000, 2000)).toBe("1:1");
  });

  it("flags risky files below the safe minimum", () => {
    const result = calculateEtsyImageResult({
      presetId: "big-banner",
      width: 900,
      height: 200,
      cropPreference: "center"
    });

    expect(result.qualityStatus).toBe("risky");
    expect(result.qualityWarning).toContain("safer minimum");
  });

  it("returns usable crop guidance for a wide source", () => {
    const result = calculateEtsyImageResult({
      presetId: "big-banner",
      width: 2200,
      height: 400,
      cropPreference: "center"
    });

    expect(result.cropGuidance).toContain("width");
    expect(result.targetWidth).toBe(1600);
    expect(result.targetHeight).toBe(400);
  });
});
