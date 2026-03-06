"use client";

import { useState } from "react";
import type { GMChoice } from "../../types/game";

type ChoiceCreatorProps = {
  roomCode: string;
  beatIndex: number;
  currentBeatText: string;
  onPublish: (choices: GMChoice[], timeLimitSec: number) => void;
};

type ChoiceDraft = {
  label: string;
  icon: string;
  stakes: string;
  personality: GMChoice["personality"];
};

const EMPTY_DRAFT: ChoiceDraft = {
  label: "",
  icon: "🎭",
  stakes: "",
  personality: "analytical",
};

export default function ChoiceCreator({ roomCode, beatIndex, currentBeatText, onPublish }: ChoiceCreatorProps) {
  const [drafts, setDrafts] = useState<ChoiceDraft[]>([
    { ...EMPTY_DRAFT, icon: "⚔️", personality: "brave" },
    { ...EMPTY_DRAFT, icon: "🔍", personality: "analytical" },
    { ...EMPTY_DRAFT, icon: "🛡️", personality: "defensive" },
  ]);
  const [timeLimitSec, setTimeLimitSec] = useState(30);
  const [loading, setLoading] = useState(false);

  function updateDraft(index: number, patch: Partial<ChoiceDraft>) {
    setDrafts((current) => current.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
  }

  async function generateChoices() {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/suggest-choices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode,
          beatIndex,
          currentBeatText,
        }),
      });
      const data = (await response.json()) as { value: GMChoice[] };
      if (!response.ok) {
        throw new Error("Unable to generate choices");
      }
      setDrafts(
        data.value.map((choice) => ({
          label: choice.label,
          icon: choice.icon,
          stakes: choice.stakes ?? "",
          personality: choice.personality ?? "analytical",
        }))
      );
    } finally {
      setLoading(false);
    }
  }

  function publish() {
    const choices: GMChoice[] = drafts
      .map((draft, index) => ({
        id: `gm-choice-${index + 1}`,
        label: draft.label.trim(),
        icon: draft.icon.trim() || "🎭",
        stakes: draft.stakes.trim(),
        personality: draft.personality,
        order: index,
      }))
      .filter((choice) => Boolean(choice.label))
      .slice(0, 3);
    onPublish(choices, timeLimitSec);
  }

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Choices</h2>
        <button type="button" className="btn btn-secondary" onClick={generateChoices} disabled={loading}>
          {loading ? "Generating..." : "AI Generate"}
        </button>
      </div>
      <div className="space-y-2">
        {drafts.map((draft, index) => (
          <div key={index} className="rounded-xl border border-white/15 bg-black/20 p-3">
            <div className="grid gap-2 sm:grid-cols-[72px_1fr]">
              <input
                className="field text-center"
                maxLength={4}
                value={draft.icon}
                onChange={(event) => updateDraft(index, { icon: event.target.value })}
              />
              <input
                className="field"
                value={draft.label}
                onChange={(event) => updateDraft(index, { label: event.target.value })}
                placeholder="Choice label (2-5 words)"
              />
            </div>
            <input
              className="field mt-2"
              value={draft.stakes}
              onChange={(event) => updateDraft(index, { stakes: event.target.value })}
              placeholder="Short stakes line"
            />
            <select
              className="field mt-2"
              value={draft.personality}
              onChange={(event) => updateDraft(index, { personality: event.target.value as GMChoice["personality"] })}
            >
              <option value="brave">Brave</option>
              <option value="analytical">Analytical</option>
              <option value="defensive">Defensive</option>
              <option value="chaotic">Chaotic</option>
              <option value="empathetic">Empathetic</option>
              <option value="opportunistic">Opportunistic</option>
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-300" htmlFor="gm-timer-seconds">
          Vote timer
        </label>
        <input
          id="gm-timer-seconds"
          type="number"
          className="field w-28"
          min={10}
          max={90}
          value={timeLimitSec}
          onChange={(event) => setTimeLimitSec(Math.max(10, Math.min(90, Number(event.target.value) || 30)))}
        />
      </div>
      <button type="button" className="btn btn-primary w-full" onClick={publish}>
        Publish Choices
      </button>
    </section>
  );
}
