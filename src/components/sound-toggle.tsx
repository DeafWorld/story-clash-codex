"use client";

import { useEffect, useState } from "react";
import { soundManager } from "../lib/soundManager";

export default function SoundToggle() {
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(65);

  useEffect(() => {
    soundManager.init();
    soundManager.loadSavedSettings();
    setMuted(soundManager.isMuted());
    setVolume(Math.round(soundManager.getMasterVolume() * 100));

    const unlock = () => {
      soundManager.unlock();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function toggleMute() {
    soundManager.unlock();
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
  }

  function onVolumeChange(nextValue: number) {
    const clamped = Math.max(0, Math.min(100, nextValue));
    soundManager.unlock();
    soundManager.setMasterVolume(clamped / 100);
    setVolume(clamped);
    if (clamped > 0 && muted) {
      soundManager.setMuted(false);
      setMuted(false);
    }
  }

  return (
    <div className="mute-button">
      <button
        type="button"
        className="btn btn-secondary px-3 py-2 text-sm"
        aria-label="Audio settings"
        onClick={() => setOpen((value) => !value)}
      >
        {muted ? "🔇" : "🔊"} Audio
      </button>

      {open ? (
        <div className="audio-panel mt-2 rounded-xl border border-white/20 bg-black/80 p-3">
          <button type="button" className="btn btn-secondary w-full py-2 text-sm" onClick={toggleMute}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <label className="mt-3 block text-xs text-zinc-300">
            Volume: {volume}%
            <input
              type="range"
              className="mt-2 w-full"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
