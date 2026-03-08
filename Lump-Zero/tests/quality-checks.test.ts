import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSiteContent } from "@factory/content-engine";
import { loadBrief, type PageManifest } from "@factory/niche-config";
import { findBrokenInternalLinks, findDuplicateMetadata, findPlaceholderCopy } from "@factory/quality-checks";

const runtime = {
  analytics: { provider: "noop" } as const,
  lastBuildAt: "2026-03-07T00:00:00.000Z"
};

describe("quality checks", () => {
  it("passes the generated Etsy sample content", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/etsy-image-helper.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    expect(findDuplicateMetadata(siteContent.pages)).toHaveLength(0);
    expect(findBrokenInternalLinks(siteContent)).toHaveLength(0);
    expect(findPlaceholderCopy(siteContent.pages)).toHaveLength(0);
  });

  it("passes the generated cleaning pricing content", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/cleaning-pricing.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    expect(findDuplicateMetadata(siteContent.pages)).toHaveLength(0);
    expect(findBrokenInternalLinks(siteContent)).toHaveLength(0);
    expect(findPlaceholderCopy(siteContent.pages)).toHaveLength(0);
  });

  it("catches duplicate metadata", () => {
    const page: PageManifest = {
      id: "one",
      type: "faq",
      slug: "one",
      href: "/one/",
      title: "One",
      description: "One",
      heroKicker: "Test",
      heroTitle: "One",
      heroIntro: "One",
      metaTitle: "Duplicate",
      metaDescription: "Duplicate",
      sections: [],
      relatedLinks: []
    };

    expect(findDuplicateMetadata([page, { ...page, id: "two", href: "/two/" }])).toHaveLength(2);
  });
});
