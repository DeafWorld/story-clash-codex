"use client";

import { useEffect, useMemo, useState } from "react";

type TypewriterProps = {
  text: string;
  charsPerSecond?: number;
};

export default function Typewriter({ text, charsPerSecond = 30 }: TypewriterProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    if (!text) {
      return;
    }

    const stepMs = Math.max(20, Math.floor(1000 / charsPerSecond));
    const interval = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= text.length) {
          window.clearInterval(interval);
          return count;
        }
        return count + 1;
      });
    }, stepMs);

    return () => window.clearInterval(interval);
  }, [text, charsPerSecond]);

  const rendered = useMemo(() => text.slice(0, visibleCount), [text, visibleCount]);
  const cursorVisible = visibleCount < text.length;

  return (
    <p className="whitespace-pre-line text-[1.05rem] leading-7 text-white sm:text-lg sm:leading-8" aria-live="polite">
      {rendered}
      {cursorVisible ? <span className="animate-pulse">|</span> : null}
    </p>
  );
}
