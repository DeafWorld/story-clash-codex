"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trackEvent } from "../lib/analytics";
import { buildInviteUrl, shareInvite } from "../lib/invite";

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

  async function handleCopyLink() {
    if (!showInvite || !roomCode) {
      return;
    }
    const url = buildInviteUrl({
      code: roomCode,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      inviter: playerName ?? playerId,
    });
    try {
      await navigator.clipboard.writeText(url);
      trackEvent("invite_copied", { roomCode, playerId: playerId ?? null, isDemo, method: "copy_link" });
      setMessage("Link copied");
      window.setTimeout(() => setMessage(null), 2200);
    } catch {
      setMessage("Could not copy");
      window.setTimeout(() => setMessage(null), 2200);
    }
  }

  return (
    <header className="session-top-bar">
      <motion.div
        className="session-top-inner"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <Link
          href={backHref}
          className="btn btn-secondary py-2 motion-cta"
          onClick={() => trackEvent("back_clicked", { roomCode: roomCode ?? null, phaseLabel: phaseLabel ?? null })}
        >
          {backLabel}
        </Link>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            className="btn btn-secondary py-2 motion-cta"
            onClick={handleCopyLink}
            disabled={!showInvite || !roomCode}
          >
            Copy link
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            className="btn btn-primary py-2 motion-cta disabled:cursor-not-allowed disabled:opacity-45"
            onClick={handleInvite}
            disabled={sharing || !showInvite || !roomCode}
          >
            {sharing ? "Sharing..." : "Invite"}
          </motion.button>
        </div>
      </motion.div>

      {chips.length > 0 ? (
        <motion.div
          className="session-chip-row"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.06 }}
        >
          {chips.map((chip) => (
            <span key={`${chip.label}-${chip.value}`} className="session-chip">
              {chip.label}: {chip.value}
            </span>
          ))}
        </motion.div>
      ) : null}

      <AnimatePresence initial={false}>
        {message ? (
          <motion.p
            key={message}
            className="session-toast"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {message}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
