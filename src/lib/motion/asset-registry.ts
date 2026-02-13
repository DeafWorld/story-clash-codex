export type MotionAssetKind = "rive" | "lottie";

export type MotionAssetId =
  | "rift_core_loop"
  | "pulse_field_loop"
  | "payoff_flash"
  | "share_success"
  | "tie_break_lock";

export type MotionAsset = {
  id: MotionAssetId;
  kind: MotionAssetKind;
  src: string;
  weightKb: number;
};

const registry: Record<MotionAssetId, MotionAsset> = {
  rift_core_loop: {
    id: "rift_core_loop",
    kind: "rive",
    src: "/motion/rive/rift-core.riv",
    weightKb: 220,
  },
  pulse_field_loop: {
    id: "pulse_field_loop",
    kind: "rive",
    src: "/motion/rive/pulse-field.riv",
    weightKb: 140,
  },
  payoff_flash: {
    id: "payoff_flash",
    kind: "lottie",
    src: "/motion/lottie/payoff-flash.json",
    weightKb: 48,
  },
  share_success: {
    id: "share_success",
    kind: "lottie",
    src: "/motion/lottie/share-success.json",
    weightKb: 36,
  },
  tie_break_lock: {
    id: "tie_break_lock",
    kind: "lottie",
    src: "/motion/lottie/tie-break-lock.json",
    weightKb: 42,
  },
};

export function getMotionAsset(id: MotionAssetId): MotionAsset {
  return registry[id];
}

export async function preloadMotionAssets(ids: MotionAssetId[]) {
  if (typeof window === "undefined") {
    return;
  }

  await Promise.all(
    ids.map(async (id) => {
      const asset = registry[id];
      if (!asset) {
        return;
      }
      try {
        await fetch(asset.src, { mode: "same-origin", credentials: "omit" });
      } catch {
        // Keep non-blocking fallback behavior for missing optional assets.
      }
    })
  );
}

export function likelyAssetsForRoute(pathname: string): MotionAssetId[] {
  if (pathname.startsWith("/game/")) {
    return ["rift_core_loop", "payoff_flash"];
  }
  if (pathname.startsWith("/minigame/")) {
    return ["pulse_field_loop", "tie_break_lock"];
  }
  if (pathname.startsWith("/recap/")) {
    return ["share_success"];
  }
  return ["rift_core_loop"];
}
