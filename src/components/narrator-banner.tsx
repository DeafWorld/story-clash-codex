"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Typewriter from "./typewriter";
import type { NarrationLine } from "../types/game";

type NarratorBannerProps = {
  line: NarrationLine | null;
  autoHideMs?: number;
  compact?: boolean;
  className?: string;
};

const NARRATOR_ENABLED = process.env.NEXT_PUBLIC_ENABLE_NARRATOR !== "0";

function toneLabel(line: NarrationLine): string {
  const tone = line.tone.charAt(0).toUpperCase() + line.tone.slice(1);
  return `${tone} narrator`;
}

export default function NarratorBanner({ line, autoHideMs = 5200, compact = false, className }: NarratorBannerProps) {
  const [activeLine, setActiveLine] = useState<NarrationLine | null>(line);
  const [visible, setVisible] = useState(Boolean(line));
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) {
      return;
    }
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const queueHide = useCallback(
    (delay = autoHideMs) => {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        setVisible(false);
      }, delay);
    },
    [autoHideMs, clearHideTimer]
  );

  useEffect(() => {
    if (!NARRATOR_ENABLED || !line) {
      return;
    }
    setActiveLine(line);
    setVisible(true);
    queueHide();
  }, [line, line?.id, queueHide]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  if (!NARRATOR_ENABLED || !activeLine) {
    return null;
  }

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.aside
          key={activeLine.id}
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={clsx("narrator-banner", compact ? "narrator-banner-compact" : "", className)}
          onMouseEnter={() => clearHideTimer()}
          onMouseLeave={() => queueHide(1800)}
          onFocusCapture={() => clearHideTimer()}
          onBlurCapture={() => queueHide(1800)}
          role="status"
          aria-live="polite"
        >
          <p className="narrator-label">{toneLabel(activeLine)}</p>
          <Typewriter text={activeLine.text} charsPerSecond={42} />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
