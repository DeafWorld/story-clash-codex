"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotionPreference } from "../lib/motion/reduced-motion";
import type { RiftEventRecord } from "../types/game";

type RiftVisualTier = "high" | "medium" | "low";

type RiftImmersionLayerProps = {
  event: RiftEventRecord | null;
  chaosLevel: number;
  sceneId: string;
  tier?: RiftVisualTier;
  interactionBusy?: boolean;
  onOverlayRendered?: (event: RiftEventRecord) => void;
  onOverlayFallback?: (event: RiftEventRecord) => void;
  onOverlayResolved?: (event: RiftEventRecord) => void;
};

type RiftStage = "idle" | "phase1" | "prelude" | "phase2" | "phase3" | "phase4";

function accentForEvent(event: RiftEventRecord): string {
  if (event.type === "rift_reality_fracture") {
    return "#ff4d6d";
  }
  if (event.targetGenre === "zombie") {
    return "#57ff3a";
  }
  if (event.targetGenre === "alien") {
    return "#53f4ff";
  }
  if (event.targetGenre === "haunted") {
    return "#d0a4ff";
  }
  return "#d946ef";
}

function burstCountForTier(tier: RiftVisualTier): number {
  if (tier === "high") {
    return 52;
  }
  if (tier === "medium") {
    return 32;
  }
  return 14;
}

function driftCountForTier(tier: RiftVisualTier): number {
  if (tier === "high") {
    return 16;
  }
  if (tier === "medium") {
    return 10;
  }
  return 0;
}

function accentStyle(color: string): CSSProperties {
  return { ["--rift-accent" as string]: color };
}

