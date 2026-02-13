"use client";

import { AnimatePresence, motion } from "framer-motion";

type ImpactFlashProps = {
  active: boolean;
};

export default function ImpactFlash({ active }: ImpactFlashProps) {
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          key="impact"
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.32), rgba(83,244,255,0.12) 32%, transparent 65%)",
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}
