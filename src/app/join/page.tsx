"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { initDemoRoom } from "../../lib/demo-session";

const CODE_REGEX = /^[A-HJ-NP-Z]{4}$/;

export default function JoinRoomPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const realCode = normalizedCode.slice(0, 4);
  const validFormat = CODE_REGEX.test(realCode) || normalizedCode === "DEMO1";
  const disabled = useMemo(
    () => !validFormat || name.trim().length === 0 || loading,
    [validFormat, name, loading]
  );

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
      const response = await fetch("/api/rooms/join", {
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
    <main className="page-shell">
      <div className="content-wrap grid min-h-dvh place-items-center">
        <form onSubmit={onSubmit} className="panel w-full max-w-lg space-y-5 p-6">
          <h1 className="text-3xl font-bold">Join Room</h1>
          <p className="text-zinc-300">Enter a 4-letter room code and your display name to join a live session.</p>

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
              required
            />
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button type="submit" className="btn btn-primary w-full py-3 font-semibold" disabled={disabled}>
            {loading ? "Joining room..." : "Join Room"}
          </button>

          <p className="text-center text-xs text-zinc-500">Dev shortcut: use code DEMO1 for local demo mode.</p>
        </form>
      </div>
    </main>
  );
}