export default function RiftImmersionLayer({
  event,
  chaosLevel,
  sceneId,
  tier = "high",
  interactionBusy = false,
  onOverlayRendered,
  onOverlayFallback,
  onOverlayResolved,
}: RiftImmersionLayerProps) {
  const reducedMotion = useReducedMotionPreference();
  const [stage, setStage] = useState<RiftStage>(chaosLevel >= 52 ? "phase1" : "idle");
  const [bannerVisible, setBannerVisible] = useState(false);
  const [contaminationAccent, setContaminationAccent] = useState<string | null>(null);
  const activeEventRef = useRef<string | null>(null);
  const stageTimersRef = useRef<number[]>([]);
  const contaminationTimerRef = useRef<number | null>(null);

  const canRunHeavy = !reducedMotion && tier !== "low" && !interactionBusy;
  const fracture = event?.type === "rift_reality_fracture";
  const burstCount = burstCountForTier(tier);
  const driftCount = driftCountForTier(tier);
  const activeAccent = event ? accentForEvent(event) : contaminationAccent ?? "#d946ef";
  const contaminationVisible = !reducedMotion && Boolean(contaminationAccent);

  useEffect(() => {
    return () => {
      stageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      stageTimersRef.current = [];
      if (contaminationTimerRef.current) {
        window.clearTimeout(contaminationTimerRef.current);
        contaminationTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    stageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    stageTimersRef.current = [];

    if (!event) {
      activeEventRef.current = null;
      setBannerVisible(false);
      setStage(chaosLevel >= 52 ? "phase1" : "idle");
      return;
    }

    if (activeEventRef.current === event.id) {
      return;
    }

    activeEventRef.current = event.id;
    setContaminationAccent(accentForEvent(event));
    if (contaminationTimerRef.current) {
      window.clearTimeout(contaminationTimerRef.current);
      contaminationTimerRef.current = null;
    }
    contaminationTimerRef.current = window.setTimeout(() => {
      setContaminationAccent(null);
      contaminationTimerRef.current = null;
    }, 15_000);

    if (reducedMotion) {
      setStage("phase1");
      setBannerVisible(true);
      onOverlayFallback?.(event);
      const hideBanner = window.setTimeout(() => {
        setBannerVisible(false);
        onOverlayResolved?.(event);
      }, 2200);
      stageTimersRef.current.push(hideBanner);
      return;
    }

    try {
      // Narrative-first pacing: force a short silent hold before the Rift reveal.
      const preludeMs = canRunHeavy ? 2000 : 1200;
      setStage("prelude");
      onOverlayRendered?.(event);
      const toReveal = window.setTimeout(() => setStage("phase2"), preludeMs);
      const toRupture = window.setTimeout(() => setStage("phase3"), preludeMs + (canRunHeavy ? 520 : 260));
      const toAftermath = window.setTimeout(() => setStage("phase4"), preludeMs + (canRunHeavy ? 2700 : 1400));
      const toIdle = window.setTimeout(() => {
        setStage(chaosLevel >= 52 ? "phase1" : "idle");
        onOverlayResolved?.(event);
      }, preludeMs + (canRunHeavy ? 5100 : 2700));
      stageTimersRef.current.push(toReveal, toRupture, toAftermath, toIdle);
    } catch {
      onOverlayFallback?.(event);
      setStage("phase1");
    }
  }, [event, chaosLevel, reducedMotion, canRunHeavy, onOverlayFallback, onOverlayRendered, onOverlayResolved]);

  const layerClass = useMemo(() => {
    if (stage === "prelude") {
      return "rift-layer-anticipation";
    }
    if (stage === "phase3") {
      return "rift-layer-rupture";
    }
    if (stage === "phase2") {
      return "rift-layer-escalation";
    }
    if (stage === "phase4") {
      return "rift-layer-aftermath";
    }
    if (stage === "phase1") {
      return "rift-layer-subtle";
    }
    return "rift-layer-idle";
  }, [stage]);

  return (
    <>
      <AnimatePresence>
        {contaminationVisible ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-[10] rift-contamination-layer"
            style={accentStyle(contaminationAccent ?? "#d946ef")}
            initial={{ opacity: 0 }}
            animate={{ opacity: stage === "idle" ? 0.5 : 0.72 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            aria-hidden
          >
            <div className="rift-contamination-vignette" />
            <div className="absolute inset-0 overflow-hidden">
              {Array.from({ length: driftCount }).map((_, index) => (
                <motion.span
                  key={`drift-${index}`}
                  className="rift-drift-particle"
                  style={{
                    left: `${(index * 53) % 100}%`,
                    top: `${(index * 29) % 100}%`,
                    backgroundColor: contaminationAccent ?? "#d946ef",
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{
                    x: [0, (index % 2 === 0 ? 12 : -14), 7, -8, 0],
                    y: [0, -22, 10, -18, 6],
                    opacity: [0.08, 0.32, 0.2, 0.1, 0.06],
                    scale: [0.4, 1, 0.7, 0.95, 0.5],
                  }}
                  transition={{
                    duration: 8 + (index % 4) * 1.9,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: (index % 5) * 0.33,
                  }}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className={clsx(
          "pointer-events-none absolute inset-0 z-[12] transition-opacity duration-300",
          layerClass,
          stage === "idle" ? "opacity-0" : "opacity-100"
        )}
        aria-hidden
      />

      <AnimatePresence>
        {stage !== "idle" && stage !== "prelude" && event ? (
          <motion.div
            key={`${event.id}-${sceneId}`}
            className="pointer-events-none absolute inset-0 z-[25] grid place-items-center px-6"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: stage === "phase1" ? 0.78 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.22 }}
            style={accentStyle(activeAccent)}
            aria-hidden
          >
            <motion.div
              className="relative grid place-items-center"
              animate={
                stage === "phase3" && canRunHeavy
                  ? {
                      x: [0, -10, 8, -7, 6, -3, 0],
                      y: [0, 8, -7, 5, -4, 2, 0],
                    }
                  : { x: 0, y: 0 }
              }
              transition={{ duration: 0.52, ease: "easeInOut" }}
            >
              {stage === "phase3" ? (
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.2] }}
                  transition={{ duration: 0.75, ease: "easeOut" }}
                >
                  <motion.div
                    className="absolute inset-0 rift-impact-flash"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.95, 0] }}
                    transition={{ duration: 0.36, ease: "easeOut" }}
                  />
                  <motion.div
                    className="absolute inset-0 rift-crack-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.85, 0.25] }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                  <div className="absolute inset-0 overflow-hidden">
                    {Array.from({ length: burstCount }).map((_, index) => {
                      const angle = (Math.PI * 2 * index) / burstCount;
                      const distance = 110 + (index % 7) * 16;
                      const jitter = ((index % 5) - 2) * 3;
                      const x = Math.cos(angle) * distance + jitter;
                      const y = Math.sin(angle) * distance - jitter;
                      return (
                        <motion.span
                          key={`burst-${index}`}
                          className="rift-burst-particle"
                          style={{ backgroundColor: activeAccent }}
                          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                          animate={{ x, y, opacity: 0, scale: 0.25 }}
                          transition={{
                            duration: 0.9 + (index % 4) * 0.06,
                            ease: "easeOut",
                            delay: (index % 8) * 0.016,
                          }}
                        />
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
              <motion.div
                className={clsx(
                  "max-w-xl rounded-3xl border px-6 py-5 text-center shadow-2xl backdrop-blur-sm",
                  fracture
                    ? "border-red-300/80 bg-red-950/70"
                    : "border-cyan-300/80 bg-cyan-950/68",
                  stage === "phase3" ? "ring-2 ring-white/45" : "ring-1 ring-white/22"
                )}
                initial={{ scale: 0.86, y: -120, rotate: -2, opacity: 0 }}
                animate={
                  stage === "phase2"
                    ? { scale: [0.86, 1.08, 1], y: [-120, 10, 0], rotate: [-2, 1, 0], opacity: [0, 1, 1] }
                    : stage === "phase3"
                      ? { scale: [1, 1.06, 1], y: [0, -2, 0], rotate: 0, opacity: 1 }
                      : stage === "phase4"
                        ? { scale: 0.98, y: 4, rotate: 0, opacity: 0.88 }
                        : { scale: 0.96, y: -6, rotate: 0, opacity: 0.76 }
                }
                transition={{ duration: stage === "phase2" ? 0.62 : 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-100">Rift Event</p>
                <p className="mt-2 text-3xl font-black tracking-[0.05em] text-white">
                  <span className="text-amber-200">⚡</span> {event.title} <span className="text-amber-200">⚡</span>
                </p>
                <p className="mt-2 text-base text-zinc-50">{event.description}</p>
                {stage === "phase3" ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                    Reality destabilizing
                  </p>
                ) : null}
              </motion.div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {bannerVisible && event ? (
          <motion.div
            key={`banner-${event.id}`}
            className="pointer-events-none absolute inset-x-4 top-[96px] z-[26]"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            <div className="rounded-xl border border-fuchsia-300/55 bg-black/70 px-3 py-2 text-sm text-fuchsia-100">
              <strong>{event.title}</strong> {event.description}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
