import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSiteContent } from "@factory/content-engine";
import { loadBrief } from "@factory/niche-config";

const runtime = {
  analytics: { provider: "noop" } as const,
  lastBuildAt: "2026-03-07T00:00:00.000Z"
};

describe("content engine", () => {
  it("builds the required Etsy route set", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/etsy-image-helper.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    expect(siteContent.pages.find((page) => page.type === "home")).toBeDefined();
    expect(siteContent.pages.find((page) => page.type === "tool")).toBeDefined();
    expect(siteContent.pages.filter((page) => page.type === "faq")).toHaveLength(6);
    expect(siteContent.pages.filter((page) => page.type === "guide")).toHaveLength(6);
    expect(siteContent.pages.filter((page) => page.type === "comparison")).toHaveLength(3);
    expect(siteContent.routes).toHaveLength(siteContent.pages.length);
    expect(new Set(siteContent.pages.map((page) => page.metaTitle)).size).toBe(siteContent.pages.length);
  });

  it("builds the cleaning pricing site without Etsy copy leakage", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/cleaning-pricing.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    expect(siteContent.pages).toHaveLength(20);
    expect(siteContent.tool.component).toBe("cleaning-pricing-estimator");
    expect(siteContent.navigation.map((item) => item.label)).toContain("Estimator");
    expect(siteContent.pages.some((page) => /etsy/i.test(page.title))).toBe(false);
    expect(siteContent.pages.find((page) => page.type === "resource")?.cta?.label).toMatch(/pricing checklist/i);
  });
});
