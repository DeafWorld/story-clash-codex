"use client";

import type { GMSessionState } from "../../types/game";

type LiveVotesProps = {
  gmState: GMSessionState;
  playerNameById: Record<string, string>;
};

export default function LiveVotes({ gmState, playerNameById }: LiveVotesProps) {
  const totalVotes = Object.keys(gmState.voteState.votesByPlayerId).length;

  return (
    <section className="panel space-y-3 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Live votes</p>
      <p className="text-sm text-zinc-200">
        {totalVotes}/{gmState.readyState.requiredReadyIds.length} voted
      </p>

      <div className="space-y-2">
        {gmState.currentChoices.map((choice) => {
          const voters = Object.entries(gmState.voteState.votesByPlayerId)
            .filter(([, selected]) => selected === choice.id)
            .map(([playerId]) => playerNameById[playerId] ?? "Player");
          return (
            <div key={choice.id} className="rounded-xl border border-white/15 bg-black/20 p-3">
              <p className="font-semibold text-white">
                <span className="mr-2">{choice.icon}</span>
                {choice.label}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                {voters.length} vote{voters.length === 1 ? "" : "s"} {voters.length ? `• ${voters.join(", ")}` : ""}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/15 bg-black/20 p-3">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Freeform suggestions</p>
        <div className="mt-2 space-y-1">
          {Object.values(gmState.voteState.freeformByPlayerId).length === 0 ? (
            <p className="text-xs text-zinc-400">No suggestions yet.</p>
          ) : (
            Object.values(gmState.voteState.freeformByPlayerId).map((entry) => (
              <p key={entry.playerId} className="text-sm text-zinc-200">
                <span className="font-semibold">{entry.playerName}:</span> {entry.text}
              </p>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
