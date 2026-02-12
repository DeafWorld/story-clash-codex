import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInviteText, buildInviteUrl, shareInvite } from "../src/lib/invite";

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
  vi.restoreAllMocks();
});

describe("invite utils", () => {
  it("builds join deep-link with normalized code", () => {
    const url = buildInviteUrl({
      code: "ab-cd1",
      origin: "https://story-clash-codex.vercel.app/",
      inviter: "Host",
    });
    expect(url).toBe("https://story-clash-codex.vercel.app/join?code=ABCD1&from=invite&inviter=Host");
  });

  it("builds invite copy with optional room label", () => {
    const text = buildInviteText({
      code: "abcd",
      origin: "https://example.com",
      roomLabel: "Night Run",
      inviter: "Host",
    });
    expect(text).toContain("ABCD");
    expect(text).toContain("Night Run");
    expect(text).toContain("Host invited you");
  });

  it("prefers native share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { share },
      configurable: true,
      writable: true,
    });

    const result = await shareInvite({
      code: "ABCD",
      origin: "https://example.com",
    });

    expect(share).toHaveBeenCalledOnce();
    expect(result.method).toBe("native");
  });

  it("falls back to clipboard when native share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: { writeText },
      },
      configurable: true,
      writable: true,
    });

    const result = await shareInvite({
      code: "ABCD",
      origin: "https://example.com",
    });

    expect(writeText).toHaveBeenCalledOnce();
    expect(result.method).toBe("clipboard");
    expect(result.url).toContain("/join?code=ABCD&from=invite");
  });
});
