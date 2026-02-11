"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { getSocketClient } from "../../../lib/socket-client";
import { apiFetch } from "../../../lib/api-client";
import Typewriter from "../../../components/typewriter";
import RoomCodeCard from "../../../components/room-code-card";
import {
  advanceDemoStoryChoice,
  advanceDemoStoryFreeChoice,
  getDemoSession,
  getDemoStoryTree,
} from "../../../lib/demo-session";
import { soundManager } from "../../../lib/soundManager";
import { getNodeById, getStoryStartNode } from "../../../lib/story-utils";
import type { RoomView } from "../../../types/game";

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
};

function DemoGame({ code }: DemoGameProps) {
  const router = useRouter();
  const [freeText, setFreeText] = useState("");
  const [freeChoiceError, setFreeChoiceError] = useState<string | null>(null);
  const [, rerender] = useState(0);

  const session = getDemoSession();
  const storyTree = getDemoStoryTree();
  const scene = getNodeById(storyTree, session.currentNodeId) ?? getStoryStartNode(storyTree);
  const activePlayerId = session.currentPlayerId;
  const activePlayer = session.players.find((player) => player.id === activePlayerId) ?? session.players[0];
  const isDone = Boolean(scene?.ending);
  const tensionLevel = scene?.tensionLevel ?? 1;
  const tensionHigh = tensionLevel >= 4;
  const tensionMedium = tensionLevel === 3;

  useEffect(() => {
    soundManager.transitionLoop("zombie");
    return () => {
      soundManager.stopLoop("zombie");
    };
  }, []);

  function choose(choiceId: string) {
    soundManager.play("scene_transition");
    advanceDemoStoryChoice(choiceId);
    setFreeChoiceError(null);
    setFreeText("");
    rerender((value) => value + 1);
  }

  function submitFreeChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = freeText.trim();
    if (trimmed.length < 4) {
      setFreeChoiceError("Enter at least 4 characters for free choice.");
      return;
    }
    soundManager.play("scene_transition");
    advanceDemoStoryFreeChoice(trimmed);
    setFreeChoiceError(null);
    setFreeText("");
    rerender((value) => value + 1);
  }

  return (
    <main className="page-shell">
      <div
        className={clsx(
          "absolute inset-0 opacity-80",
          genreOverlay("zombie"),
          tensionHigh ? "animate-pulse" : tensionMedium ? "opacity-95" : "opacity-70"
        )}
        style={tensionHigh ? { animationDuration: "0.8s" } : undefined}
        aria-hidden
      />
      <div className="suspense-wash" aria-hidden />
      <div className="content-wrap space-y-4">
        <RoomCodeCard code={code} players={session.players} title="Demo Room" />
      <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[1fr_280px]">
        <section className={clsx("panel flex flex-col gap-5 p-5", tensionHigh ? "tension-pulse" : "")}>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Zombie Outbreak (Demo)</p>
            <p className="rounded-full border border-white/20 px-3 py-1 text-sm">
              Tension {tensionLevel}/5 - Your Turn, {activePlayer.name}
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

              <form className="space-y-2" onSubmit={submitFreeChoice}>
                <label className="text-sm text-zinc-300" htmlFor="free-choice-demo">
                  Or describe your own action
                </label>
                <textarea
                  id="free-choice-demo"
                  className="field min-h-22"
                  maxLength={60}
                  placeholder="Type your action..."
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                />
                {freeChoiceError ? <p className="text-sm text-red-300">{freeChoiceError}</p> : null}
                <button type="submit" className="btn btn-primary w-full py-3 font-semibold">
                  Submit Free Choice
                </button>
              </form>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full py-4 text-lg font-semibold"
              onClick={() => {
                soundManager.play("button_click");
                router.push(`/recap/${code}?demo=1`);
              }}
            >
              Finish Demo Story
            </button>
          )}
        </section>

        <aside className="panel p-4">
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
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingMs, setRemainingMs] = useState(30000);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(null);
  const warningSecondRef = useRef<number | null>(null);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === room.activePlayerId) ?? null,
    [room]
  );

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
      setSubmitting(false);
      setFreeText("");
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    });

    socket.on("room_updated", (payload: RoomView) => {
      setRoom(payload);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    });

    socket.on("reconnect_state", (payload: RoomView) => {
      setRoom(payload);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
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
    if (!room?.turnDeadline || room.phase !== "game") {
      return;
    }

    const interval = window.setInterval(() => {
      const nextRemaining = room.turnDeadline ? room.turnDeadline - Date.now() : 0;
      setRemainingMs(nextRemaining);
    }, 150);

    return () => window.clearInterval(interval);
  }, [room?.turnDeadline, room?.phase]);

  useEffect(() => {
    if (genre === "zombie") {
      soundManager.transitionLoop("zombie");
    } else if (genre === "alien") {
      soundManager.transitionLoop("alien");
    } else if (genre === "haunted") {
      soundManager.transitionLoop("haunted");
    }

    return () => {
      soundManager.stopLoop("zombie");
      soundManager.stopLoop("alien");
      soundManager.stopLoop("haunted");
    };
  }, [genre]);

  useEffect(() => {
    if (!isActivePlayer || seconds > 10 || seconds <= 0) {
      warningSecondRef.current = null;
      return;
    }
    if (warningSecondRef.current === seconds) {
      return;
    }
    soundManager.play("timer_warning", { volume: 0.75 });
    warningSecondRef.current = seconds;
  }, [isActivePlayer, seconds]);

  function submitPreset(choiceId: string) {
    if (!isActivePlayer) {
      return;
    }
    setSubmitting(true);
    soundManager.play("button_click");
    // TODO(multiplayer): Route through authoritative turn validation service when enabled.
    getSocketClient().emit("submit_choice", { code, playerId, choiceId });
    navigator.vibrate?.(28);
  }

  function submitFreeChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isActivePlayer || freeText.trim().length < 5) {
      return;
    }
    setSubmitting(true);
    soundManager.play("scene_transition");
    // TODO(multiplayer): Add moderation + semantic routing for free text on the server.
    getSocketClient().emit("submit_choice", { code, playerId, freeText: freeText.trim().slice(0, 60) });
    navigator.vibrate?.(35);
  }

  if (error) {
    return (
      <main className="page-shell">
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
      <main className="page-shell">
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading game state...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className={clsx("absolute inset-0 opacity-80", genreOverlay(genre), tensionHigh ? "animate-pulse" : "")} aria-hidden />
      <div className="suspense-wash" aria-hidden />

      <div className="content-wrap space-y-4">
        {timeoutNotice ? <p className="text-sm text-yellow-300">{timeoutNotice}</p> : null}
        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
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

              <form onSubmit={submitFreeChoice} className="space-y-2">
                <label className="text-sm text-zinc-300" htmlFor="free-choice">
                  Or describe your own action
                </label>
                <textarea
                  id="free-choice"
                  className="field min-h-22"
                  maxLength={60}
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                  placeholder="Type custom action"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{freeText.length}/60</span>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || freeText.trim().length < 5}
                  >
                    {submitting ? "Submitting..." : "Submit Choice"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <p className="text-zinc-300">Waiting for {activePlayer?.name ?? "player"} to decide...</p>
          )}
        </section>

        <aside className="panel p-4">
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
    return <DemoGame code={code} />;
  }

  return <RealtimeGame code={code} playerId={playerId} />;
}
