"use client";

import { useState } from "react";
import { generateRecapCardDataUrl } from "../../lib/recap-generator";

type ShareableRecapProps = {
  title: string;
  ending: string;
  roomCode: string;
  choices: string[];
  chaosLevel: number;
  onShared?: () => void;
};

export default function ShareableRecap({
  title,
  ending,
  roomCode,
  choices,
  chaosLevel,
  onShared,
}: ShareableRecapProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setLoading(true);
    setError(null);
    try {
      const dataUrl = await generateRecapCardDataUrl({
        title,
        ending,
        roomCode,
        choices,
        chaosLevel,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "story-clash-recap.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Story Clash Recap",
          text: `We survived ${title}. Can your crew do better?`,
          files: [file],
        });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "story-clash-recap.png";
        link.click();
      }
      onShared?.();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to share recap");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel space-y-3 p-4">
      <button type="button" className="btn btn-primary w-full py-3" onClick={handleShare} disabled={loading}>
        {loading ? "Preparing recap..." : "Share Story"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
