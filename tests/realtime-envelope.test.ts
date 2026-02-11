import { describe, expect, it } from "vitest";
import { isServerEnvelope } from "../src/types/realtime";

describe("realtime envelope guard", () => {
  it("accepts objects with event string", () => {
    expect(isServerEnvelope({ event: "room_updated", data: { ok: true } })).toBe(true);
  });

  it("rejects invalid payloads", () => {
    expect(isServerEnvelope(null)).toBe(false);
    expect(isServerEnvelope({})).toBe(false);
    expect(isServerEnvelope({ event: 42 })).toBe(false);
    expect(isServerEnvelope("room_updated")).toBe(false);
  });
});
