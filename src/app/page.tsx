"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE_HOOK } from "@/lib/app-meta";
import TutorialOverlay from "../components/tutorial-overlay";

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
        <section className="panel w-full max-w-3xl space-y-8 p-6 sm:p-10">
          <div className="space-y-5 text-center">
            <p className="badge mx-auto">Live Social Story Game</p>
            <h1 className="hero-title text-[2.7rem] sm:text-7xl">Story Clash</h1>
            <p className="mx-auto max-w-2xl text-base text-zinc-200 sm:text-xl">
              Spin fate. Enter the Rift. Fight for the first move, then drive your crew through a high-stakes branching nightmare.
            </p>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">{SITE_HOOK}</p>
          </div>

          <div className="grid gap-3">
            <Link href="/create" className="btn btn-primary w-full py-4 text-lg" id="cta-create">
              Create Room
            </Link>
            <Link href="/join" className="btn btn-secondary w-full py-4 text-lg">
              Join Room
            </Link>
            <Link
              href="/arcade.html"
              className="btn w-full border border-cyan-300/70 bg-cyan-500/10 py-3 text-base text-cyan-100 hover:bg-cyan-500/20"
            >
              Open Signal Sprint (Canvas Arcade)
            </Link>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200 sm:grid-cols-3">
            <p>1. Win the genre wheel</p>
            <p>2. Control tense story turns</p>
            <p>3. Share your recap timeline</p>
          </div>

          <div className="flex items-center justify-center gap-4 text-sm text-zinc-300">
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
