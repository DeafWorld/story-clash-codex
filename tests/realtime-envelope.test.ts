import { describe, expect, it } from "vitest";
import { isServerEnvelope } from "../src/types/realtime";

describe("realtime envelope guard", () => {
  it("accepts objects with event string", () => {
    expect(isServerEnvelope({ event: "room_updated", data: { ok: true } })).toBe(true);
    expect(
      isServerEnvelope({
        event: "narrator_update",
        data: { line: { id: "1", text: "line" } },
      })
    ).toBe(true);
    expect(
      isServerEnvelope({
        event: "server_hello",
        data: {
          accepted: true,
          protocolVersion: "1.0.0",
          capabilities: ["gm_mode_v1"],
          snapshotVersion: 1,
          serverTimeMs: Date.now(),
          buildId: "test-build",
        },
      })
    ).toBe(true);
  });

  it("rejects invalid payloads", () => {
    expect(isServerEnvelope(null)).toBe(false);
    expect(isServerEnvelope({})).toBe(false);
    expect(isServerEnvelope({ event: 42 })).toBe(false);
    expect(isServerEnvelope("room_updated")).toBe(false);
  });
});
