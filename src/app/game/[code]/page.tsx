"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { getSocketClient } from "../../../lib/socket-client";
import { apiFetch } from "../../../lib/api-client";
import { trackEvent } from "../../../lib/analytics";
import Typewriter from "../../../components/typewriter";
import RoomCodeCard from "../../../components/room-code-card";
import NarratorBanner from "../../../components/narrator-banner";
import RiftStatusCard from "../../../components/rift-status-card";
import {
  advanceDemoStoryChoice,
  getDemoSession,
  getDemoStoryTree,
} from "../../../lib/demo-session";
import { getNodeById, getStoryStartNode } from "../../../lib/story-utils";
import SessionTopBar from "../../../components/session-top-bar";
import type { NarrationLine, RoomView } from "../../../types/game";
import type { NarratorUpdatePayload } from "../../../types/realtime";

function genreOverlay(genre: string | null) {
  if (genre === "zombie") {
    return "bg-[radial-gradient(circle_at_20%_10%,rgba(57,255,20,0.14),transparent_35%),radial-gradient(circle_at_80%_90%,rgba(255,59,59,0.14),transparent_40%)]";
  }
  if (genre === "alien") {
    return "bg-[linear-gradient(transparent_0,rgba(0,217,255,0.04)_50%,transparent_100%)]";
  }
  if (genre === "haunted") {
    return "bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.08),transparent_40%)]";
  }
  return "";
}

type DemoGameProps = {
  code: string;
  playerId: string;
};

