"use client";

import { trackEvent } from "../analytics";

type MotionPerfSample = {
  route: string;
  effectProfile: string;
  fps: number;
  longFrameRate: number;
};

type PerfRunOptions = {
  route: string;
  effectProfile: string;
  durationMs?: number;
};

let monitorTimer: number | null = null;

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
  let prev = performance.now();
  const start = prev;

  const tick = (now: number) => {
    const dt = now - prev;
    prev = now;
    frames += 1;
    if (dt > 22) {
      longFrames += 1;
    }

    if (now - start >= durationMs) {
      const seconds = (now - start) / 1000;
      const sample: MotionPerfSample = {
        route: options.route,
        effectProfile: options.effectProfile,
        fps: seconds > 0 ? Number((frames / seconds).toFixed(1)) : 0,
        longFrameRate: frames > 0 ? Number(((longFrames / frames) * 100).toFixed(1)) : 0,
      };
      trackEvent("motion_perf_sample", sample);
      monitorTimer = null;
      return;
    }

    monitorTimer = window.requestAnimationFrame(tick);
  };

  monitorTimer = window.requestAnimationFrame(tick);
}
