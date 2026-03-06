"use client";

import { FormEvent, useMemo, useState } from "react";
import type { StoryBeat, VisualBeat } from "../../types/game";
import { formatIntoBeats } from "../../lib/beat-format";

type StoryEditorProps = {
  roomCode: string;
  beatIndex: number;
  recentBeats: string[];
  onPublish: (input: {
    title: string;
    location: string;
    icon: string;
    rawText: string;
    visualBeats: VisualBeat[];
    aiSource: "claude" | "local" | null;
  }) => void;
};

export default function StoryEditor({ roomCode, beatIndex, recentBeats, onPublish }: StoryEditorProps) {
  const [title, setTitle] = useState("Rift Beat");
  const [location, setLocation] = useState("Unknown Sector");
  const [icon, setIcon] = useState("⚡");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"claude" | "local" | null>(null);

  const preview = useMemo<StoryBeat>(
    () => ({
      id: "preview",
      title,
      location,
      icon,
      rawText,
      visualBeats: formatIntoBeats(rawText),
      createdBy: "gm",
      createdAt: Date.now(),
    }),
    [icon, location, rawText, title]
  );

  async function suggestBeat() {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/suggest-beat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode,
          beatIndex,
          recentBeats,
        }),
      });
      const data = (await response.json()) as { source: "claude" | "local"; value: StoryBeat };
      if (!response.ok) {
        throw new Error("Unable to generate beat");
      }
      setAiSource(data.source);
      setTitle(data.value.title || "Rift Beat");
      setLocation(data.value.location || "Unknown Sector");
      setIcon(data.value.icon || "⚡");
      setRawText(data.value.rawText || "");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = rawText.trim();
    if (!text) return;
    onPublish({
      title: title.trim() || "Rift Beat",
      location: location.trim() || "Unknown Sector",
      icon: icon.trim() || "⚡",
      rawText: text,
      visualBeats: formatIntoBeats(text),
      aiSource,
    });
    setRawText("");
  }

  return (
    <form className="panel space-y-3 p-4" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Write Story Beat</h2>
        <button type="button" className="btn btn-secondary" onClick={suggestBeat} disabled={loading}>
          {loading ? "Thinking..." : "AI Suggest"}
        </button>
      </div>
      {aiSource ? <p className="text-xs text-cyan-200">AI source: {aiSource}</p> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
        <input className="field" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
        <input className="field" value={icon} maxLength={4} onChange={(event) => setIcon(event.target.value)} placeholder="Icon" />
      </div>
      <textarea
        className="field min-h-[160px]"
        value={rawText}
        onChange={(event) => setRawText(event.target.value)}
        placeholder='Write 2-4 short lines. Use "speaker: text" for dialogue, [action] for actions.'
      />
      <button type="submit" className="btn btn-primary w-full" disabled={!rawText.trim()}>
        Publish Beat
      </button>

      {preview.rawText.trim() ? (
        <div className="rounded-xl border border-white/15 bg-black/20 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-300">Preview</p>
          <div className="space-y-1">
            {preview.visualBeats.map((entry, index) => (
              <p key={`${entry.type}-${index}`} className="text-sm text-zinc-200">
                {entry.type === "separator" ? "━━━" : entry.content}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
