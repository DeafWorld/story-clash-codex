import assert from "node:assert/strict";
import path from "node:path";
import { buildEvent, createAnalyticsAdapter } from "@factory/analytics";
import { buildSiteContent } from "@factory/content-engine";
import { loadBrief, type SiteRuntimeMeta } from "@factory/niche-config";
import { findBrokenInternalLinks, findDuplicateMetadata, findPlaceholderCopy } from "@factory/quality-checks";
import { aspectRatioLabel, calculateCleaningEstimate, calculateEtsyImageResult } from "@factory/tool-widgets";
import { scoreSite } from "./lib/factory.ts";

const runtime: SiteRuntimeMeta = {
  analytics: { provider: "noop" },
  lastBuildAt: "2026-03-07T00:00:00.000Z"
};

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await runTest("brief schema: etsy", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/etsy-image-helper.yaml"));
    assert.equal(brief.id, "etsy-image-helper");
    assert.equal(brief.content_plan.faq_topics.length, 6);
  });

  await runTest("brief schema: cleaning", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/cleaning-pricing.yaml"));
    assert.equal(brief.id, "cleaning-pricing");
    assert.equal(brief.site_config.tool.component, "cleaning-pricing-estimator");
  });

  await runTest("content engine: etsy route set", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/etsy-image-helper.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    assert.equal(siteContent.pages.filter((page) => page.type === "faq").length, 6);
    assert.equal(siteContent.pages.filter((page) => page.type === "guide").length, 6);
    assert.equal(siteContent.pages.filter((page) => page.type === "comparison").length, 3);
    assert.equal(siteContent.routes.length, siteContent.pages.length);
  });

  await runTest("content engine: cleaning route set", async () => {
    const brief = await loadBrief(path.resolve("data/niche-briefs/cleaning-pricing.yaml"));
    const siteContent = await buildSiteContent(brief, runtime);

    assert.equal(siteContent.pages.length, 20);
    assert.equal(siteContent.tool.component, "cleaning-pricing-estimator");
    assert.equal(siteContent.pages.some((page) => /etsy/i.test(page.title)), false);
  });

  await runTest("quality checks: both sites", async () => {
    for (const briefName of ["etsy-image-helper", "cleaning-pricing"]) {
      const brief = await loadBrief(path.resolve(`data/niche-briefs/${briefName}.yaml`));
      const siteContent = await buildSiteContent(brief, runtime);

      assert.equal(findDuplicateMetadata(siteContent.pages).length, 0);
      assert.equal(findBrokenInternalLinks(siteContent).length, 0);
      assert.equal(findPlaceholderCopy(siteContent.pages).length, 0);
    }
  });

  await runTest("etsy calculator", async () => {
    assert.equal(aspectRatioLabel(1600, 400), "4:1");
    const result = calculateEtsyImageResult({
      presetId: "big-banner",
      width: 2200,
      height: 400,
      cropPreference: "center"
    });

    assert.equal(result.targetWidth, 1600);
    assert.equal(result.targetHeight, 400);
    assert.match(result.cropGuidance, /width/i);
  });

  await runTest("cleaning calculator", async () => {
    const result = calculateCleaningEstimate({
      squareFootage: 1500,
      bedrooms: 3,
      bathrooms: 2,
      serviceType: "deep",
      frequency: "biweekly",
      addOns: ["fridge", "oven"]
    });

    assert.ok(result.highEstimate > result.lowEstimate);
    assert.match(result.summary, /average target/i);
  });

  await runTest("scorecards recommend launch", async () => {
    for (const briefName of ["etsy-image-helper", "cleaning-pricing"]) {
      const brief = await loadBrief(path.resolve(`data/niche-briefs/${briefName}.yaml`));
      const siteContent = await buildSiteContent(brief, runtime);
      const scorecard = scoreSite(siteContent);
      assert.equal(scorecard.recommendation, "launch");
    }
  });

  await runTest("analytics adapter", async () => {
    const appendedNodes: Array<{
      defer?: boolean;
      src?: string;
      dataset: Record<string, string>;
      attributes: Record<string, string>;
      setAttribute: (name: string, value: string) => void;
    }> = [];

    const documentStub = {
      querySelector(selector: string) {
        if (selector === "script[data-factory-cloudflare-beacon='true']") {
          return appendedNodes.find((node) => node.dataset.factoryCloudflareBeacon === "true") ?? null;
        }
        return null;
      },
      createElement() {
        return {
          dataset: {} as Record<string, string>,
          attributes: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            this.attributes[name] = value;
          }
        };
      },
      head: {
        append(node: (typeof appendedNodes)[number]) {
          appendedNodes.push(node);
        }
      }
    };

    const beaconCalls: Array<{ url: string; payload: unknown }> = [];

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: documentStub
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: {
        sendBeacon(url: string, payload: unknown) {
          beaconCalls.push({ url, payload });
          return true;
        }
      }
    });

    createAnalyticsAdapter({
      provider: "cloudflare",
      webAnalyticsMode: "manual",
      webAnalyticsToken: "cf-test-token"
    });

    const script = appendedNodes[0];
    assert.ok(script);
    assert.match(script.attributes["data-cf-beacon"] ?? "", /cf-test-token/);

    const adapter = createAnalyticsAdapter({
      provider: "cloudflare",
      webAnalyticsMode: "pages",
      customEventEndpoint: "/analytics/events"
    });

    adapter.track(
      buildEvent({
        type: "tool_used",
        siteId: "cleaning-pricing",
        pageId: "tool",
        detail: "deep"
      })
    );

    assert.equal(beaconCalls.length, 1);
    assert.equal(beaconCalls[0]?.url, "/analytics/events");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
