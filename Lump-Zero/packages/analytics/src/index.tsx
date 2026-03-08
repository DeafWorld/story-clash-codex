import { createContext, useContext } from "react";
import type { AnalyticsEvent, AnalyticsRuntimeConfig } from "@factory/niche-config";

export interface AnalyticsAdapter {
  track: (event: AnalyticsEvent) => void;
}

const noopAdapter: AnalyticsAdapter = {
  track() {
    // Noop by default so static builds remain zero-cost.
  }
};

const AnalyticsContext = createContext<AnalyticsAdapter>(noopAdapter);

export function AnalyticsProvider({ adapter, children }: { adapter?: AnalyticsAdapter; children: React.ReactNode }) {
  return <AnalyticsContext.Provider value={adapter ?? noopAdapter}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function buildEvent(event: Omit<AnalyticsEvent, "timestamp">): AnalyticsEvent {
  return {
    ...event,
    timestamp: new Date().toISOString()
  };
}

export function createNoopAnalyticsAdapter(): AnalyticsAdapter {
  return noopAdapter;
}

function ensureCloudflareBeacon(token: string) {
  if (document.querySelector("script[data-factory-cloudflare-beacon='true']")) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.factoryCloudflareBeacon = "true";
  script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
  document.head.append(script);
}

export function createAnalyticsAdapter(config: AnalyticsRuntimeConfig): AnalyticsAdapter {
  if (config.provider === "noop") {
    return noopAdapter;
  }

  if (typeof document !== "undefined" && config.webAnalyticsMode === "manual" && config.webAnalyticsToken) {
    ensureCloudflareBeacon(config.webAnalyticsToken);
  }

  return {
    track(event) {
      if (!config.customEventEndpoint) {
        return;
      }

      const body = JSON.stringify(event);
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const payload = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(config.customEventEndpoint, payload);
        return;
      }

      void fetch(config.customEventEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body,
        keepalive: true
      });
    }
  };
}
