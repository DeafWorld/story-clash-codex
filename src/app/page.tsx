"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SITE_HOOK } from "@/lib/app-meta";
import TutorialOverlay from "../components/tutorial-overlay";
import SceneShell from "../components/motion/scene-shell";
import RiveLayer from "../components/motion/rive-layer";
import { heroRevealVariants, staggerListVariants } from "../lib/motion/presets";

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
    <SceneShell withParallax className="home-motion-shell">
      <div className="suspense-wash" aria-hidden />
      <div className="content-wrap grid min-h-dvh place-items-center">
        <motion.section
          className="panel w-full max-w-3xl space-y-8 p-6 sm:p-10"
          variants={heroRevealVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerListVariants} initial="hidden" animate="visible" className="space-y-5 text-center">
            <motion.p variants={heroRevealVariants} className="badge mx-auto">
              Live Social Story Game
            </motion.p>
            <motion.h1 variants={heroRevealVariants} className="hero-title text-[2.7rem] sm:text-7xl">
              Story Clash
            </motion.h1>
            <motion.p variants={heroRevealVariants} className="mx-auto max-w-2xl text-base text-zinc-200 sm:text-xl">
              Spin fate. Enter the Rift. Fight for the first move, then drive your crew through a high-stakes branching nightmare.
            </motion.p>
            <motion.p variants={heroRevealVariants} className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              {SITE_HOOK}
            </motion.p>
          </motion.div>

          <div className="mx-auto h-24 w-full max-w-lg">
            <RiveLayer assetId="rift_core_loop" className="h-full w-full" />
          </div>

          <motion.div className="grid gap-3" variants={staggerListVariants} initial="hidden" animate="visible">
            <motion.div variants={heroRevealVariants}>
              <Link href="/create" className="btn btn-primary w-full py-4 text-lg motion-cta magnetic-hover" id="cta-create">
                Create Room
              </Link>
            </motion.div>
            <motion.div variants={heroRevealVariants}>
              <Link href="/join" className="btn btn-secondary w-full py-4 text-lg motion-cta magnetic-hover">
                Join Room
              </Link>
            </motion.div>
            <motion.div variants={heroRevealVariants}>
              <Link
                href="/arcade.html"
                className="btn w-full border border-cyan-300/70 bg-cyan-500/10 py-3 text-base text-cyan-100 hover:bg-cyan-500/20"
              >
                Open Signal Sprint (Canvas Arcade)
              </Link>
            </motion.div>
          </motion.div>

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
        </motion.section>
      </div>

      {ready ? <TutorialOverlay open={tutorialOpen} onClose={closeTutorial} /> : null}
    </SceneShell>
  );
}
