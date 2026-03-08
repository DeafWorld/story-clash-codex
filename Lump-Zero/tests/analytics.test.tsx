import "@testing-library/jest-dom/vitest";
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildEvent, createAnalyticsAdapter } from "@factory/analytics";

describe("analytics adapter", () => {
  it("injects the Cloudflare beacon when manual mode is configured", () => {
    document.head.innerHTML = "";

    createAnalyticsAdapter({
      provider: "cloudflare",
      webAnalyticsMode: "manual",
      webAnalyticsToken: "cf-test-token"
    });

    const script = document.head.querySelector("script[data-factory-cloudflare-beacon='true']");
    expect(script).toBeInTheDocument();
    expect(script?.getAttribute("data-cf-beacon")).toContain("cf-test-token");
  });

  it("sends custom events through sendBeacon when an endpoint is configured", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon
    });

    const adapter = createAnalyticsAdapter({
      provider: "cloudflare",
      webAnalyticsMode: "pages",
      customEventEndpoint: "/analytics/events"
    });

    adapter.track(
      buildEvent({
        type: "tool_used",
        siteId: "cleaning-pricing",
        pageId: "cleaning-pricing-tool",
        detail: "deep:biweekly"
      })
    );

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe("/analytics/events");
  });
});
