"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { MOTION_FLAGS } from "../../lib/motion/tokens";
import { getMotionAsset, type MotionAssetId } from "../../lib/motion/asset-registry";

declare global {
  interface Window {
    lottie?: {
      loadAnimation: (config: {
        container: HTMLElement;
        renderer: "svg";
        loop?: boolean;
        autoplay?: boolean;
        path: string;
      }) => { destroy: () => void };
    };
  }
}

type LottieStingerProps = {
  assetId: MotionAssetId;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
};

export default function LottieStinger({ assetId, className, loop = false, autoplay = true }: LottieStingerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (!MOTION_FLAGS.enableLottie || !ref.current) {
      return;
    }
    let cancelled = false;

    async function mount() {
      if (!window.lottie?.loadAnimation) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";
        script.async = true;
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.head.appendChild(script);
        });
      }

      if (cancelled || !window.lottie?.loadAnimation || !ref.current) {
        return;
      }

      const asset = getMotionAsset(assetId);
      animationRef.current = window.lottie.loadAnimation({
        container: ref.current,
        renderer: "svg",
        loop,
        autoplay,
        path: asset.src,
      });
    }

    void mount();

    return () => {
      cancelled = true;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [assetId, autoplay, loop]);

  return <div ref={ref} className={clsx("pointer-events-none", className)} />;
}
