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
import SceneShell from "../../../components/motion/scene-shell";
import ImpactFlash from "../../../components/motion/impact-flash";
import RiveLayer from "../../../components/motion/rive-layer";
import type { GenreId, MinigameOutcome, MotionCue, NarrationLine, Player } from "../../../types/game";
import type { NarratorUpdatePayload } from "../../../types/realtime";

type Phase =
  | "countdown"
  | "picking"
  | "spinning_genre"
  | "spinning_tie"
  | "submitting"
  | "results"
  | "revealed";

type SpinOutcome = {
  winningGenre: GenreId;
  contenders: string[];
  winnerId: string;
  tieBreak: boolean;
};

function cueFromPhase(phase: Phase, tieBreak: boolean): MotionCue {
  if (phase === "spinning_tie") {
    return {
      intensity: 82,
      beat: "payoff",
      effectProfile: "shockwave",
      transitionStyle: "surge",
      pressureBand: "critical",
    };
  }
  if (phase === "spinning_genre") {
    return {
      intensity: 70,
      beat: "escalation",
      effectProfile: "void_hum",
      transitionStyle: "surge",
      pressureBand: "rising",
    };
  }
  if (phase === "results") {
    return {
      intensity: tieBreak ? 68 : 56,
      beat: "payoff",
      effectProfile: "shockwave",
      transitionStyle: "drift",
      pressureBand: tieBreak ? "critical" : "rising",
    };
  }
  if (phase === "countdown") {
    return {
      intensity: 36,
      beat: "setup",
      effectProfile: "rift_drift",
      transitionStyle: "drift",
      pressureBand: "calm",
    };
  }
  return {
    intensity: 48,
    beat: "escalation",
    effectProfile: "rift_drift",
    transitionStyle: "drift",
    pressureBand: "rising",
  };
}

const GENRES: Array<{ id: GenreId; name: string; icon: string; color: string }> = [
  { id: "zombie", name: "Zombie Outbreak", icon: "Z", color: "#ef4444" },
  { id: "alien", name: "Alien Invasion", icon: "A", color: "#22d3ee" },
  { id: "haunted", name: "Haunted Manor", icon: "H", color: "#a78bfa" },
];

const PICK_SCORE: Record<GenreId, number> = {
  zombie: 11,
  alien: 22,
  haunted: 33,
};

function decodePick(value: number | undefined): GenreId | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value ?? 0);
  if (rounded === PICK_SCORE.zombie) {
    return "zombie";
  }
  if (rounded === PICK_SCORE.alien) {
    return "alien";
  }
  if (rounded === PICK_SCORE.haunted) {
    return "haunted";
  }
  return null;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededChoice<T>(items: T[], seed: string): T {
  const index = stableHash(seed) % items.length;
  return items[index] ?? items[0];
}

function spinOutcome(players: Player[], picks: Record<string, GenreId>, seedKey: string): SpinOutcome {
  const genresWithContenders = GENRES.map((genre) => genre.id).filter((id) =>
    players.some((player) => picks[player.id] === id)
  );
  const genrePool = genresWithContenders.length ? genresWithContenders : GENRES.map((genre) => genre.id);
  const winningGenre = seededChoice(genrePool, `${seedKey}:genre`);

  const contenders = players.filter((player) => picks[player.id] === winningGenre).map((player) => player.id);
  const contenderPool = contenders.length ? contenders : players.map((player) => player.id);
  const winnerId = seededChoice(contenderPool, `${seedKey}:winner`);

  return {
    winningGenre,
    contenders: contenderPool,
    winnerId,
    tieBreak: contenderPool.length > 1,
  };
}

function fallbackOutcomeFromLeaderboard(players: Player[]): SpinOutcome | null {
  const winner = players[0];
  if (!winner) {
    return null;
  }
  const winningGenre = decodePick(winner.rounds?.[0]) ?? "zombie";
  const contenderIds = players
    .filter((player) => decodePick(player.rounds?.[0]) === winningGenre)
    .map((player) => player.id);
  const contenders = contenderIds.length ? contenderIds : [winner.id];
  return {
    winningGenre,
    contenders,
    winnerId: winner.id,
    tieBreak: contenders.length > 1,
  };
}

