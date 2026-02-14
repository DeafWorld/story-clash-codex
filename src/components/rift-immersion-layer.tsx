"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type RiftStage = "idle" | "phase1" | "phase2" | "phase3" | "phase4";

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
  const activeEventRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);

  const canRunHeavy = !reducedMotion && tier !== "low" && !interactionBusy;
  const fracture = event?.type === "rift_reality_fracture";

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];

    if (!event) {
      activeEventRef.current = null;
      setBannerVisible(false);
      setStage(chaosLevel >= 58 ? "phase1" : "idle");
      return;
    }

    if (activeEventRef.current === event.id) {
      return;
    }

    activeEventRef.current = event.id;

    if (reducedMotion) {
      setStage("phase1");
      setBannerVisible(true);
      onOverlayFallback?.(event);
      const hideBanner = window.setTimeout(() => {
        setBannerVisible(false);
        onOverlayResolved?.(event);
      }, 2200);
      timersRef.current.push(hideBanner);
      return;
    }

    try {
      setStage("phase2");
      onOverlayRendered?.(event);
      const toRupture = window.setTimeout(() => setStage("phase3"), canRunHeavy ? 260 : 140);
      const toAftermath = window.setTimeout(() => setStage("phase4"), canRunHeavy ? 1860 : 980);
      const toIdle = window.setTimeout(() => {
        setStage(chaosLevel >= 52 ? "phase1" : "idle");
        onOverlayResolved?.(event);
      }, canRunHeavy ? 3200 : 1900);
      timersRef.current.push(toRupture, toAftermath, toIdle);
    } catch {
      onOverlayFallback?.(event);
      setStage("phase1");
    }
  }, [event, chaosLevel, reducedMotion, canRunHeavy, onOverlayFallback, onOverlayRendered, onOverlayResolved]);

  const layerClass = useMemo(() => {
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
      <div
        className={clsx(
          "pointer-events-none absolute inset-0 z-[12] transition-opacity duration-300",
          layerClass,
          stage === "idle" ? "opacity-0" : "opacity-100"
        )}
        aria-hidden
      />

      <AnimatePresence>
        {stage !== "idle" && event ? (
          <motion.div
            key={`${event.id}-${sceneId}`}
            className="pointer-events-none absolute inset-0 z-[25] grid place-items-center px-6"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: stage === "phase1" ? 0.78 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.22 }}
            aria-hidden
          >
            <motion.div
              className={clsx(
                "max-w-xl rounded-2xl border px-5 py-4 text-center shadow-2xl backdrop-blur-sm",
                fracture
                  ? "border-red-300/70 bg-red-950/65"
                  : "border-cyan-300/70 bg-cyan-950/60",
                stage === "phase3" ? "ring-2 ring-white/40" : "ring-1 ring-white/20"
              )}
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: stage === "phase3" ? 1.04 : 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-100">Rift Event</p>
              <p className="mt-1 text-2xl font-black text-white">{event.title}</p>
              <p className="mt-2 text-base text-zinc-50">{event.description}</p>
              {stage === "phase3" ? (
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Reality destabilizing
                </p>
              ) : null}
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
