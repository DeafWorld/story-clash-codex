import { describe, expect, it } from "vitest";
import { formatIntoBeats } from "../src/lib/beat-format";

describe("gm beat auto-formatting", () => {
  it("detects dialogue, action, separator, and auto inserts after 3 lines", () => {
    const beats = formatIntoBeats([
      "Thunder shakes the hull.",
      "Ghost: \"Follow me\"",
      "[Footsteps behind you]",
      "Another line forcing auto separator",
      "---",
      "Final plain line",
    ].join("\n"));

    expect(beats[0]?.type).toBe("text");
    expect(beats[1]?.type).toBe("dialogue");
    expect(beats[1]?.speaker).toBe("Ghost");
    expect(beats[2]?.type).toBe("action");
    expect(beats.some((entry) => entry.type === "separator")).toBe(true);
    expect(beats.at(-1)?.type).toBe("text");
  });

  it("falls back to speech icon when no known speaker", () => {
    const beats = formatIntoBeats('UnknownVoice: "Move"');
    const dialogue = beats.find((entry) => entry.type === "dialogue");
    expect(dialogue?.icon).toBe("💬");
  });
});
