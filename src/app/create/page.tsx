"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { initDemoRoom } from "../../lib/demo-session";
import SessionTopBar from "../../components/session-top-bar";

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canCreate = useMemo(() => name.trim().length > 0 && !loading, [name, loading]);

  function startDemoRoom() {
    initDemoRoom();
    router.push("/lobby/DEMO1?player=demo-host&demo=1");
  }

  async function createLiveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim().slice(0, 12) }),
      });

      const data = (await response.json()) as { code?: string; playerId?: string; error?: string };
      if (!response.ok || !data.code || !data.playerId) {
        throw new Error(data.error ?? "Could not create room");
      }

      router.push(`/lobby/${data.code}?player=${data.playerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setLoading(false);
    }
  }

  return (
    <main className="page-shell page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Create Room" />
      <div className="content-wrap grid min-h-dvh place-items-center">
        <form onSubmit={createLiveRoom} className="panel w-full max-w-lg space-y-6 p-5 sm:p-7">
          <p className="badge">Host Session</p>
          <h1 className="text-3xl font-black sm:text-4xl">Create Room</h1>
          <p className="text-base text-zinc-200">
            Start a live room for 3-6 players, then launch the minigame when everyone joins.
          </p>

          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Display Name</span>
            <input
              className="field"
              maxLength={12}
              placeholder="Host name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button type="submit" className="btn btn-primary w-full py-4 text-lg font-semibold sm:text-xl" disabled={!canCreate}>
            {loading ? "Creating..." : "Create Live Room"}
          </button>

          <button type="button" className="btn btn-secondary w-full py-3" onClick={startDemoRoom}>
            Start Demo Room
          </button>
        </form>
      </div>
    </main>
  );
}
