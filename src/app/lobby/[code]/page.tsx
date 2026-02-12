"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocketClient } from "../../../lib/socket-client";
import { apiFetch } from "../../../lib/api-client";
import { getDemoSession, initDemoRoom } from "../../../lib/demo-session";
import RoomCodeCard from "../../../components/room-code-card";
import SessionTopBar from "../../../components/session-top-bar";
import type { RoomView } from "../../../types/game";

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";
  const demoMode = code === "DEMO1";

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const demoSession = getDemoSession();
  const demoPlayers = demoSession.players;

  const isHost = useMemo(() => {
    if (demoMode) {
      return playerId === "demo-host" || playerId.length === 0;
    }
    return room?.players.some((player) => player.id === playerId && player.isHost) ?? false;
  }, [demoMode, room, playerId]);

  const playerCount = demoMode ? demoPlayers.length : room?.players.length ?? 0;
  const playersForCard = (demoMode ? demoPlayers : room?.players ?? []).map((player) => ({
    id: player.id,
    name: player.name,
  }));

  useEffect(() => {
    if (demoMode) {
      initDemoRoom();
      setLoading(false);
      return;
    }

    let active = true;

    async function loadRoom() {
      try {
        const response = await apiFetch(`/api/rooms/${code}`);
        const data = (await response.json()) as RoomView | { error: string };
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Room not found");
        }
        if (active) {
          setRoom(data);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load room");
          setLoading(false);
        }
      }
    }

    void loadRoom();

    return () => {
      active = false;
    };
  }, [code, demoMode]);

  useEffect(() => {
    if (demoMode || !playerId) {
      return;
    }

    // TODO(multiplayer): Keep lobby presence fully event-driven when server-side persistence is added.
    const socket = getSocketClient();

    socket.emit("join_room", { code, playerId });

    const onRoomUpdated = (payload: RoomView) => {
      setRoom(payload);
    };

    const onStarted = () => {
      router.push(`/minigame/${code}?player=${playerId}`);
    };

    const onError = (payload: { message: string }) => {
      const message = payload.message || "Server error";
      // Treat realtime connectivity issues as non-fatal so the UI can recover via auto-reconnect.
      if (/realtime|connect/i.test(message)) {
        setToast(message);
        setStarting(false);
        // Best-effort snapshot refresh for cases where realtime reconnect takes a moment.
        void apiFetch(`/api/rooms/${code}`)
          .then(async (response) => (response.ok ? ((await response.json()) as RoomView) : null))
          .then((nextRoom) => {
            if (nextRoom) {
              setRoom(nextRoom);
            }
          })
          .catch(() => {});
        return;
      }
      setError(message);
      setStarting(false);
    };

    socket.on("room_updated", onRoomUpdated);
    socket.on("game_started", onStarted);
    socket.on("server_error", onError);

    return () => {
      socket.emit("leave_room", { code, playerId });
      socket.off("room_updated", onRoomUpdated);
      socket.off("game_started", onStarted);
      socket.off("server_error", onError);
    };
  }, [code, demoMode, playerId, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function startGame() {
    if (demoMode) {
      const nextPlayer = playerId || "demo-host";
      router.push(`/minigame/${code}?player=${nextPlayer}&demo=1`);
      return;
    }

    if (!playerId) {
      setError("Missing player session. Rejoin the room.");
      return;
    }

    setStarting(true);
    const socket = getSocketClient();
    socket.emit("start_game", { code, playerId });
  }

  if (loading) {
    return (
      <main className="page-shell page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Lobby" />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading lobby...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Lobby" />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel max-w-lg p-6">
            <p className="text-red-300">{error}</p>
            <button className="btn btn-primary mt-4" onClick={() => router.push("/")} type="button">
              Back Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref="/"
        backLabel="Back Home"
        roomCode={code}
        playerId={playerId || undefined}
        showInvite
        isDemo={demoMode}
        phaseLabel="Lobby"
        playerName={
          (demoMode ? demoPlayers : room?.players ?? []).find((player) => player.id === (playerId || "demo-host"))?.name ??
          undefined
        }
      />
      <div className="content-wrap space-y-5">
        <section className="panel space-y-2 p-5">
          <p className="badge w-fit">Lobby Phase</p>
          <h1 className="text-2xl font-black sm:text-3xl">Assemble Your Crew</h1>
          <p className="text-sm text-zinc-300">
            Invite friends, confirm everyone is connected, then start the Rift minigame.
          </p>
        </section>

        <RoomCodeCard
          code={code}
          players={playersForCard}
          title={demoMode ? "Demo Room" : "Room Code"}
        />

        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}

        <section className="panel p-5">
          <h2 className="mb-3 text-xl font-semibold">Players ({playerCount}/6)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(demoMode ? demoPlayers : room?.players ?? []).map((player) => (
              <motion.div
                key={player.id}
                layout
                className="flex items-center gap-3 rounded-xl border border-white/20 bg-slate-950/50 p-3"
              >
                <div className="grid h-11 w-11 place-items-center rounded-full border border-cyan-300/40 bg-cyan-500/15 font-semibold uppercase">
                  {player.name.slice(0, 1)}
                </div>
                <div>
                  <p className="font-semibold">
                    {player.name} {player.id === "demo-host" || ("isHost" in player && player.isHost) ? "(Host)" : ""}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {"connected" in player ? (player.connected ? "Connected" : "Disconnected") : "Connected"}
                  </p>
                </div>
              </motion.div>
            ))}

            {!demoMode
              ? Array.from({ length: Math.max(0, 6 - (room?.players.length ?? 0)) }).map((_, index) => (
                  <div
                    key={`slot-${index}`}
                    className="rounded-xl border border-white/10 bg-black/20 p-3 text-zinc-400"
                  >
                    Waiting for players...
                  </div>
                ))
              : null}
          </div>
        </section>

        {isHost ? (
          <div className="panel p-5">
            <button
              type="button"
              className="btn btn-primary w-full py-4 text-lg disabled:cursor-not-allowed disabled:opacity-40 sm:text-xl"
              onClick={startGame}
              disabled={!demoMode && (playerCount < 3 || starting)}
              title={!demoMode && playerCount < 3 ? "Need 3+ players" : "Start Game"}
            >
              {demoMode ? "Start Minigame (Demo)" : starting ? "Starting..." : "Start Game"}
            </button>
            {!demoMode && playerCount < 3 ? <p className="mt-2 text-sm text-zinc-400">Need 3+ players</p> : null}
          </div>
        ) : (
          <div className="panel p-5 text-zinc-300">Waiting for host to start the game.</div>
        )}
      </div>
    </main>
  );
}
