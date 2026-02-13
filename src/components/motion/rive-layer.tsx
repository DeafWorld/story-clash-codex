"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MOTION_FLAGS } from "../../lib/motion/tokens";
import { getMotionAsset, type MotionAssetId } from "../../lib/motion/asset-registry";

declare global {
  interface Window {
    rive?: {
      Rive: new (config: {
        src: string;
        canvas: HTMLCanvasElement;
        autoplay?: boolean;
        stateMachines?: string[];
      }) => {
        cleanup?: () => void;
      };
    };
  }
}

type RiveLayerProps = {
  assetId: MotionAssetId;
  className?: string;
  stateMachines?: string[];
};

export default function RiveLayer({ assetId, className, stateMachines }: RiveLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<{ cleanup?: () => void } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!MOTION_FLAGS.enableRive) {
      return;
    }
    let cancelled = false;

    async function setup() {
      if (!window.rive?.Rive) {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/@rive-app/canvas@2.25.0";
        script.async = true;
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.head.appendChild(script);
        });
      }

      if (cancelled || !window.rive?.Rive || !canvasRef.current) {
        return;
      }

      const asset = getMotionAsset(assetId);
      instanceRef.current = new window.rive.Rive({
        src: asset.src,
        canvas: canvasRef.current,
        autoplay: true,
        stateMachines,
      });
      setLoaded(true);
    }

    void setup();
    return () => {
      cancelled = true;
      instanceRef.current?.cleanup?.();
      instanceRef.current = null;
    };
  }, [assetId, stateMachines]);

  return (
    <div className={clsx("relative overflow-hidden rounded-2xl border border-white/10 bg-black/20", className)}>
      <canvas ref={canvasRef} className="h-full w-full" />
      {!loaded ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(83,244,255,0.14), transparent 46%), radial-gradient(circle at 60% 80%, rgba(255,77,109,0.1), transparent 52%)",
          }}
        />
      ) : null}
    </div>
  );
}
