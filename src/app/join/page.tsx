"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "../../lib/api-client";
import { trackEvent } from "../../lib/analytics";
import { initDemoRoom } from "../../lib/demo-session";
import SessionTopBar from "../../components/session-top-bar";
import SceneShell from "../../components/motion/scene-shell";

const CODE_REGEX = /^[A-HJ-NP-Z]{4}$/;

function JoinRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seededInviteRef = useRef(false);
  const trackedInviteRef = useRef(false);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const [inviteBanner, setInviteBanner] = useState<{ fromInvite: boolean; inviter: string | null }>({
    fromInvite: false,
    inviter: null,
  });

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const realCode = normalizedCode.slice(0, 4);
  const inviteCodeLabel = normalizedCode === "DEMO1" ? "DEMO1" : realCode;
  const validFormat = CODE_REGEX.test(realCode) || normalizedCode === "DEMO1";
  const disabled = useMemo(
    () => !validFormat || name.trim().length === 0 || loading,
    [validFormat, name, loading]
  );

  useEffect(() => {
    if (seededInviteRef.current) {
      return;
    }
    const sharedCode = (searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const fromInvite = searchParams.get("from") === "invite";
    const inviterRaw = searchParams.get("inviter");
    const inviter = inviterRaw ? inviterRaw.trim().slice(0, 24) : null;
    if (sharedCode) {
      setCode(sharedCode);
      trackEvent("join_prefilled", { code: sharedCode, fromInvite, inviter });
      window.setTimeout(() => {
        nameFieldRef.current?.focus();
      }, 60);
    }
    if (fromInvite && !trackedInviteRef.current) {
      trackEvent("invite_opened", { code: sharedCode || null, inviter });
      trackedInviteRef.current = true;
    }
    setInviteBanner({ fromInvite, inviter });
    seededInviteRef.current = true;
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (normalizedCode === "DEMO1") {
      initDemoRoom();
      router.push("/lobby/DEMO1?player=demo-p2&demo=1");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: realCode, name: name.trim().slice(0, 12) }),
      });

      const data = (await response.json()) as {
        room?: { code: string };
        playerId?: string;
        error?: string;
      };

      if (!response.ok || !data.room?.code || !data.playerId) {
        throw new Error(data.error ?? "Unable to join room");
      }

      router.push(`/lobby/${data.room.code}?player=${data.playerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
      setLoading(false);
    }
  }

  return (
    <SceneShell className="page-with-top-bar">
      <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Join Room" />
      <div className="content-wrap grid min-h-dvh place-items-center">
        <motion.form
          onSubmit={onSubmit}
          className="panel w-full max-w-lg space-y-5 p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34 }}
        >
          <h1 className="text-3xl font-bold">Join Room</h1>
          <p className="text-zinc-300">Enter a 4-letter room code and your display name to join a live session.</p>
          {inviteBanner.fromInvite && inviteCodeLabel ? (
            <div className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
              Invited to room <strong>{inviteCodeLabel}</strong>
              {inviteBanner.inviter ? ` by ${inviteBanner.inviter}` : ""}.
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Room Code</span>
            <div className="relative">
              <input
                className="field tracking-[0.3em] uppercase"
                maxLength={5}
                placeholder="ABCD"
                value={normalizedCode}
                onChange={(event) => setCode(event.target.value)}
                aria-label="Room code"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-green-300" aria-hidden>
                {validFormat ? "Valid" : ""}
              </span>
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Display Name</span>
            <input
              className="field"
              maxLength={12}
              placeholder="Enter name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Display name"
              ref={nameFieldRef}
              required
            />
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button type="submit" className="btn btn-primary w-full py-3 font-semibold" disabled={disabled}>
            {loading ? "Joining room..." : "Join Room"}
          </button>

          <p className="text-center text-xs text-zinc-500">Dev shortcut: use code DEMO1 for local demo mode.</p>
        </motion.form>
      </div>
    </SceneShell>
  );
}

export default function JoinRoomPage() {
  return (
    <Suspense
      fallback={
        <SceneShell className="page-with-top-bar">
          <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Join Room" />
          <div className="content-wrap grid min-h-dvh place-items-center">
            <div className="panel w-full max-w-lg p-6 text-center text-zinc-300">Loading join form...</div>
          </div>
        </SceneShell>
      }
    >
      <JoinRoomContent />
    </Suspense>
  );
}
