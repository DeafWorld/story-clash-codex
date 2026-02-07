import { describe, expect, it } from "vitest";
import { askToConfessionPrompt, binaryToAsk, confessionToBinary } from "@/lib/cross-pollination";

describe("cross-pollination", () => {
  it("creates a binary prompt from a confession", () => {
    const result = confessionToBinary("I secretly love early mornings.");
    expect(result.question_text.length).toBeGreaterThan(0);
    expect(result.option_a.length).toBeGreaterThan(0);
    expect(result.option_b.length).toBeGreaterThan(0);
  });

  it("creates an ask question from a binary outcome", () => {
    const result = binaryToAsk("Coffee or Tea?", "Coffee");
    expect(result.question_text).toContain("Coffee");
  });

  it("creates a confession prompt from a question", () => {
    const result = askToConfessionPrompt("What do you regret the most?");
    expect(result.toLowerCase()).toContain("confess");
  });
});
