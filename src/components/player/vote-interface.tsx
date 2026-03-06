"use client";

import { useMemo } from "react";
import type { GMChoice, VoteState } from "../../types/game";
import MobileChoiceCard from "./mobile-choice-card";
import ChoiceTimer from "./choice-timer";

type VoteInterfaceProps = {
  choices: GMChoice[];
  voteState: VoteState;
  selfPlayerId: string;
  playerNameById: Record<string, string>;
  secondsLeft: number;
  maxSeconds: number;
  disabled?: boolean;
  onVote: (choiceId: string) => void;
};

export default function VoteInterface({
  choices,
  voteState,
  selfPlayerId,
  playerNameById,
  secondsLeft,
  maxSeconds,
  disabled,
  onVote,
}: VoteInterfaceProps) {
  const selectedChoiceId = voteState.votesByPlayerId[selfPlayerId] ?? null;

  const voterNamesByChoice = useMemo(() => {
    const byChoice: Record<string, string[]> = {};
    Object.entries(voteState.votesByPlayerId).forEach(([playerId, choiceId]) => {
      const name = playerNameById[playerId] ?? "Player";
      byChoice[choiceId] = [...(byChoice[choiceId] ?? []), name];
    });
    return byChoice;
  }, [playerNameById, voteState.votesByPlayerId]);

  return (
    <section className="panel space-y-3 p-4">
      <ChoiceTimer secondsLeft={secondsLeft} maxSeconds={maxSeconds} />
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Choose your action</p>
      <div className="space-y-3">
        {choices.map((choice, index) => (
          <MobileChoiceCard
            key={choice.id}
            choice={choice}
            index={index}
            voteCount={voteState.countsByChoiceId[choice.id] ?? 0}
            totalVotes={Object.keys(voteState.votesByPlayerId).length}
            voterNames={voterNamesByChoice[choice.id] ?? []}
            selected={selectedChoiceId === choice.id}
            disabled={Boolean(disabled || selectedChoiceId)}
            onSelect={onVote}
          />
        ))}
      </div>
    </section>
  );
}
