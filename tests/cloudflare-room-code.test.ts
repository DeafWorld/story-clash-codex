import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "../cloudflare/src/room-code";

describe("cloudflare room code helpers", () => {
  it("generates valid 4-letter room codes", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("normalizes codes and removes invalid characters", () => {
    expect(normalizeRoomCode(" ab-cd1 ")).toBe("ABCD");
    expect(normalizeRoomCode("oi12")).toBe("OI");
  });

  it("validates room code alphabet constraints", () => {
    expect(isValidRoomCode("ABCD")).toBe(true);
    expect(isValidRoomCode("AB1D")).toBe(false);
    expect(isValidRoomCode("OIII")).toBe(false);
  });
});
