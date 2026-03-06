"use client";

import { useMemo } from "react";
import type { GMSessionState } from "../../types/game";

type AICopilotProps = {
  gmState: GMSessionState;
};

function phaseHint(phase: GMSessionState["phase"]): string {
  if (phase === "writing_beat") {
    return "Write 2-4 short lines. Leave room for disagreement.";
  }
  if (phase === "reading") {
    return "Wait for all players + GM ready before opening choices.";
  }
  if (phase === "creating_choices") {
    return "Use 3 options with clear tradeoffs and 2-5 word labels.";
  }
  if (phase === "voting_open") {
    return "Watch split votes and freeform; they should shape consequence tone.";
  }
  if (phase === "vote_locked") {
    return "Write 3-5 short lines that immediately cash out the locked action.";
  }
  if (phase === "writing_consequence") {
    return "After consequence lands, advance quickly to keep pacing tight.";
  }
  return "Keep scenes scannable and decisions meaningful.";
}

export default function AICopilot({ gmState }: AICopilotProps) {
  const lockedChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId) ?? null;
  const voteCount = Object.keys(gmState.voteState.votesByPlayerId).length;
  const freeformCount = Object.keys(gmState.voteState.freeformByPlayerId).length;

  const callbackHints = useMemo(() => {
    const snippets = gmState.beatHistory.slice(-3).map((beat) => beat.rawText.split("\n")[0]).filter(Boolean);
    return snippets.slice(-2);
  }, [gmState.beatHistory]);

  return (
    <section className="panel space-y-3 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">AI Copilot</p>
      <p className="text-sm text-zinc-100">{phaseHint(gmState.phase)}</p>

      <div className="rounded-xl border border-white/15 bg-black/20 p-3 text-xs text-zinc-300">
        <p>
          Beat {gmState.beatIndex} • Phase <span className="font-semibold text-white">{gmState.phase.replaceAll("_", " ")}</span>
        </p>
        <p>
          AI source: <span className="font-semibold text-cyan-200">{gmState.aiSource ?? "local"}</span>
        </p>
        <p>
          Votes: <span className="font-semibold text-white">{voteCount}</span> • Freeform: <span className="font-semibold text-white">{freeformCount}</span>
        </p>
        {lockedChoice ? (
          <p>
            Locked: <span className="font-semibold text-fuchsia-200">{lockedChoice.icon} {lockedChoice.label}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/15 bg-black/20 p-3">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Reality remembers seeds</p>
        <div className="mt-2 space-y-1">
          {callbackHints.length === 0 ? (
            <p className="text-xs text-zinc-500">No callback seeds yet.</p>
          ) : (
            callbackHints.map((hint, index) => (
              <p key={`${hint}-${index}`} className="text-xs text-zinc-200">
                • {hint}
              </p>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        Claude is used when available; fallback stays deterministic and never blocks turn flow.
      </p>
    </section>
  );
}
