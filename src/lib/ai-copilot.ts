import type { GMChoice, StoryBeat } from "../types/game";
import {
  buildLocalBeatSuggestion,
  buildLocalChoiceSuggestions,
  buildLocalConsequenceSuggestion,
} from "./ai-copilot-local";

type CopilotContext = {
  roomCode?: string;
  beatIndex?: number;
  recentBeats?: string[];
  currentBeatText?: string;
  winningChoiceLabel?: string | null;
  lockedChoiceLabel?: string | null;
  freeformSnippets?: string[];
};

type CopilotResult<T> = {
  source: "claude" | "local";
  value: T;
};

function aiEnabled(): boolean {
  return process.env.NARRATIVE_AI_ENABLED === "1";
}

function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function clampText(value: string, maxChars: number): string {
  return value.trim().replace(/\n{3,}/g, "\n\n").slice(0, maxChars);
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("Claude key missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text")?.text ?? "";
  if (!text.trim()) {
    throw new Error("Claude returned empty response");
  }
  return text;
}

export async function suggestBeat(context: CopilotContext): Promise<CopilotResult<StoryBeat>> {
  if (!aiEnabled() || !claudeConfigured()) {
    return { source: "local", value: buildLocalBeatSuggestion(context) };
  }

  const prompt = [
    "You are assisting a live game master in a multiplayer storytelling game.",
    "Write the next beat as 2-4 short lines.",
    "Style: punchy, cinematic, scannable on mobile.",
    "No preamble. Output plain text only.",
    "",
    `Room: ${context.roomCode ?? "Unknown"}`,
    `Beat index: ${context.beatIndex ?? 0}`,
    `Recent beats: ${(context.recentBeats ?? []).slice(-3).join(" || ") || "none"}`,
  ].join("\n");

  try {
    const text = clampText(await callClaude(prompt, 300), 420);
    return {
      source: "claude",
      value: {
        ...buildLocalBeatSuggestion(context),
        rawText: text,
      },
    };
  } catch {
    return { source: "local", value: buildLocalBeatSuggestion(context) };
  }
}

export async function suggestChoices(context: CopilotContext): Promise<CopilotResult<GMChoice[]>> {
  if (!aiEnabled() || !claudeConfigured()) {
    return { source: "local", value: buildLocalChoiceSuggestions(context) };
  }

  const prompt = [
    "Generate exactly 3 choices for a live multiplayer story beat.",
    "Each choice label must be 2-5 words.",
    "Return JSON array only: [{label, icon, stakes, personality}].",
    "Personalities must vary.",
    "No markdown, no preamble.",
    "",
    `Current beat: ${context.currentBeatText ?? "unknown"}`,
  ].join("\n");

  try {
    const raw = await callClaude(prompt, 500);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{
      label?: string;
      icon?: string;
      stakes?: string;
      personality?: GMChoice["personality"];
    }>;
    const value: GMChoice[] = parsed.slice(0, 3).map((choice, index) => ({
      id: `choice-ai-${index}-${Date.now()}`,
      label: clampText(choice.label ?? `Choice ${index + 1}`, 40),
      icon: clampText(choice.icon ?? "🎭", 4),
      stakes: clampText(choice.stakes ?? "Unknown risk.", 80),
      personality: choice.personality ?? "analytical",
      order: index,
    }));
    if (value.length !== 3) {
      throw new Error("Invalid choice count");
    }
    return { source: "claude", value };
  } catch {
    return { source: "local", value: buildLocalChoiceSuggestions(context) };
  }
}

export async function suggestConsequence(context: CopilotContext): Promise<CopilotResult<string>> {
  if (!aiEnabled() || !claudeConfigured()) {
    return { source: "local", value: buildLocalConsequenceSuggestion(context) };
  }

  const prompt = [
    "Write the immediate consequence of the locked vote.",
    "Output exactly 3-5 short lines.",
    "No preamble. Plain text only.",
    "",
    `Locked choice: ${context.lockedChoiceLabel ?? context.winningChoiceLabel ?? "unknown"}`,
    `Freeform notes: ${(context.freeformSnippets ?? []).slice(0, 3).join(" | ") || "none"}`,
  ].join("\n");

  try {
    const text = clampText(await callClaude(prompt, 400), 480);
    return { source: "claude", value: text };
  } catch {
    return { source: "local", value: buildLocalConsequenceSuggestion(context) };
  }
}
