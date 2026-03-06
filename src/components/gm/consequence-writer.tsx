"use client";

import { FormEvent, useState } from "react";
import type { GMSessionState } from "../../types/game";

type ConsequenceWriterProps = {
  roomCode: string;
  gmState: GMSessionState;
  onPublish: (text: string) => void;
};

export default function ConsequenceWriter({ roomCode, gmState, onPublish }: ConsequenceWriterProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const lockedChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId) ?? null;

  async function suggest() {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/suggest-outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode,
          beatIndex: gmState.beatIndex,
          lockedChoiceLabel: lockedChoice?.label ?? null,
          freeformSnippets: Object.values(gmState.voteState.freeformByPlayerId).map((entry) => entry.text),
        }),
      });
      const data = (await response.json()) as { value: string };
      if (!response.ok) {
        throw new Error("Unable to generate consequence");
      }
      setText(data.value);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    onPublish(text.trim());
    setText("");
  }

  return (
    <form className="panel space-y-3 p-4" onSubmit={submit}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Write Consequence</h2>
        <button type="button" className="btn btn-secondary" onClick={suggest} disabled={loading}>
          {loading ? "Thinking..." : "AI Suggest"}
        </button>
      </div>
      {lockedChoice ? (
        <p className="text-sm text-zinc-300">
          Locked action: <span className="font-semibold text-white">{lockedChoice.icon} {lockedChoice.label}</span>
        </p>
      ) : null}
      <textarea
        className="field min-h-[180px]"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write 3-5 short lines showing what happens next..."
      />
      <button type="submit" className="btn btn-primary w-full" disabled={!text.trim()}>
        Publish Consequence
      </button>
    </form>
  );
}
