"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TutorialOverlay from "../components/tutorial-overlay";
import { soundManager } from "../lib/soundManager";

const TUTORIAL_FLAG = "storyClashTutorialSeen";

export default function HomePage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(TUTORIAL_FLAG);
    if (seen !== "1") {
      setTutorialOpen(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    soundManager.transitionLoop("intro");
    return () => {
      soundManager.stopLoop("intro");
    };
  }, []);

  function closeTutorial() {
    localStorage.setItem(TUTORIAL_FLAG, "1");
    setTutorialOpen(false);
  }

  function reopenTutorial() {
    setTutorialOpen(true);
  }

  return (
    <main className="page-shell">
      <div className="suspense-wash" aria-hidden />
      <div className="content-wrap grid min-h-dvh place-items-center">
        <section className="panel w-full max-w-xl space-y-7 p-6 text-center sm:p-8">
          <p className="badge mx-auto">Realtime Multiplayer</p>
          <h1 className="hero-title text-[2.3rem] leading-none sm:text-6xl">Story Clash</h1>
          <p className="mx-auto max-w-xl text-base text-zinc-200 sm:text-lg">
            Compete in a reflex minigame, take turns shaping a branching horror story, and survive to the recap.
          </p>
          <div className="grid gap-3">
            <Link href="/create" className="btn btn-primary w-full py-4 text-lg font-semibold">
              Create Room
            </Link>
            <Link href="/join" className="btn btn-secondary w-full py-4 text-lg font-semibold">
              Join Room
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <button type="button" className="text-cyan-300 underline" onClick={reopenTutorial}>
              How to Play
            </button>
            <Link href="/create?demo=1" className="text-zinc-300 underline">
              Quick Demo
            </Link>
          </div>
        </section>
      </div>

      {ready ? <TutorialOverlay open={tutorialOpen} onClose={closeTutorial} /> : null}
    </main>
  );
}
