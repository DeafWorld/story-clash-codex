"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { useReducedMotionPreference } from "../../lib/motion/reduced-motion";

export default function ParallaxField() {
  const reduced = useReducedMotionPreference();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const layerOneX = useTransform(x, [-1, 1], ["-1.2%", "1.2%"]);
  const layerOneY = useTransform(y, [-1, 1], ["-1.2%", "1.2%"]);
  const layerTwoX = useTransform(x, [-1, 1], ["1.8%", "-1.8%"]);
  const layerTwoY = useTransform(y, [-1, 1], ["1.5%", "-1.5%"]);

  useEffect(() => {
    if (reduced) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
      x.set(normalizedX);
      y.set(normalizedY);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, x, y]);

  if (reduced) {
    return null;
  }

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[-10%] z-0"
        style={{
          x: layerOneX,
          y: layerOneY,
          background:
            "radial-gradient(circle at 15% 20%, rgba(83,244,255,0.18), transparent 34%), radial-gradient(circle at 85% 8%, rgba(255,77,109,0.16), transparent 40%)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[-15%] z-0"
        style={{
          x: layerTwoX,
          y: layerTwoY,
          background:
            "radial-gradient(circle at 70% 80%, rgba(255,180,84,0.1), transparent 42%), radial-gradient(circle at 38% 70%, rgba(83,244,255,0.08), transparent 35%)",
        }}
      />
    </>
  );
}