function DemoGame({ code, playerId }: DemoGameProps) {
  const router = useRouter();
  const [, rerender] = useState(0);

  const session = getDemoSession();
  const storyTree = getDemoStoryTree();
  const storyLabel = `${storyTree.title} (Demo)`;
  const scene = getNodeById(storyTree, session.currentNodeId) ?? getStoryStartNode(storyTree);
  const activePlayerId = session.currentPlayerId;
  const activePlayer = session.players.find((player) => player.id === activePlayerId) ?? session.players[0];
  const viewerId = playerId || "demo-host";
  const viewer = session.players.find((player) => player.id === viewerId) ?? session.players[0];
  const isDone = Boolean(scene?.ending);
  const tensionLevel = scene?.tensionLevel ?? 1;
  const tensionHigh = tensionLevel >= 4;
  const tensionMedium = tensionLevel === 3;
  const narration = session.latestNarration ?? null;

  function choose(choiceId: string) {
    advanceDemoStoryChoice(choiceId);
    rerender((value) => value + 1);
  }

  return (
    <main className="page-shell page-with-top-bar">
      <div
        className={clsx(
          "absolute inset-0 opacity-80",
          genreOverlay(session.storyId),
          tensionHigh ? "animate-pulse" : tensionMedium ? "opacity-95" : "opacity-70"
        )}
        style={tensionHigh ? { animationDuration: "0.8s" } : undefined}
        aria-hidden
      />
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref={`/lobby/${code}?player=${viewer.id}&demo=1`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={viewer.id}
        showInvite
        isDemo
        phaseLabel="Story"
        playerName={viewer.name}
      />
      <div className="content-wrap space-y-4">
        <section className="panel space-y-2 p-5">
          <p className="badge w-fit">Story Phase</p>
          <h1 className="text-2xl font-black sm:text-3xl">Decision Under Pressure</h1>
          <p className="text-sm text-zinc-300">The clock runs, chaos rises, and each turn reshapes the ending.</p>
        </section>
        <RoomCodeCard code={code} players={session.players} title="Demo Room" />
        <NarratorBanner line={narration} />
      <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[1fr_280px]">
        <section className={clsx("panel flex flex-col gap-5 p-5", tensionHigh ? "tension-pulse" : "")}>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">{storyLabel}</p>
            <p className="rounded-full border border-white/20 px-3 py-1 text-sm">
              Tension {tensionLevel}/5 - Current turn: {activePlayer.name}
            </p>
          </header>

          <Typewriter text={scene?.text ?? "Demo story unavailable."} charsPerSecond={30} />

          {!isDone ? (
            <div className="space-y-3">
              <div className="space-y-2">
                {scene?.choices?.slice(0, 2).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="btn btn-secondary w-full py-4 text-left"
                    onClick={() => choose(choice.id)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full py-4 text-lg"
              onClick={() => {
                router.push(`/recap/${code}?demo=1`);
              }}
            >
              Finish Demo Story
            </button>
          )}
        </section>

        <aside className="panel space-y-4 p-4">
          <RiftStatusCard
            genrePower={session.genrePower}
            chaosLevel={session.chaosLevel}
            activeEvent={session.activeRiftEvent}
          />
          <h2 className="mb-3 text-lg font-semibold">Turn Order</h2>
          <div className="space-y-2">
            {session.turnOrder.map((id, index) => {
              const player = session.players.find((entry) => entry.id === id);
              if (!player) {
                return null;
              }

              return (
                <div
                  key={id}
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm",
                    id === activePlayer.id ? "border-cyan-300 bg-cyan-500/15" : "border-white/15 bg-black/25"
                  )}
                >
                  #{index + 1} {player.name}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-zinc-400">Step {session.history.length + 1} - branching demo story</p>
        </aside>
      </div>
      </div>
    </main>
  );
}

type RealtimeGameProps = {
  code: string;
  playerId: string;
};

function RealtimeGame({ code, playerId }: RealtimeGameProps) {
  const router = useRouter();

  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingMs, setRemainingMs] = useState(30000);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(null);
  const [narration, setNarration] = useState<NarrationLine | null>(null);
  const lastNarrationIdRef = useRef<string | null>(null);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === room.activePlayerId) ?? null,
    [room]
  );
  const selfPlayer = useMemo(() => room?.players.find((player) => player.id === playerId) ?? null, [room, playerId]);

  const isActivePlayer = room?.activePlayerId === playerId;
  const scene = room?.currentScene;
  const genre = room?.genre ?? null;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const timerColor = seconds > 15 ? "#39ff14" : seconds > 10 ? "#ffd166" : "#ff3b3b";
  const tensionHigh = seconds <= 10;

  useEffect(() => {
    let mounted = true;

    async function loadState() {
      try {
        const response = await apiFetch(`/api/game/${code}`);
        const data = (await response.json()) as RoomView | { error: string };
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Game not found");
        }
        if (mounted) {
          setRoom(data);
          setNarration(data.latestNarration ?? null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Could not load game");
        }
      }
    }

    void loadState();

    return () => {
      mounted = false;
    };
  }, [code]);

  useEffect(() => {
    const socket = getSocketClient();
    socket.emit("join_room", { code, playerId });

    socket.on("scene_update", (payload: RoomView) => {
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      setSubmitting(false);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    });

    socket.on("room_updated", (payload: RoomView) => {
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    });

    socket.on("reconnect_state", (payload: RoomView) => {
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    });

    socket.on("narrator_update", (payload: NarratorUpdatePayload) => {
      if (!payload?.line) {
        return;
      }
      setNarration(payload.line);
    });

    socket.on("turn_timer", (payload: { playerId: string; remainingMs: number }) => {
      if (payload.playerId === room?.activePlayerId) {
        setRemainingMs(payload.remainingMs);
      }
    });

    socket.on("turn_timeout", (payload: { playerId: string }) => {
      const player = room?.players.find((entry) => entry.id === payload.playerId);
      setTimeoutNotice(`${player?.name ?? "A player"} took too long. Random choice made.`);
      window.setTimeout(() => setTimeoutNotice(null), 2200);
    });

    socket.on("game_end", () => {
      router.push(`/recap/${code}?player=${playerId}`);
    });

    socket.on("server_error", (payload: { message: string }) => {
      const message = payload.message || "Server error";
      // Don't hard-fail the game UI for transient WS errors; allow reconnect.
      if (/realtime|connect/i.test(message)) {
        setToast(message);
        setSubmitting(false);
        return;
      }
      setError(message);
      setSubmitting(false);
    });

    return () => {
      socket.off("scene_update");
      socket.off("room_updated");
      socket.off("reconnect_state");
      socket.off("turn_timer");
      socket.off("turn_timeout");
      socket.off("game_end");
      socket.off("narrator_update");
      socket.off("server_error");
    };
  }, [code, playerId, room?.activePlayerId, room?.players, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!narration || narration.id === lastNarrationIdRef.current) {
      return;
    }
    lastNarrationIdRef.current = narration.id;
    trackEvent("narrator_line_emitted", {
      code,
      trigger: narration.trigger,
      tone: narration.tone,
    });
  }, [code, narration]);

  useEffect(() => {
    if (!room?.turnDeadline || room.phase !== "game") {
      return;
    }

    const interval = window.setInterval(() => {
      const nextRemaining = room.turnDeadline ? room.turnDeadline - Date.now() : 0;
      setRemainingMs(nextRemaining);
    }, 150);

    return () => window.clearInterval(interval);
  }, [room?.turnDeadline, room?.phase]);

  function submitPreset(choiceId: string) {
    if (!isActivePlayer) {
      return;
    }
    setSubmitting(true);
    // TODO(multiplayer): Route through authoritative turn validation service when enabled.
    getSocketClient().emit("submit_choice", { code, playerId, choiceId });
    navigator.vibrate?.(28);
  }

  if (error) {
    return (
      <main className="page-shell page-with-top-bar">
        <SessionTopBar
          backHref={`/lobby/${code}?player=${playerId}`}
          backLabel="Back to Lobby"
          roomCode={code}
          playerId={playerId}
          showInvite
          phaseLabel="Story"
          playerName={selfPlayer?.name}
        />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel max-w-lg p-6">
            <p className="text-red-300">{error}</p>
            <button className="btn btn-primary mt-4" type="button" onClick={() => router.push(`/lobby/${code}?player=${playerId}`)}>
              Return to lobby
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!room || !scene) {
    return (
      <main className="page-shell page-with-top-bar">
        <SessionTopBar
          backHref={`/lobby/${code}?player=${playerId}`}
          backLabel="Back to Lobby"
          roomCode={code}
          playerId={playerId}
          showInvite
          phaseLabel="Story"
          playerName={selfPlayer?.name}
        />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading game state...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell page-with-top-bar">
      <div className={clsx("absolute inset-0 opacity-80", genreOverlay(genre), tensionHigh ? "animate-pulse" : "")} aria-hidden />
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref={`/lobby/${code}?player=${playerId}`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="Story"
        playerName={selfPlayer?.name}
      />

      <div className="content-wrap space-y-4">
        <section className="panel space-y-2 p-5">
          <p className="badge w-fit">Story Phase</p>
          <h1 className="text-2xl font-black sm:text-3xl">Decision Under Pressure</h1>
          <p className="text-sm text-zinc-300">Only one player acts per turn. Everyone else tracks the fallout in real time.</p>
        </section>
        {timeoutNotice ? <p className="text-sm text-yellow-300">{timeoutNotice}</p> : null}
        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
        {isActivePlayer ? (
          <div
            className="rounded-xl border-2 border-cyan-400 bg-cyan-500/20 px-4 py-3 text-center text-lg font-bold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.3)] animate-pulse"
            aria-live="polite"
            role="status"
          >
            Your turn, {activePlayer?.name ?? "Player"} — make your move
          </div>
        ) : null}
        <NarratorBanner line={narration} />
        <RoomCodeCard
          code={code}
          title="Live Room"
          players={room.players.map((player) => ({ id: player.id, name: player.name }))}
        />
      <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[1fr_280px]">
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">{room.storyTitle}</p>
            {/* TODO(multiplayer): Replace local gate with shared turn-state reconciliation across clients. */}
            <p className="rounded-full border border-white/20 px-3 py-1 text-sm">
              {isActivePlayer ? `Your Turn, ${activePlayer?.name ?? "Player"}` : `Waiting for ${activePlayer?.name ?? "Player"}`}
            </p>
          </header>

          <Typewriter text={scene.text} charsPerSecond={30} />

          {isActivePlayer ? (
            <div className="space-y-3">
              <div className="timer-ring" style={{ ["--timer-color" as string]: timerColor }}>
                <strong>{seconds}</strong>
              </div>

              <div className="space-y-2">
                {scene.choices?.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="btn btn-secondary w-full py-4 text-left"
                    onClick={() => submitPreset(choice.id)}
                    disabled={submitting}
                    aria-label={`Choose ${choice.text ?? choice.label ?? "continue"}`}
                  >
                    {choice.text ?? choice.label ?? "Continue"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-300">Waiting for {activePlayer?.name ?? "player"} to decide...</p>
          )}
        </section>

        <aside className="panel space-y-4 p-4">
          <RiftStatusCard
            genrePower={room.genrePower}
            chaosLevel={room.chaosLevel}
            activeEvent={room.activeRiftEvent}
          />
          <h2 className="mb-3 text-lg font-semibold">Turn Order</h2>
          <div className="space-y-2">
            {room.turnOrder.map((id, index) => {
              const player = room.players.find((entry) => entry.id === id);
              if (!player) {
                return null;
              }

              const active = id === room.activePlayerId;
              return (
                <div
                  key={id}
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm",
                    active ? "border-cyan-300 bg-cyan-500/15" : "border-white/15 bg-black/25"
                  )}
                >
                  #{index + 1} {player.name}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";

  if (code === "DEMO1") {
    return <DemoGame code={code} playerId={playerId || "demo-host"} />;
  }

  return <RealtimeGame code={code} playerId={playerId} />;
}
