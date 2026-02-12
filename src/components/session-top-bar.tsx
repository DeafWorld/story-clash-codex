"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { shareInvite } from "../lib/invite";

export type SessionTopBarProps = {
  backHref: string;
  backLabel?: string;
  roomCode?: string;
  playerId?: string;
  showInvite?: boolean;
  isDemo?: boolean;
  phaseLabel?: string;
  playerName?: string;
};

export default function SessionTopBar({
  backHref,
  backLabel = "Back",
  roomCode,
  playerId,
  showInvite = false,
  isDemo = false,
  phaseLabel,
  playerName,
}: SessionTopBarProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const chips = useMemo(() => {
    const next: Array<{ label: string; value: string }> = [];
    if (phaseLabel) {
      next.push({ label: "Phase", value: phaseLabel });
    }
    if (roomCode) {
      next.push({ label: "Room", value: roomCode });
    }
    if (playerName) {
      next.push({ label: "Player", value: playerName });
    }
    if (isDemo) {
      next.push({ label: "Mode", value: "Demo" });
    }
    return next;
  }, [isDemo, phaseLabel, playerName, roomCode]);

  async function handleInvite() {
    if (!showInvite || !roomCode || sharing) {
      return;
    }
    setSharing(true);
    setMessage(null);
    trackEvent("invite_clicked", { roomCode, playerId: playerId ?? null, isDemo });

    try {
      const result = await shareInvite({
        code: roomCode,
        origin: window.location.origin,
        inviter: playerName ?? playerId,
      });
      trackEvent(result.method === "native" ? "invite_shared" : "invite_copied", {
        roomCode,
        playerId: playerId ?? null,
        isDemo,
      });
      setMessage(result.method === "native" ? "Invite sent" : "Invite link copied");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not share invite");
    } finally {
      setSharing(false);
      window.setTimeout(() => setMessage(null), 2200);
    }
  }

  return (
    <header className="session-top-bar">
      <div className="session-top-inner">
        <Link
          href={backHref}
          className="btn btn-secondary py-2"
          onClick={() => trackEvent("back_clicked", { roomCode: roomCode ?? null, phaseLabel: phaseLabel ?? null })}
        >
          {backLabel}
        </Link>
        <button
          type="button"
          className="btn btn-primary py-2 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={handleInvite}
          disabled={sharing || !showInvite || !roomCode}
        >
          {sharing ? "Sharing..." : "Invite"}
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="session-chip-row">
          {chips.map((chip) => (
            <span key={`${chip.label}-${chip.value}`} className="session-chip">
              {chip.label}: {chip.value}
            </span>
          ))}
        </div>
      ) : null}

      {message ? <p className="session-toast">{message}</p> : null}
    </header>
  );
}
