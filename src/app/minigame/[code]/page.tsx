"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { getSocketClient } from "../../../lib/socket-client";
import { generateNarrationLine } from "../../../lib/narrator";
import { setDemoMinigameOrder } from "../../../lib/demo-session";
import NarratorBanner from "../../../components/narrator-banner";
import SessionTopBar from "../../../components/session-top-bar";
import type { GenreId, NarrationLine, Player } from "../../../types/game";
import type { NarratorUpdatePayload } from "../../../types/realtime";

type Phase = "countdown" | "playing" | "waiting" | "results" | "revealed";

const GENRES: Array<{ id: GenreId; name: string; icon: string }> = [
  { id: "zombie", name: "Zombie Outbreak", icon: "Z" },
  { id: "alien", name: "Alien Invasion", icon: "A" },
  { id: "haunted", name: "Haunted Manor", icon: "H" },
];

function angleDiff(a: number, b: number) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function buildMinigameNarration(input: {
  code: string;
  playerName: string;
  trigger: "scene_enter" | "choice_submitted";
  historyLength: number;
  tensionLevel: number;
}): NarrationLine {
  return generateNarrationLine({
    code: input.code,
    trigger: input.trigger,
    genre: "zombie",
    sceneId: "minigame",
    historyLength: input.historyLength,
    tensionLevel: input.tensionLevel,
    playerId: null,
    playerName: input.playerName,
    choiceLabel: input.trigger === "choice_submitted" ? "locked in a score" : "steady hands",
    endingType: null,
  });
}

type DemoProps = {
  code: string;
  playerId: string;
};

