import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSiteContent } from "@factory/content-engine";
import { loadBrief } from "@factory/niche-config";
import { scoreSite } from "../scripts/lib/factory.ts";

const runtime = {
  analytics: { provider: "noop" } as const,
  lastBuildAt: "2026-03-07T00:00:00.000Z"
};

describe("scorecard thresholds", () => {
  it("recommends launch for the Etsy sample", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/etsy-image-helper.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);
    const scorecard = scoreSite(siteContent);

    expect(scorecard.recommendation).toBe("launch");
    expect(scorecard.staticFeasibility).toBe(10);
    expect(scorecard.maintenanceBurden).toBeLessThanOrEqual(4);
  });

  it("recommends launch for the cleaning pricing sample", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/cleaning-pricing.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);
    const scorecard = scoreSite(siteContent);

    expect(scorecard.recommendation).toBe("launch");
    expect(scorecard.problemUrgency).toBeGreaterThanOrEqual(8);
    expect(scorecard.toolUsefulness).toBeGreaterThanOrEqual(9);
  });
});
