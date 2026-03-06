"use client";

import { trackEvent } from "../analytics";

type MotionPerfSample = {
  route: string;
  effectProfile: string;
  fps: number;
  p95FrameMs: number;
  longFrameRate: number;
  memoryGrowthMb: number | null;
};

type PerfRunOptions = {
  route: string;
  effectProfile: string;
  durationMs?: number;
};

let monitorTimer: number | null = null;
const DEFAULT_P95_FRAME_MS_BUDGET = 16.7;
const DEFAULT_LONG_FRAME_RATE_BUDGET = 12;
const DEFAULT_MEMORY_GROWTH_MB_BUDGET = 32;

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number((sorted[index] ?? 0).toFixed(2));
}

export function stopMotionPerfMonitor() {
  if (monitorTimer) {
    window.cancelAnimationFrame(monitorTimer);
    monitorTimer = null;
  }
}

export function startMotionPerfMonitor(options: PerfRunOptions) {
  if (typeof window === "undefined") {
    return;
  }
  stopMotionPerfMonitor();

  const durationMs = options.durationMs ?? 3200;
  let frames = 0;
  let longFrames = 0;
  const frameTimes: number[] = [];
  let prev = performance.now();
  const start = prev;
  const perfMemory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const startHeapBytes = typeof perfMemory?.usedJSHeapSize === "number" ? perfMemory.usedJSHeapSize : null;

  const tick = (now: number) => {
    const dt = now - prev;
    prev = now;
    frames += 1;
    frameTimes.push(dt);
    if (dt > 22) {
      longFrames += 1;
    }

    if (now - start >= durationMs) {
      const seconds = (now - start) / 1000;
      const endHeapBytes =
        typeof (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize === "number"
          ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory!.usedJSHeapSize!
          : null;
      const memoryGrowthMb =
        startHeapBytes !== null && endHeapBytes !== null ? Number(((endHeapBytes - startHeapBytes) / (1024 * 1024)).toFixed(2)) : null;
      const sample: MotionPerfSample = {
        route: options.route,
        effectProfile: options.effectProfile,
        fps: seconds > 0 ? Number((frames / seconds).toFixed(1)) : 0,
        p95FrameMs: percentile(frameTimes, 95),
        longFrameRate: frames > 0 ? Number(((longFrames / frames) * 100).toFixed(1)) : 0,
        memoryGrowthMb,
      };
      trackEvent("motion_perf_sample", sample);
      const breached =
        sample.p95FrameMs > DEFAULT_P95_FRAME_MS_BUDGET ||
        sample.longFrameRate > DEFAULT_LONG_FRAME_RATE_BUDGET ||
        (sample.memoryGrowthMb !== null && sample.memoryGrowthMb > DEFAULT_MEMORY_GROWTH_MB_BUDGET);
      if (breached) {
        trackEvent("perf_budget_breach", {
          ...sample,
          budgets: {
            p95FrameMs: DEFAULT_P95_FRAME_MS_BUDGET,
            longFrameRate: DEFAULT_LONG_FRAME_RATE_BUDGET,
            memoryGrowthMb: DEFAULT_MEMORY_GROWTH_MB_BUDGET,
          },
        });
      }
      monitorTimer = null;
      return;
    }

    monitorTimer = window.requestAnimationFrame(tick);
  };

  monitorTimer = window.requestAnimationFrame(tick);
}