function buildNarration(
  code: string,
  playerName: string,
  trigger: "scene_enter" | "choice_submitted",
  intensity: number,
  genre: GenreId = "zombie"
) {
  return generateNarrationLine({
    code,
    trigger,
    genre,
    sceneId: "genre_wheel",
    historyLength: intensity,
    tensionLevel: intensity >= 4 ? 5 : 3,
    playerName,
    choiceLabel: trigger === "scene_enter" ? "locked in a genre" : "spun the fate wheel",
  });
}

function pickMap(players: Player[]): Record<string, GenreId> {
  return players.reduce<Record<string, GenreId>>((acc, player) => {
    const pick = decodePick(player.rounds?.[0]);
    if (pick) {
      acc[player.id] = pick;
    }
    return acc;
  }, {});
}

function genreWheelRotation(genreId: GenreId, previous: number, seed: string): number {
  const centerByGenre: Record<GenreId, number> = {
    zombie: 60,
    alien: 180,
    haunted: 300,
  };
  const target = (360 - centerByGenre[genreId]) % 360;
  const wobble = stableHash(`${seed}:wobble`) % 10;
  return previous + 1080 + target + wobble;
}

function tieWheelRotation(index: number, count: number, previous: number, seed: string): number {
  const segment = 360 / count;
  const center = segment * index + segment / 2;
  const target = (360 - center) % 360;
  const wobble = stableHash(`${seed}:tie`) % 8;
  return previous + 1080 + target + wobble;
}

