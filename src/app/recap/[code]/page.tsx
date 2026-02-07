"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocketClient } from "../../../lib/socket-client";
import Typewriter from "../../../components/typewriter";
import { getDemoEndingText, getDemoSession, initDemoRoom } from "../../../lib/demo-session";
import { soundManager } from "../../../lib/soundManager";
import type { EndingType, GenreId, HistoryEntry, MVP, Scene } from "../../../types/game";

type RecapPayload = {
  endingScene: Scene;
  endingType: EndingType;
  history: HistoryEntry[];
  mvp: MVP;
  genre: GenreId;
  storyTitle: string;
};

function endingLabel(type: EndingType) {
  if (type === "triumph") {
    return "Victory";
  }
  if (type === "survival") {
    return "Narrowly Escaped";
  }
  return "Game Over";
}

type DemoRecapProps = {
  code: string;
};

function DemoRecap({ code }: DemoRecapProps) {
  const router = useRouter();
  const session = getDemoSession();

  useEffect(() => {
    soundManager.stopAllLoops();
    soundManager.play("ending_survival");
  }, []);

  return (
    <main className="page-shell">
      <div className="suspense-wash" aria-hidden />
      <div className="content-wrap space-y-6">
        <section className="panel space-y-4 p-6 text-center">
          <p className="badge mx-auto">Demo Complete</p>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Zombie Outbreak (Demo)</p>
          <Typewriter text={getDemoEndingText()} charsPerSecond={20} />
          <p className="mx-auto w-fit rounded-full border border-cyan-300/60 px-4 py-2 text-lg font-bold text-cyan-300">
            Demo Complete
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-2xl font-semibold">How your story unfolded</h2>
          <p className="mb-4 text-sm text-zinc-400">Each step shows the scene and the action you took.</p>
          <div className="max-h-[48dvh] space-y-3 overflow-y-auto pr-2 [scroll-snap-type:y_mandatory]">
            {session.history.map((entry, index) => (
              <motion.article
                key={`${entry.sceneId}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-xl border border-white/15 bg-black/30 p-4 [scroll-snap-align:start]"
                aria-label={`Scene ${index + 1}, ${entry.playerName} chose ${entry.choiceLabel}`}
              >
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Scene {index + 1}</p>
                <p className="mt-1 text-sm text-zinc-300">{entry.sceneText.slice(0, 120)}...</p>
                <p className="mt-2 text-sm">
                  <strong>{entry.playerName}</strong> chose: <span className="text-cyan-300">{entry.choiceLabel}</span>
                </p>
                {entry.isFreeChoice && entry.freeText ? (
                  <p className="mt-1 text-xs text-green-300">Free choice text: &quot;{entry.freeText}&quot;</p>
                ) : null}
              </motion.article>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <button
            type="button"
            className="btn btn-primary w-full py-4 text-lg font-semibold sm:text-xl"
            onClick={() => {
              initDemoRoom();
              router.push("/");
            }}
          >
            Back to Home
          </button>
          <p className="mt-2 text-center text-xs text-zinc-500">Room: {code}</p>
        </section>
      </div>
    </main>
  );
}

type RealtimeRecapProps = {
  code: string;
  playerId: string;
};

function RealtimeRecap({ code, playerId }: RealtimeRecapProps) {
  const router = useRouter();

  const [recap, setRecap] = useState<RecapPayload | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadRecap() {
      try {
        const response = await fetch(`/api/recap/${code}`);
        const data = (await response.json()) as RecapPayload | { error: string };
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Recap unavailable");
        }

        if (mounted) {
          setRecap(data);
          window.setTimeout(() => setShowTimeline(true), 5000);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Could not load recap");
        }
      }
    }

    void loadRecap();

    return () => {
      mounted = false;
    };
  }, [code]);

  useEffect(() => {
    if (!recap) {
      return;
    }
    soundManager.stopAllLoops();
    if (recap.endingType === "triumph") {
      soundManager.play("ending_triumph");
      return;
    }
    if (recap.endingType === "survival") {
      soundManager.play("ending_survival");
      return;
    }
    soundManager.play("ending_doom");
  }, [recap]);

  useEffect(() => {
    const socket = getSocketClient();
    socket.on("session_restarted", () => {
      router.push(`/lobby/${code}?player=${playerId}`);
    });
    return () => {
      socket.off("session_restarted");
    };
  }, [code, playerId, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const shareText = useMemo(() => {
    if (!recap) {
      return "";
    }
    return `We just played Story Clash!\nStory: ${recap.storyTitle}\nEnding: ${endingLabel(recap.endingType)}\nMVP: ${recap.mvp.player}\nJoin us: https://apps.apple.com`;
  }, [recap]);

  async function copyShare() {
    await navigator.clipboard.writeText(shareText);
    setToast("Copied! Share with friends");
  }

  function playAgain() {
    getSocketClient().emit("restart_session", { code, playerId });
  }

  if (error) {
    return (
      <main className="page-shell">
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel p-6">
            <p className="text-red-300">{error}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => router.push("/")}>
              Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!recap) {
    return (
      <main className="page-shell">
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading recap...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="suspense-wash" aria-hidden />
      <div className="content-wrap space-y-6">
        <section className="panel space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{recap.storyTitle}</p>
          <Typewriter text={recap.endingScene.text} charsPerSecond={20} />
          <p className="mx-auto w-fit rounded-full border border-cyan-300/60 px-4 py-2 text-lg font-bold text-cyan-300">
            {endingLabel(recap.endingType)}
          </p>
        </section>

        {showTimeline ? (
          <section className="panel p-5">
            <h2 className="mb-3 text-2xl font-semibold">Recap Timeline</h2>
            <div className="max-h-[48dvh] space-y-3 overflow-y-auto pr-2 [scroll-snap-type:y_mandatory]">
              {recap.history.map((entry, index) => (
                <motion.article
                  key={`${entry.sceneId}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl border border-white/15 bg-black/30 p-4 [scroll-snap-align:start]"
                  aria-label={`Scene ${index + 1}, ${entry.player} chose ${entry.choice}`}
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Scene {index + 1}</p>
                  <p className="mt-1 text-sm text-zinc-300">{entry.sceneText.slice(0, 70)}...</p>
                  <p className="mt-2 text-sm">
                    <strong>{entry.player}</strong> chose:{" "}
                    <span className={entry.isFreeChoice ? "text-green-300" : "text-cyan-300"}>{entry.choice}</span>
                  </p>
                </motion.article>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-yellow-300/50 bg-yellow-300/10 p-4">
              <p className="font-semibold">{recap.mvp.player} was MVP</p>
              <p className="text-sm text-zinc-200">{recap.mvp.reason}</p>
            </div>
          </section>
        ) : null}

        <section className="panel flex flex-wrap gap-3 p-5">
          <button type="button" className="btn btn-primary flex-1 py-3 text-lg font-semibold" onClick={playAgain}>
            Play Again
          </button>
          <button type="button" className="btn btn-secondary flex-1 py-3" onClick={copyShare}>
            Share Story
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push("/")}>
            Exit
          </button>
        </section>

        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
      </div>
    </main>
  );
}

export default function RecapPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";

  if (code === "DEMO1") {
    return <DemoRecap code={code} />;
  }

  return <RealtimeRecap code={code} playerId={playerId} />;
}
