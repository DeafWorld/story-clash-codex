"use client";

import clsx from "clsx";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { MotionCue } from "../../types/game";
import { sceneMotionClass } from "../../lib/motion/orchestrator";
import { pressureMotionCssVars } from "../../lib/motion/presets";
import { cueToBand } from "../../lib/motion/orchestrator";
import { MOTION_FLAGS } from "../../lib/motion/tokens";
import { likelyAssetsForRoute, preloadMotionAssets } from "../../lib/motion/asset-registry";
import { startMotionPerfMonitor } from "../../lib/motion/perf-monitor";
import PageTransition from "./page-transition";
import ParallaxField from "./parallax-field";
import PressurePulseLayer from "./pressure-pulse-layer";

type SceneShellProps = {
  cue?: MotionCue | null;
  className?: string;
  children: React.ReactNode;
  withParallax?: boolean;
};

export default function SceneShell({ cue, className, children, withParallax = true }: SceneShellProps) {
  const pathname = usePathname();
  const band = cueToBand(cue);
  const intensity = cue?.intensity ?? 24;

  useEffect(() => {
    if (!MOTION_FLAGS.enabled || !pathname) {
      return;
    }
    void preloadMotionAssets(likelyAssetsForRoute(pathname));
    startMotionPerfMonitor({
      route: pathname,
      effectProfile: cue?.effectProfile ?? "rift_drift",
    });
  }, [pathname, cue?.effectProfile]);

  return (
    <main
      className={clsx("page-shell", sceneMotionClass(cue), className)}
      style={pressureMotionCssVars({ band, intensity })}
    >
      {MOTION_FLAGS.enabled && withParallax ? <ParallaxField /> : null}
      {MOTION_FLAGS.enabled ? <PressurePulseLayer cue={cue} /> : null}
      <PageTransition>{children}</PageTransition>
    </main>
  );
}
