import { afterEach, describe, expect, it } from "vitest";
import { suggestBeat, suggestChoices, suggestConsequence } from "../src/lib/ai-copilot";

const originalEnabled = process.env.NARRATIVE_AI_ENABLED;
const originalKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  process.env.NARRATIVE_AI_ENABLED = originalEnabled;
  process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("ai copilot fallback", () => {
  it("uses deterministic local source when AI is disabled", async () => {
    process.env.NARRATIVE_AI_ENABLED = "0";
    delete process.env.ANTHROPIC_API_KEY;

    const beat = await suggestBeat({ roomCode: "ABCD", beatIndex: 2, recentBeats: ["Old beat"] });
    const choices = await suggestChoices({ roomCode: "ABCD", beatIndex: 2, currentBeatText: "Hull cracks" });
    const consequence = await suggestConsequence({ roomCode: "ABCD", lockedChoiceLabel: "Push ahead" });

    expect(beat.source).toBe("local");
    expect(choices.source).toBe("local");
    expect(consequence.source).toBe("local");
    expect(choices.value).toHaveLength(3);
    expect(consequence.value.length).toBeGreaterThan(10);
  });
});
