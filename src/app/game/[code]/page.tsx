"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { getSocketClient } from "../../../lib/socket-client";
import { apiFetch } from "../../../lib/api-client";
import { trackEvent } from "../../../lib/analytics";
import RoomCodeCard from "../../../components/room-code-card";
import NarratorBanner from "../../../components/narrator-banner";
import RiftImmersionLayer from "../../../components/rift-immersion-layer";
import SceneShell from "../../../components/motion/scene-shell";
import ImpactFlash from "../../../components/motion/impact-flash";
import {
  advanceDemoStoryChoice,
  getDemoSession,
  getDemoStoryTree,
} from "../../../lib/demo-session";
import { getNodeById, getStoryStartNode } from "../../../lib/story-utils";
import SessionTopBar from "../../../components/session-top-bar";
import MobileChoiceCard from "../../../components/mobile-choice-card";
import ChoiceTimer from "../../../components/choice-timer";
import StoryBeatView from "../../../components/story-beat-view";
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

function detectRiftVisualTier(): "high" | "medium" | "low" {
  if (typeof window === "undefined") {
    return "medium";
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    return "low";
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (memory <= 2 || cores <= 4) {
    return "low";
  }
  if (memory <= 4 || cores <= 6) {
    return "medium";
  }
  return "high";
}

type DemoGameProps = {
  code: string;
  playerId: string;
};

function DemoGame({ code, playerId }: DemoGameProps) {
  const router = useRouter();
  const [, rerender] = useState(0);
  const [overlayFallback, setOverlayFallback] = useState<string | null>(null);
  const [rememberToast, setRememberToast] = useState<string | null>(null);
  const [demoSeconds, setDemoSeconds] = useState(30);
  const [riftTier, setRiftTier] = useState<"high" | "medium" | "low">("medium");
  const lastDemoRiftIdRef = useRef<string | null>(null);

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
  const directed = session.directedScene;
  const cue = directed?.motionCue ?? null;
  const showImpact = directed?.beatType === "payoff" || directed?.beatType === "fracture";

  useEffect(() => {
    setRiftTier(detectRiftVisualTier());
  }, []);

  useEffect(() => {
    if (!overlayFallback) {
      return;
    }
    const timeout = window.setTimeout(() => setOverlayFallback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [overlayFallback]);

  useEffect(() => {
    if (!rememberToast) {
      return;
    }
    const timeout = window.setTimeout(() => setRememberToast(null), 1900);
    return () => window.clearTimeout(timeout);
  }, [rememberToast]);

  useEffect(() => {
    setDemoSeconds(30);
  }, [session.currentNodeId]);

  useEffect(() => {
    if (isDone) {
      return;
    }
    const timer = window.setInterval(() => {
      setDemoSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isDone, session.currentNodeId]);

  useEffect(() => {
    if (!session.activeRiftEvent || session.activeRiftEvent.id === lastDemoRiftIdRef.current) {
      return;
    }
    lastDemoRiftIdRef.current = session.activeRiftEvent.id;
    trackEvent("rift_event_triggered", {
      code,
      mode: "demo",
      eventType: session.activeRiftEvent.type,
      chaos: session.activeRiftEvent.chaosLevel,
    });
  }, [code, session.activeRiftEvent]);

  function choose(choiceId: string) {
    const selected = scene?.choices?.find((entry) => entry.id === choiceId);
    setRememberToast(`Reality remembers: ${selected?.label ?? "This move."}`);
    advanceDemoStoryChoice(choiceId);
    rerender((value) => value + 1);
  }

  return (
    <SceneShell cue={cue} className="page-with-top-bar">
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
      <ImpactFlash active={Boolean(showImpact)} />
      <RiftImmersionLayer
        event={session.activeRiftEvent}
        chaosLevel={session.chaosLevel}
        sceneId={session.currentNodeId}
        tier={riftTier}
        interactionBusy={false}
        onOverlayRendered={(event) =>
          trackEvent("rift_overlay_rendered", {
            code,
            mode: "demo",
            eventType: event.type,
            chaos: event.chaosLevel,
          })
        }
        onOverlayFallback={(event) => {
          trackEvent("rift_overlay_fallback_used", { code, mode: "demo", eventType: event.type });
          setOverlayFallback(`${event.title}: ${event.description}`);
        }}
        onOverlayResolved={(event) =>
          trackEvent("rift_event_resolved", { code, mode: "demo", eventType: event.type })
        }
      />
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
          <p className="inline-flex w-fit items-center rounded-full border border-cyan-300/50 bg-cyan-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
            Director v1 Active
          </p>
        </section>
        {overlayFallback ? <p className="text-sm text-fuchsia-200">{overlayFallback}</p> : null}
        {rememberToast ? (
          <motion.p
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="rounded-xl border border-fuchsia-300/45 bg-fuchsia-500/15 px-4 py-3 text-sm font-semibold text-fuchsia-100"
          >
            {rememberToast}
          </motion.p>
        ) : null}
        <RoomCodeCard code={code} players={session.players} title="Demo Room" />
        <NarratorBanner line={narration} />
        <section className="rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.16)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Reality remembers</p>
          <p className="mt-1">
            <span className="font-semibold">Reality remembers:</span>{" "}
            {session.realityRemembersLine ?? "The Rift is watching every move."}
          </p>
        </section>
        {session.splitVoteConsequence ? (
          <section className="rounded-xl border border-orange-300/45 bg-orange-500/12 px-4 py-3 text-sm text-orange-100 shadow-[0_0_24px_rgba(251,146,60,0.12)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">Fractured Outcome</p>
            <p className="mt-1">{session.splitVoteConsequence.detail}</p>
          </section>
        ) : null}
        {session.latestWorldEvent ? (
          <section className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 px-4 py-3 shadow-[0_0_24px_rgba(217,70,239,0.2)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">World Shift</p>
            <p className="mt-1 text-sm font-semibold text-white">{session.latestWorldEvent.title}</p>
            <p className="mt-1 text-xs text-fuchsia-100/90">{session.latestWorldEvent.detail}</p>
          </section>
        ) : null}
      <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[1fr_280px]">
        <section className={clsx("panel flex flex-col gap-5 p-5", tensionHigh ? "tension-pulse" : "")}>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">{storyLabel}</p>
            <p className="rounded-full border border-white/20 px-3 py-1 text-sm">
              Tension {tensionLevel}/5 - Current turn: {activePlayer.name}
            </p>
          </header>

          <StoryBeatView text={directed?.renderedText ?? scene?.text ?? "Demo story unavailable."} />

          {!isDone ? (
            <div className="space-y-3">
              <ChoiceTimer seconds={demoSeconds} maxSeconds={30} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">What do you do?</p>
              <div className="space-y-2">
                {scene?.choices?.slice(0, 2).map((choice, index) => (
                  <MobileChoiceCard
                    key={choice.id}
                    choice={choice}
                    onSelect={() => choose(choice.id)}
                    index={index}
                  />
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
          <div className="rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-xs uppercase tracking-[0.18em] text-cyan-200">
            {directed?.beatType ?? "setup"} • {directed?.pressureBand ?? "calm"}
          </div>
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
    </SceneShell>
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
  const [overlayFallback, setOverlayFallback] = useState<string | null>(null);
  const [rememberToast, setRememberToast] = useState<string | null>(null);
  const [riftTier, setRiftTier] = useState<"high" | "medium" | "low">("medium");
  const [missedEventsNotice, setMissedEventsNotice] = useState<string | null>(null);
  const lastNarrationIdRef = useRef<string | null>(null);
  const lastRiftIdRef = useRef<string | null>(null);
  const roomRef = useRef<RoomView | null>(null);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === room.activePlayerId) ?? null,
    [room]
  );
  const selfPlayer = useMemo(() => room?.players.find((player) => player.id === playerId) ?? null, [room, playerId]);

  const isActivePlayer = room?.activePlayerId === playerId;
  const scene = room?.currentScene;
  const genre = room?.genre ?? null;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const tensionHigh = seconds <= 10;
  const cue = room?.directedScene?.motionCue ?? null;
  const showImpact = room?.directedScene?.beatType === "payoff" || room?.directedScene?.beatType === "fracture";

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    setRiftTier(detectRiftVisualTier());
  }, []);

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

    const onSceneUpdate = (payload: RoomView) => {
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      setSubmitting(false);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    };

    const onRoomUpdated = (payload: RoomView) => {
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    };

    const onReconnectState = (payload: RoomView) => {
      const previousCount = roomRef.current?.worldState.timeline.length ?? 0;
      const nextCount = payload.worldState.timeline.length;
      if (nextCount > previousCount) {
        setMissedEventsNotice(`You missed ${nextCount - previousCount} world event${nextCount - previousCount === 1 ? "" : "s"} while reconnecting.`);
      }
      setRoom(payload);
      setNarration(payload.latestNarration ?? null);
      if (payload.turnDeadline) {
        setRemainingMs(Math.max(0, payload.turnDeadline - Date.now()));
      }
    };

    const onNarratorUpdate = (payload: NarratorUpdatePayload) => {
      if (!payload?.line) {
        return;
      }
      setNarration(payload.line);
    };

    const onTurnTimer = (payload: { playerId: string; remainingMs: number }) => {
      if (payload.playerId === roomRef.current?.activePlayerId) {
        setRemainingMs(payload.remainingMs);
      }
    };

    const onTurnTimeout = (payload: { playerId: string }) => {
      const player = roomRef.current?.players.find((entry) => entry.id === payload.playerId);
      setTimeoutNotice(`${player?.name ?? "A player"} took too long. Random choice made.`);
      window.setTimeout(() => setTimeoutNotice(null), 2200);
    };

    const onGameEnd = () => {
      router.push(`/recap/${code}?player=${playerId}`);
    };

    const onServerError = (payload: { message: string }) => {
      const message = payload.message || "Server error";
      // Don't hard-fail the game UI for transient WS errors; allow reconnect.
      if (/realtime|connect/i.test(message)) {
        setToast(message);
        setSubmitting(false);
        return;
      }
      if (/not your turn|turn update|invalid player session/i.test(message)) {
        setToast(message);
        setSubmitting(false);
        void apiFetch(`/api/game/${code}`)
          .then(async (response) => (response.ok ? ((await response.json()) as RoomView) : null))
          .then((snapshot) => {
            if (snapshot) {
              setRoom(snapshot);
            }
          })
          .catch(() => {});
        return;
      }
      setError(message);
      setSubmitting(false);
    };

    socket.on("scene_update", onSceneUpdate);
    socket.on("room_updated", onRoomUpdated);
    socket.on("reconnect_state", onReconnectState);
    socket.on("narrator_update", onNarratorUpdate);
    socket.on("turn_timer", onTurnTimer);
    socket.on("turn_timeout", onTurnTimeout);
    socket.on("game_end", onGameEnd);
    socket.on("server_error", onServerError);

    return () => {
      socket.off("scene_update", onSceneUpdate);
      socket.off("room_updated", onRoomUpdated);
      socket.off("reconnect_state", onReconnectState);
      socket.off("narrator_update", onNarratorUpdate);
      socket.off("turn_timer", onTurnTimer);
      socket.off("turn_timeout", onTurnTimeout);
      socket.off("game_end", onGameEnd);
      socket.off("server_error", onServerError);
    };
  }, [code, playerId, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!overlayFallback) {
      return;
    }
    const timer = window.setTimeout(() => setOverlayFallback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [overlayFallback]);

  useEffect(() => {
    if (!missedEventsNotice) {
      return;
    }
    const timer = window.setTimeout(() => setMissedEventsNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [missedEventsNotice]);

  useEffect(() => {
    if (!rememberToast) {
      return;
    }
    const timer = window.setTimeout(() => setRememberToast(null), 1900);
    return () => window.clearTimeout(timer);
  }, [rememberToast]);

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
    const activeRift = room?.activeRiftEvent;
    if (!activeRift || activeRift.id === lastRiftIdRef.current) {
      return;
    }
    lastRiftIdRef.current = activeRift.id;
    trackEvent("rift_event_triggered", {
      code,
      eventType: activeRift.type,
      chaos: activeRift.chaosLevel,
      step: activeRift.step,
    });
  }, [code, room?.activeRiftEvent]);

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
    const selectedLabel =
      scene?.choices?.find((entry) => entry.id === choiceId)?.label ??
      scene?.choices?.find((entry) => entry.id === choiceId)?.text ??
      "This move.";
    setRememberToast(`Reality remembers: ${selectedLabel}`);
    setSubmitting(true);
    getSocketClient().emit("submit_choice", { code, playerId, choiceId });
    navigator.vibrate?.(28);
  }

  if (error) {
    return (
      <SceneShell cue={cue} className="page-with-top-bar">
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
      </SceneShell>
    );
  }

  if (!room || !scene) {
    return (
      <SceneShell cue={cue} className="page-with-top-bar">
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
      </SceneShell>
    );
  }

  return (
    <SceneShell cue={cue} className="page-with-top-bar">
      <div className={clsx("absolute inset-0 opacity-80", genreOverlay(genre), tensionHigh ? "animate-pulse" : "")} aria-hidden />
      <div className="suspense-wash" aria-hidden />
      <ImpactFlash active={Boolean(showImpact)} />
      <RiftImmersionLayer
        event={room.activeRiftEvent}
        chaosLevel={room.chaosLevel}
        sceneId={scene.id}
        tier={riftTier}
        interactionBusy={Boolean(isActivePlayer && !submitting)}
        onOverlayRendered={(event) =>
          trackEvent("rift_overlay_rendered", {
            code,
            eventType: event.type,
            chaos: event.chaosLevel,
          })
        }
        onOverlayFallback={(event) => {
          trackEvent("rift_overlay_fallback_used", {
            code,
            eventType: event.type,
          });
          setOverlayFallback(`${event.title}: ${event.description}`);
        }}
        onOverlayResolved={(event) =>
          trackEvent("rift_event_resolved", {
            code,
            eventType: event.type,
          })
        }
      />
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
          <p className="inline-flex w-fit items-center rounded-full border border-cyan-300/50 bg-cyan-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
            Director v1 Active
          </p>
        </section>
        {timeoutNotice ? <p className="text-sm text-yellow-300">{timeoutNotice}</p> : null}
        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
        {missedEventsNotice ? <p className="text-sm text-fuchsia-200">{missedEventsNotice}</p> : null}
        {overlayFallback ? <p className="text-sm text-fuchsia-200">{overlayFallback}</p> : null}
        {rememberToast ? (
          <motion.p
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="rounded-xl border border-fuchsia-300/45 bg-fuchsia-500/15 px-4 py-3 text-sm font-semibold text-fuchsia-100"
          >
            {rememberToast}
          </motion.p>
        ) : null}
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
        <section className="rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.16)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Reality remembers</p>
          <p className="mt-1">
            <span className="font-semibold">Reality remembers:</span>{" "}
            {room.realityRemembersLine ?? "The Rift is watching every move."}
          </p>
        </section>
        {room.splitVoteConsequence ? (
          <section className="rounded-xl border border-orange-300/45 bg-orange-500/12 px-4 py-3 text-sm text-orange-100 shadow-[0_0_24px_rgba(251,146,60,0.12)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">Fractured Outcome</p>
            <p className="mt-1">{room.splitVoteConsequence.detail}</p>
          </section>
        ) : null}
        {room.latestWorldEvent ? (
          <section className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 px-4 py-3 shadow-[0_0_24px_rgba(217,70,239,0.2)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">World Shift</p>
            <p className="mt-1 text-sm font-semibold text-white">{room.latestWorldEvent.title}</p>
            <p className="mt-1 text-xs text-fuchsia-100/90">{room.latestWorldEvent.detail}</p>
          </section>
        ) : null}
        <RoomCodeCard
          code={code}
          title="Live Room"
          players={room.players.map((player) => ({ id: player.id, name: player.name }))}
        />
      <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[1fr_280px]">
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">{room.storyTitle}</p>
            <p className="rounded-full border border-white/20 px-3 py-1 text-sm">
              {isActivePlayer ? `Your Turn, ${activePlayer?.name ?? "Player"}` : `Waiting for ${activePlayer?.name ?? "Player"}`}
            </p>
          </header>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
            {(room.directedScene?.beatType ?? "setup").replaceAll("_", " ")} • {(room.directedScene?.pressureBand ?? "calm").replaceAll("_", " ")}
          </p>

          <StoryBeatView text={room.directedScene?.renderedText ?? scene.text} />

          {isActivePlayer ? (
            <div className="space-y-3">
              <ChoiceTimer seconds={seconds} maxSeconds={30} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">What do you do?</p>

              <div className="space-y-2">
                {scene.choices?.map((choice, index) => (
                  <MobileChoiceCard
                    key={choice.id}
                    choice={choice}
                    onSelect={() => submitPreset(choice.id)}
                    disabled={submitting}
                    locked={submitting}
                    index={index}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-300">Waiting for {activePlayer?.name ?? "player"} to decide...</p>
          )}
        </section>

        <aside className="panel space-y-4 p-4">
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
    </SceneShell>
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