function tieWheelGradient(size: number): string {
  const colors = ["#22d3ee", "#ef4444", "#f59e0b", "#a78bfa", "#34d399", "#f97316"];
  const segment = 360 / size;
  const parts = Array.from({ length: size }).map((_, index) => {
    const start = segment * index;
    const end = segment * (index + 1);
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${parts.join(",")})`;
}

type WheelViewProps = {
  picks: Record<string, GenreId>;
  players: Array<{ id: string; name: string }>;
  activePick: GenreId | null;
  onPick: (genre: GenreId) => void;
  wheelRotation: number;
  disabled: boolean;
};

function WheelView({ picks, players, activePick, onPick, wheelRotation, disabled }: WheelViewProps) {
  return (
    <section className="panel w-full max-w-3xl space-y-4 p-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-black">Genre Fate Wheel</h1>
        <p className="text-zinc-300">Pick a pie. Wheel lands on a genre. Matched players fight for first turn.</p>
      </header>

      <div className="relative mx-auto h-72 w-72">
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 text-red-300">▼</div>
        <div
          className="h-full w-full rounded-full border border-white/20 shadow-[0_0_40px_rgba(0,217,255,0.2)]"
          style={{
            background:
              "conic-gradient(#ef4444 0deg 120deg, #22d3ee 120deg 240deg, #a78bfa 240deg 360deg)",
            transform: `rotate(${wheelRotation}deg)`,
            transition: "transform 1.6s cubic-bezier(0.2, 0.9, 0.2, 1)",
          }}
        />
        <div className="pointer-events-none absolute inset-5 rounded-full border border-black/40 bg-black/45" />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {GENRES.map((genre) => {
          const pickedBy = players.filter((player) => picks[player.id] === genre.id);
          return (
            <button
              key={genre.id}
              type="button"
              className={clsx(
                "rounded-xl border px-3 py-3 text-left transition",
                activePick === genre.id
                  ? "border-cyan-300 bg-cyan-500/20"
                  : "border-white/20 bg-black/25 hover:border-white/45",
                disabled ? "cursor-not-allowed opacity-70" : ""
              )}
              onClick={() => onPick(genre.id)}
              disabled={disabled || Boolean(activePick)}
            >
              <p className="text-xs uppercase tracking-[0.16em]" style={{ color: genre.color }}>
                {genre.icon} Pie
              </p>
              <p className="text-lg font-semibold">Pick {genre.name}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {pickedBy.length > 0 ? pickedBy.map((player) => player.name).join(", ") : "No picks yet"}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type TieWheelProps = {
  names: string[];
  rotation: number;
};

function TieWheel({ names, rotation }: TieWheelProps) {
  return (
    <section className="panel w-full max-w-2xl space-y-4 p-5 text-center">
      <h2 className="text-2xl font-semibold">Tie Break Wheel</h2>
      <p className="text-zinc-300">Tie detected. Spinning names only to lock first player.</p>
      <div className="relative mx-auto h-56 w-56">
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 text-red-300">▼</div>
        <div
          className="h-full w-full rounded-full border border-white/20"
          style={{
            background: tieWheelGradient(Math.max(2, names.length)),
            transform: `rotate(${rotation}deg)`,
            transition: "transform 1.3s cubic-bezier(0.2, 0.9, 0.2, 1)",
          }}
        />
      </div>
      <p className="text-sm text-zinc-300">Contenders: {names.join(" vs ")}</p>
    </section>
  );
}

type DemoProps = {
  code: string;
  playerId: string;
};

function DemoMinigame({ code, playerId }: DemoProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("picking");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [tieRotation, setTieRotation] = useState(0);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [picks, setPicks] = useState<Record<string, GenreId>>({});
  const [narration, setNarration] = useState<NarrationLine | null>(() => buildNarration(code, "Host", "scene_enter", 1));

  const players = useMemo(
    () => [
      { id: "demo-host", name: "Host" },
      { id: "demo-p2", name: "Player 2" },
      { id: "demo-p3", name: "Player 3" },
    ],
    []
  );

  const selfId = playerId || "demo-host";
  const self = players.find((player) => player.id === selfId) ?? players[0];
  const allPicked = players.every((player) => Boolean(picks[player.id]));

  useEffect(() => {
    if (!picks[self.id]) {
      return;
    }
    const others = players.filter((player) => player.id !== self.id && !picks[player.id]);
    if (!others.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPicks((current) => {
        const next = { ...current };
        others.forEach((player, index) => {
          const fallback = GENRES[(stableHash(`${code}:${player.id}:${index}`) % GENRES.length)]?.id ?? "zombie";
          next[player.id] = fallback;
        });
        return next;
      });
    }, 340);

    return () => window.clearTimeout(timer);
  }, [code, picks, players, self.id]);

  function pickGenre(genre: GenreId) {
    if (picks[self.id]) {
      return;
    }
    setPicks((current) => ({ ...current, [self.id]: genre }));
    setNarration(buildNarration(code, self.name, "choice_submitted", 2, genre));
  }

  function spinWheel() {
    if (!allPicked) {
      return;
    }

    const pseudoPlayers: Player[] = players.map((player, index) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === "demo-host",
      score: 0,
      orderIndex: index,
      rounds: [PICK_SCORE[picks[player.id] ?? "zombie"]],
    }));

    const resolved = spinOutcome(pseudoPlayers, picks, `${code}:${Date.now()}`);
    setOutcome(resolved);
    setPhase("spinning_genre");
    setWheelRotation((value) => genreWheelRotation(resolved.winningGenre, value, `${code}:${Date.now()}`));
    setNarration(buildNarration(code, self.name, "choice_submitted", 4, resolved.winningGenre));

    window.setTimeout(() => {
      if (!resolved.tieBreak) {
        setPhase("results");
        return;
      }
      const contenderIndex = resolved.contenders.indexOf(resolved.winnerId);
      setPhase("spinning_tie");
      setTieRotation((value) =>
        tieWheelRotation(Math.max(0, contenderIndex), Math.max(2, resolved.contenders.length), value, `${code}:${Date.now()}`)
      );
      window.setTimeout(() => setPhase("results"), 1400);
    }, 1700);
  }

  function finishDemo() {
    if (!outcome) {
      return;
    }
    const ordered = [
      outcome.winnerId,
      ...players.map((player) => player.id).filter((id) => id !== outcome.winnerId),
    ];
    setDemoMinigameOrder(ordered, outcome.winningGenre);
    router.push(`/game/${code}?player=${self.id}&demo=1`);
  }

  const winner = outcome ? players.find((player) => player.id === outcome.winnerId) : null;
  const winningGenre = outcome ? GENRES.find((genre) => genre.id === outcome.winningGenre) : null;
  const tieNames = outcome
    ? outcome.contenders.map((id) => players.find((player) => player.id === id)?.name ?? "Player")
    : [];
  const cue = cueFromPhase(phase, Boolean(outcome?.tieBreak));

  return (
    <SceneShell cue={cue} className="page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <ImpactFlash active={phase === "results"} />
      <SessionTopBar
        backHref={`/lobby/${code}?player=${self.id}&demo=1`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={self.id}
        showInvite
        isDemo
        phaseLabel="Minigame"
        playerName={self.name}
      />

      <div className="content-wrap flex min-h-dvh flex-col items-center justify-center gap-6">
        <section className="panel w-full max-w-3xl space-y-2 p-5 text-center">
          <p className="badge mx-auto">Rift Minigame</p>
          <h1 className="text-3xl font-black sm:text-4xl">Pick a Pie. Spin Fate.</h1>
          <p className="text-sm text-zinc-300">Winning genre sets tone. Winning player controls the first story turn.</p>
          <div className="mx-auto h-14 w-36">
            <RiveLayer assetId="pulse_field_loop" className="h-full w-full" />
          </div>
        </section>
        <NarratorBanner line={narration} compact />

        <WheelView
          picks={picks}
          players={players}
          activePick={picks[self.id] ?? null}
          onPick={pickGenre}
          wheelRotation={wheelRotation}
          disabled={phase !== "picking"}
        />

        {phase === "picking" ? (
          <button type="button" className="btn btn-primary w-full max-w-3xl py-4 text-lg" onClick={spinWheel} disabled={!allPicked}>
            {allPicked ? "Spin Genre Wheel (Demo)" : "Waiting for all picks"}
          </button>
        ) : null}

        {phase === "spinning_genre" ? <p className="text-zinc-300">Spinning genre wheel...</p> : null}

        {phase === "spinning_tie" ? <TieWheel names={tieNames} rotation={tieRotation} /> : null}

        {phase === "results" && winner && winningGenre ? (
          <section className="panel w-full max-w-3xl space-y-4 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Spin Result</p>
            <h2 className="text-3xl font-black" style={{ color: winningGenre.color }}>
              {winningGenre.name}
            </h2>
            <p className="text-lg">
              <strong>{winner.name}</strong> goes first.
            </p>
            {outcome?.tieBreak ? <p className="text-sm text-zinc-300">Tie break resolved by name wheel.</p> : null}
            <button type="button" className="btn btn-primary w-full py-4 text-lg" onClick={finishDemo}>
              Finish Demo Minigame
            </button>
          </section>
        ) : null}
      </div>
    </SceneShell>
  );
}

type RealtimeProps = {
  code: string;
  playerId: string;
};

function RealtimeMinigame({ code, playerId }: RealtimeProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("countdown");
  const [players, setPlayers] = useState<Player[]>([]);
  const [startAt, setStartAt] = useState(Date.now() + 1500);
  const [nowMs, setNowMs] = useState(Date.now());
  const [wheelRotation, setWheelRotation] = useState(0);
  const [tieRotation, setTieRotation] = useState(0);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [genreReveal, setGenreReveal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [spinRequested, setSpinRequested] = useState(false);
  const [narration, setNarration] = useState<NarrationLine | null>(null);

  const autoGenreRef = useRef(false);
  const outcomeRef = useRef<SpinOutcome | null>(null);

  const selfPlayer = useMemo(() => players.find((player) => player.id === playerId) ?? null, [players, playerId]);
  const picks = useMemo(() => pickMap(players), [players]);
  const allPicked = useMemo(() => players.length > 0 && players.every((player) => Boolean(picks[player.id])), [players, picks]);
  const isHost = Boolean(selfPlayer?.isHost);
  const countdown = Math.max(0, Math.ceil((startAt - nowMs) / 1000));

  const applyResolvedOutcome = useCallback(
    (resolved: SpinOutcome) => {
      outcomeRef.current = resolved;
      setOutcome(resolved);
      setPhase("spinning_genre");
      setWheelRotation((value) => genreWheelRotation(resolved.winningGenre, value, `${code}:${Date.now()}`));

      const resolveTie = () => {
        if (!resolved.tieBreak) {
          setPhase("submitting");
          return;
        }
        const contenderIndex = resolved.contenders.indexOf(resolved.winnerId);
        setPhase("spinning_tie");
        setTieRotation((value) =>
          tieWheelRotation(Math.max(0, contenderIndex), Math.max(2, resolved.contenders.length), value, `${code}:${Date.now()}`)
        );
        window.setTimeout(() => setPhase("submitting"), 1300);
      };

      window.setTimeout(resolveTie, 1650);
    },
    [code]
  );

  useEffect(() => {
    const socket = getSocketClient();
    socket.emit("join_room", { code, playerId });

    const onRoomUpdated = (room: { players: Player[] }) => {
      setPlayers(room.players);
    };

    const onMinigameStart = (payload: { startAt: number }) => {
      setStartAt(payload.startAt);
      setNowMs(Date.now());
      setPhase("countdown");
      setOutcome(null);
      outcomeRef.current = null;
      setLeaderboard([]);
      setGenreReveal(null);
      autoGenreRef.current = false;
      setSpinRequested(false);
    };

    const onMinigameComplete = (payload: { players: Player[]; outcome?: MinigameOutcome }) => {
      setLeaderboard(payload.players);
      setSpinRequested(false);

      const resolved: SpinOutcome | null = payload.outcome
        ? {
            winningGenre: payload.outcome.winningGenre,
            contenders: payload.outcome.contenders,
            winnerId: payload.outcome.winnerId,
            tieBreak: payload.outcome.tieBreak,
          }
        : fallbackOutcomeFromLeaderboard(payload.players);
      if (!resolved) {
        setPhase("results");
        return;
      }
      setOutcome(resolved);
      outcomeRef.current = resolved;
      applyResolvedOutcome(resolved);
    };

    const onGenreSelected = (payload: { genreName: string }) => {
      setGenreReveal(payload.genreName);
      setPhase("revealed");
      window.setTimeout(() => {
        router.push(`/game/${code}?player=${playerId}`);
      }, 1800);
    };

    const onNarratorUpdate = (payload: NarratorUpdatePayload) => {
      if (payload?.line) {
        setNarration(payload.line);
      }
    };

    const onServerError = (payload: { message: string }) => {
      const message = payload.message || "Server error";
      if (/realtime|connect/i.test(message)) {
        setToast(message);
        return;
      }
      setSpinRequested(false);
      setError(message);
    };

    socket.on("room_updated", onRoomUpdated);
    socket.on("minigame_start", onMinigameStart);
    socket.on("minigame_complete", onMinigameComplete);
    socket.on("genre_selected", onGenreSelected);
    socket.on("narrator_update", onNarratorUpdate);
    socket.on("server_error", onServerError);

    return () => {
      socket.off("room_updated", onRoomUpdated);
      socket.off("minigame_start", onMinigameStart);
      socket.off("minigame_complete", onMinigameComplete);
      socket.off("genre_selected", onGenreSelected);
      socket.off("narrator_update", onNarratorUpdate);
      socket.off("server_error", onServerError);
    };
  }, [applyResolvedOutcome, code, playerId, router]);

  useEffect(() => {
    if (!selfPlayer) {
      return;
    }
    if (phase === "countdown") {
      setNarration(buildNarration(code, selfPlayer.name, "scene_enter", 1));
    }
  }, [code, phase, selfPlayer]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (phase !== "countdown") {
      return;
    }
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= startAt) {
        setPhase("picking");
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [phase, startAt]);

  useEffect(() => {
    if (phase !== "submitting") {
      return;
    }
    const resolved = outcomeRef.current;
    if (!resolved) {
      return;
    }
    setNarration(buildNarration(code, selfPlayer?.name ?? "Host", "choice_submitted", 5, resolved.winningGenre));
    const timer = window.setTimeout(() => {
      setPhase("results");
    }, 380);
    return () => window.clearTimeout(timer);
  }, [code, phase, selfPlayer?.name]);

  useEffect(() => {
    if (phase !== "results" || !isHost || autoGenreRef.current) {
      return;
    }
    const resolved = outcomeRef.current;
    if (!resolved) {
      return;
    }
    autoGenreRef.current = true;
    const timer = window.setTimeout(() => {
      getSocketClient().emit("genre_selected", {
        code,
        playerId,
        genre: resolved.winningGenre,
      });
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [code, isHost, phase, playerId]);

  function choosePie(genre: GenreId) {
    if (!selfPlayer || picks[selfPlayer.id]) {
      return;
    }
    getSocketClient().emit("minigame_score", {
      code,
      playerId,
      round: 1,
      score: PICK_SCORE[genre],
      accuracy: 100,
    });
    setNarration(buildNarration(code, selfPlayer.name, "choice_submitted", 2, genre));
  }

  function spinGenreWheel() {
    if (!isHost || !allPicked || !selfPlayer) {
      return;
    }
    if (spinRequested) {
      return;
    }
    setSpinRequested(true);
    getSocketClient().emit("minigame_spin", {
      code,
      playerId,
    });
  }

  const winner = outcome ? players.find((player) => player.id === outcome.winnerId) : null;
  const winningGenre = outcome ? GENRES.find((genre) => genre.id === outcome.winningGenre) : null;
  const tieNames = outcome
    ? outcome.contenders.map((id) => players.find((player) => player.id === id)?.name ?? "Player")
    : [];
  const cue = cueFromPhase(phase, Boolean(outcome?.tieBreak));

  if (error) {
    return (
      <SceneShell cue={cue} className="page-with-top-bar">
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
      </SceneShell>
    );
  }

  return (
    <SceneShell cue={cue} className="page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <ImpactFlash active={phase === "results" || phase === "revealed"} />
      <SessionTopBar
        backHref={`/lobby/${code}?player=${playerId}`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="Minigame"
        playerName={selfPlayer?.name}
      />

      <div className="content-wrap flex min-h-dvh flex-col items-center justify-center gap-6">
        <section className="panel w-full max-w-3xl space-y-2 p-5 text-center">
          <p className="badge mx-auto">Rift Minigame</p>
          <h1 className="text-3xl font-black sm:text-4xl">Pick a Pie. Spin Fate.</h1>
          <p className="text-sm text-zinc-300">A tie triggers a names-only wheel. Final winner goes first in story phase.</p>
          <div className="mx-auto h-14 w-36">
            <RiveLayer assetId="pulse_field_loop" className="h-full w-full" />
          </div>
        </section>
        <NarratorBanner line={narration} compact />
        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}

        {phase === "countdown" ? (
          <motion.div key={countdown} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-300">Genre wheel opens in</p>
            <h1 className="text-[5rem] font-black">{countdown <= 0 ? "GO" : countdown}</h1>
          </motion.div>
        ) : (
          <WheelView
            picks={picks}
            players={players.map((player) => ({ id: player.id, name: player.name }))}
            activePick={selfPlayer ? picks[selfPlayer.id] ?? null : null}
            onPick={choosePie}
            wheelRotation={wheelRotation}
            disabled={phase !== "picking"}
          />
        )}

        {phase === "picking" ? (
          <button
            type="button"
            className="btn btn-primary w-full max-w-3xl py-4 text-lg"
            onClick={spinGenreWheel}
            disabled={!isHost || !allPicked || spinRequested}
          >
            {isHost
              ? spinRequested
                ? "Resolving Wheel..."
                : allPicked
                  ? "Spin Genre Wheel"
                  : "Waiting for all picks"
              : "Host spins after all picks"}
          </button>
        ) : null}

        {phase === "spinning_genre" ? <p className="text-zinc-300">Spinning genre wheel...</p> : null}
        {phase === "spinning_tie" ? <TieWheel names={tieNames} rotation={tieRotation} /> : null}
        {phase === "submitting" ? <p className="text-zinc-300">Locking winner and turn order...</p> : null}

        {phase === "results" && winner && winningGenre ? (
          <section className="panel w-full max-w-3xl space-y-4 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Wheel Result</p>
            <h2 className="text-3xl font-black" style={{ color: winningGenre.color }}>
              {winningGenre.name}
            </h2>
            <p className="text-lg">
              <strong>{winner.name}</strong> goes first.
            </p>
            {outcome?.tieBreak ? <p className="text-sm text-zinc-300">Tie resolved with the names-only wheel.</p> : null}

            <div className="space-y-2">
              {leaderboard.map((player, index) => (
                <div
                  key={player.id}
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm",
                    index === 0 ? "border-yellow-300/70 bg-yellow-300/15" : "border-white/20 bg-black/20"
                  )}
                >
                  #{index + 1} {player.name}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {phase === "revealed" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-300">Story Loading</p>
            <h2 className="text-5xl font-black text-cyan-300">{genreReveal}</h2>
          </motion.div>
        ) : null}
      </div>
    </SceneShell>
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
