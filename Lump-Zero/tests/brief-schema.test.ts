import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBrief } from "@factory/niche-config";

describe("niche brief schema", () => {
  it("parses the Etsy image helper brief", async () => {
    const briefPath = path.resolve("data/niche-briefs/etsy-image-helper.yaml");
    const brief = await loadBrief(briefPath);

    expect(brief.id).toBe("etsy-image-helper");
    expect(brief.content_plan.faq_topics).toHaveLength(6);
    expect(brief.constraints).toContain("static only");
  });

  it("parses the cleaning pricing brief with site config overrides", async () => {
    const briefPath = path.resolve("data/niche-briefs/cleaning-pricing.yaml");
    const brief = await loadBrief(briefPath);

    expect(brief.id).toBe("cleaning-pricing");
    expect(brief.site_config.cta_labels.primary).toMatch(/pricing estimator/i);
    expect(brief.site_config.tool.component).toBe("cleaning-pricing-estimator");
    expect(brief.site_config.theme?.accent).toBe("#2b7a53");
  });
});