function DemoMinigame({ code, playerId }: DemoProps) {
  const router = useRouter();
  const playerName = playerId === "demo-p2" ? "Player 2" : playerId === "demo-p3" ? "Player 3" : "Host";
  const [barProgress, setBarProgress] = useState(0);
  const [direction, setDirection] = useState(1);
  const [score, setScore] = useState(0);
  const [taps, setTaps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [finished, setFinished] = useState(false);
  const [narration, setNarration] = useState<NarrationLine | null>(() =>
    buildMinigameNarration({
      code,
      playerName,
      trigger: "scene_enter",
      historyLength: 0,
      tensionLevel: 2,
    })
  );

  useEffect(() => {
    if (finished) {
      return;
    }

    const timer = window.setInterval(() => {
      setBarProgress((value) => {
        const next = value + direction * 3;
        if (next >= 100) {
          setDirection(-1);
          return 100;
        }
        if (next <= 0) {
          setDirection(1);
          return 0;
        }
        return next;
      });
    }, 45);

    return () => window.clearInterval(timer);
  }, [direction, finished]);

  useEffect(() => {
    if (finished) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          setFinished(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    if (!finished) {
      return;
    }
    setNarration(
      buildMinigameNarration({
        code,
        playerName,
        trigger: "choice_submitted",
        historyLength: taps,
        tensionLevel: 4,
      })
    );
  }, [code, finished, playerName, taps]);

  function tapBar() {
    if (finished) {
      return;
    }

    const inRedZone = barProgress >= 60 && barProgress <= 80;
    setTaps((value) => value + 1);
    setScore((value) => value + (inRedZone ? 100 : 25));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 150);
  }

  function finishDemoMinigame() {
    // TODO(multiplayer): Replace fixed demo order with server-ranked results once demo mode is removed.
    setDemoMinigameOrder(["demo-host", "demo-p2", "demo-p3"]);
    const nextPlayer = playerId || "demo-host";
    router.push(`/game/${code}?player=${nextPlayer}&demo=1`);
  }

  return (
    <main className="page-shell page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref={`/lobby/${code}?player=${playerId || "demo-host"}&demo=1`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId || "demo-host"}
        showInvite
        isDemo
        phaseLabel="Minigame"
        playerName={playerName}
      />
      <div className="content-wrap flex min-h-dvh flex-col items-center justify-center gap-6">
        <NarratorBanner line={narration} compact />
        <h1 className="text-3xl font-bold">Reflex Roulette (Demo)</h1>
        <div className={clsx("rounded-full border px-5 py-2 text-lg font-black", timeLeft <= 3 ? "tension-pulse border-red-400 text-red-300" : "border-cyan-300 text-cyan-300")}>
          {timeLeft}s
        </div>
        <p className="text-center text-zinc-300">Tap when the marker is inside the red zone.</p>

        <div className={`panel w-full max-w-2xl space-y-4 p-6 ${flash ? "ring-2 ring-red-400" : ""}`}>
          <div className="relative h-10 rounded-full bg-zinc-800">
            <div className={clsx("absolute left-[60%] top-0 h-full w-[20%] rounded-full bg-red-500/70", flash ? "bg-red-300/90" : "")} />
            <div
              className={clsx("absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-cyan-300 shadow-glow", flash ? "scale-110" : "")}
              style={{ left: `calc(${barProgress}% - 12px)` }}
            />
          </div>

          <button type="button" className="btn btn-danger w-full py-4 text-lg font-semibold" onClick={tapBar} disabled={finished}>
            Tap when bar is in the red zone
          </button>

          <div className="flex items-center justify-between text-sm text-zinc-300">
            <span>Taps: {taps}</span>
            <span>Score: {score}</span>
          </div>
        </div>

        <button type="button" className="btn btn-primary w-full max-w-2xl py-4 text-lg font-semibold sm:text-xl" onClick={finishDemoMinigame}>
          Finish Demo Minigame
        </button>
      </div>
    </main>
  );
}

type RealtimeProps = {
  code: string;
  playerId: string;
};

function RealtimeMinigame({ code, playerId }: RealtimeProps) {
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [startAt, setStartAt] = useState<number>(Date.now() + 2000);
  const [round, setRound] = useState(1);
  const [roundStartAt, setRoundStartAt] = useState(0);
  const [renderTick, setRenderTick] = useState(Date.now());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [genreReveal, setGenreReveal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [narration, setNarration] = useState<NarrationLine | null>(null);

  const submittedRef = useRef(false);

  const selfPlayer = useMemo(() => players.find((player) => player.id === playerId) ?? null, [players, playerId]);
  const isStoryMaster = useMemo(() => leaderboard[0]?.id === playerId, [leaderboard, playerId]);

  useEffect(() => {
    const socket = getSocketClient();
    socket.emit("join_room", { code, playerId });

    socket.on("room_updated", (room: { players: Player[] }) => {
      setPlayers(room.players);
    });

    socket.on("minigame_start", (payload: { startAt: number }) => {
      setStartAt(payload.startAt);
      setPhase("countdown");
    });

    socket.on("minigame_complete", (payload: { players: Player[] }) => {
      setLeaderboard(payload.players);
      setPhase("results");
    });

    socket.on("genre_selected", (payload: { genre: GenreId; genreName: string }) => {
      setGenreReveal(payload.genreName);
      setPhase("revealed");
      window.setTimeout(() => {
        router.push(`/game/${code}?player=${playerId}`);
      }, 2100);
    });

    socket.on("narrator_update", (payload: NarratorUpdatePayload) => {
      if (payload?.line) {
        setNarration(payload.line);
      }
    });

    socket.on("server_error", (payload: { message: string }) => {
      const message = payload.message || "Server error";
      // Don't hard-fail the minigame for transient WS errors; allow reconnect.
      if (/realtime|connect/i.test(message)) {
        setToast(message);
        return;
      }
      setError(message);
    });

    return () => {
      socket.off("room_updated");
      socket.off("minigame_start");
      socket.off("minigame_complete");
      socket.off("genre_selected");
      socket.off("narrator_update");
      socket.off("server_error");
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
    if (!selfPlayer) {
      return;
    }
    if (phase === "countdown") {
      setNarration(
        buildMinigameNarration({
          code,
          playerName: selfPlayer.name,
          trigger: "scene_enter",
          historyLength: 0,
          tensionLevel: 2,
        })
      );
      return;
    }
    if (phase === "results") {
      setNarration(
        buildMinigameNarration({
          code,
          playerName: selfPlayer.name,
          trigger: "choice_submitted",
          historyLength: leaderboard.length || 1,
          tensionLevel: 4,
        })
      );
    }
  }, [code, leaderboard.length, phase, selfPlayer]);

  useEffect(() => {
    if (phase !== "countdown") {
      return;
    }

    const timer = window.setInterval(() => {
      if (Date.now() >= startAt) {
        setPhase("playing");
        setRound(1);
        setRoundStartAt(Date.now());
        submittedRef.current = false;
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [phase, startAt]);

  useEffect(() => {
    if (phase !== "playing") {
      return;
    }

    let frame = 0;
    const loop = () => {
      setRenderTick(Date.now());
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  const nextRound = useCallback(() => {
    if (round >= 3) {
      setPhase("waiting");
      return;
    }
    setRound((value) => value + 1);
    setRoundStartAt(Date.now());
    submittedRef.current = false;
    setFeedback(null);
  }, [round]);

  const submitScore = useCallback(
    (score: number, accuracy: number) => {
      if (submittedRef.current) {
        return;
      }

      submittedRef.current = true;
      const socket = getSocketClient();
      // TODO(multiplayer): Include anti-cheat metadata when backend validation is introduced.
      socket.emit("minigame_score", {
        code,
        playerId,
        round,
        score,
        accuracy,
      });

      setFeedback(`+${Math.round(score)} pts`);

      window.setTimeout(() => {
        nextRound();
      }, 700);
    },
    [code, playerId, round, nextRound]
  );

  useEffect(() => {
    if (phase !== "playing" || roundStartAt <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const elapsedInRound = Date.now() - roundStartAt;
      if (elapsedInRound >= 5000 && !submittedRef.current) {
        submitScore(0, 0);
      }
    }, 40);

    return () => window.clearInterval(timer);
  }, [phase, roundStartAt, submitScore]);

  const elapsed = Math.max(0, renderTick - roundStartAt);
  const needleAngle = (elapsed / 1500) * 360;
  const zoneAngle = (elapsed / 2000) * 360;
  const roundSeconds = Math.max(0, Math.ceil((5000 - elapsed) / 1000));

  function handleTap() {
    if (phase !== "playing" || submittedRef.current) {
      return;
    }

    const diff = angleDiff(needleAngle, zoneAngle);
    const inZone = diff <= 30;
    const accuracy = inZone ? Math.round((1 - diff / 30) * 100) : 0;
    const speedMultiplier = Math.max(1, 1.5 - elapsed / 5000 / 2);
    const score = Math.round(accuracy * speedMultiplier);

    navigator.vibrate?.(30);
    setTapFlash(true);
    window.setTimeout(() => setTapFlash(false), 180);
    submitScore(score, accuracy);
  }

  function chooseGenre(genre: GenreId) {
    const socket = getSocketClient();
    // TODO(multiplayer): Host authority can move to server-side role checks when auth is added.
    socket.emit("genre_selected", {
      code,
      playerId,
      genre,
    });
  }

  const countdownNumber = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));

  if (error) {
    return (
      <main className="page-shell page-with-top-bar">
        <SessionTopBar
          backHref={`/lobby/${code}?player=${playerId}`}
          backLabel="Back to Lobby"
          roomCode={code}
          playerId={playerId}
          showInvite
          phaseLabel="Minigame"
          playerName={selfPlayer?.name}
        />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel p-6">
            <p className="text-red-300">{error}</p>
            <button className="btn btn-primary mt-4" type="button" onClick={() => router.push(`/lobby/${code}?player=${playerId}`)}>
              Back to lobby
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
        backHref={`/lobby/${code}?player=${playerId}`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="Minigame"
        playerName={selfPlayer?.name}
      />
      <div className="content-wrap flex min-h-dvh flex-col items-center justify-center gap-7">
        <NarratorBanner line={narration} compact />
        <h1 className="text-3xl font-bold">Reflex Roulette</h1>
        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
        {phase === "playing" ? (
          <div
            className={clsx(
              "rounded-full border px-4 py-2 text-lg font-black",
              roundSeconds <= 2 ? "tension-pulse border-red-400 text-red-300" : "border-cyan-300 text-cyan-300"
            )}
          >
            {roundSeconds}s
          </div>
        ) : null}

        {phase === "countdown" ? (
          <motion.div
            key={countdownNumber}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[5rem] font-black"
          >
            {countdownNumber <= 0 ? "GO" : countdownNumber}
          </motion.div>
        ) : null}

        {phase === "playing" ? (
          <button
            type="button"
            onClick={handleTap}
            className={clsx(
              "relative grid h-[340px] w-[340px] place-items-center rounded-full border border-white/20 bg-black/30",
              tapFlash ? "ring-2 ring-red-400" : ""
            )}
            aria-label="Tap to score this round"
          >
            <div
              className="pointer-events-none absolute h-[280px] w-[280px] rounded-full border-8 border-transparent"
              style={{
                borderTopColor: "#00d9ff",
                transform: `rotate(${zoneAngle}deg)`,
                transition: "transform 40ms linear",
              }}
            />
            <div
              className="pointer-events-none absolute h-[130px] w-[3px] origin-bottom rounded-full bg-white"
              style={{ transform: `translateY(-45px) rotate(${needleAngle}deg)` }}
            />
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Round {round}/3</p>
              <p className="text-3xl font-bold">Tap</p>
              <p className="text-sm text-zinc-300">Hit zone + speed = score</p>
            </div>
            {feedback ? <p className="absolute -top-10 text-xl font-bold text-cyan-300">{feedback}</p> : null}
          </button>
        ) : null}

        {phase === "waiting" ? <p className="text-zinc-300">Waiting for others...</p> : null}

        {phase === "results" ? (
          <div className="panel w-full max-w-2xl space-y-4 p-6">
            <h2 className="text-2xl font-semibold">Leaderboard</h2>
            <div className="space-y-2">
              {leaderboard.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    index === 0 ? "border-yellow-300/70 bg-yellow-300/10" : "border-white/15 bg-black/25"
                  }`}
                >
                  <span>
                    #{index + 1} {player.name} {index === 0 ? "Story Master" : ""}
                  </span>
                  <span className="font-semibold">{player.score}</span>
                </div>
              ))}
            </div>

            {isStoryMaster ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-300">Choose the genre</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {GENRES.map((genre) => (
                    <button
                      key={genre.id}
                      type="button"
                      className="btn btn-secondary min-h-20 text-left"
                      onClick={() => chooseGenre(genre.id)}
                    >
                      <div className="text-xs text-zinc-400">Mystery Card</div>
                      <div className="text-lg font-semibold">{genre.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-zinc-300">Story Master is choosing the genre...</p>
            )}
          </div>
        ) : null}

        {phase === "revealed" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-300">Genre Selected</p>
            <h2 className="text-5xl font-black text-cyan-300">{genreReveal}</h2>
          </motion.div>
        ) : null}

        <p className="text-xs text-zinc-400">Player: {selfPlayer?.name ?? "Unknown"}</p>
      </div>
    </main>
  );
}

export default function MinigamePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";

  if (code === "DEMO1") {
    return <DemoMinigame code={code} playerId={playerId} />;
  }

  return <RealtimeMinigame code={code} playerId={playerId} />;
}
