import type { VisualBeat } from "../types/game";

const SPEAKER_ICONS: Record<string, string> = {
  ghost: "👻",
  child: "👶",
  spirit: "✨",
  narrator: "📖",
  you: "👤",
};

export function getIconForSpeaker(speaker?: string): string {
  if (!speaker) return "💬";
  const key = speaker.toLowerCase().trim();
  return SPEAKER_ICONS[key] ?? "💬";
}

export function formatIntoBeats(rawText: string): VisualBeat[] {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const beats: VisualBeat[] = [];
  let linesSinceSeparator = 0;

  for (const line of lines) {
    if (/^[-=•]{3,}$/.test(line)) {
      beats.push({ type: "separator", content: "---" });
      linesSinceSeparator = 0;
      continue;
    }

    if (linesSinceSeparator >= 3) {
      beats.push({ type: "separator", content: "---" });
      linesSinceSeparator = 0;
    }

    if (line.includes(":") || line.includes('"')) {
      const colonIndex = line.indexOf(":");
      const hasSpeaker = colonIndex > 0 && colonIndex < 24;
      const speaker = hasSpeaker ? line.slice(0, colonIndex).trim() : undefined;
      const content = hasSpeaker ? line.slice(colonIndex + 1).trim() : line;
      beats.push({
        type: "dialogue",
        speaker,
        content,
        icon: getIconForSpeaker(speaker),
      });
      linesSinceSeparator += 1;
      continue;
    }

    if (line.startsWith("[") || line.startsWith("*")) {
      beats.push({
        type: "action",
        content: line.replace(/^[\[*]\s*/, "").replace(/[\]*]$/, "").trim(),
      });
      linesSinceSeparator += 1;
      continue;
    }

    beats.push({ type: "text", content: line });
    linesSinceSeparator += 1;
  }

  return beats;
}
