import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import gmEventsSchema from "../protocol/gm-events.schema.json";
import snapshotSchema from "../protocol/snapshot.schema.json";
import { PROTOCOL_VERSION, SNAPSHOT_VERSION, isSupportedProtocolVersion } from "../protocol/protocol-version";

describe("protocol contract", () => {
  it("locks protocol and snapshot versions", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
    expect(SNAPSHOT_VERSION).toBe(1);
    expect(isSupportedProtocolVersion("1.0.0")).toBe(true);
    expect(isSupportedProtocolVersion("0.9.0")).toBe(false);
  });

  it("includes required handshake and gm loop events in schema", () => {
    const clientEvents = gmEventsSchema.properties.clientEvents.items.enum;
    const serverEvents = gmEventsSchema.properties.serverEvents.items.enum;

    expect(clientEvents).toContain("client_hello");
    expect(clientEvents).toContain("player_vote");
    expect(clientEvents).toContain("gm_publish_consequence");

    expect(serverEvents).toContain("server_hello");
    expect(serverEvents).toContain("gm_state_update");
    expect(serverEvents).toContain("vote_locked");
  });

  it("requires gm_state_update snapshot metadata fields", () => {
    const required = new Set(snapshotSchema.required);
    expect(required.has("roomCode")).toBe(true);
    expect(required.has("gmState")).toBe(true);
    expect(required.has("snapshotVersion")).toBe(true);
    expect(required.has("serverTimeMs")).toBe(true);
    expect(required.has("tick")).toBe(true);
  });

  it("ships five golden traces with required shape", { timeout: 120000 }, () => {
    const dir = join(process.cwd(), "protocol", "golden-traces");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThanOrEqual(5);

    files.forEach((file) => {
      const parsed = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
        id?: string;
        events?: string[];
        expected?: Record<string, unknown>;
      };
      expect(typeof parsed.id).toBe("string");
      expect(Array.isArray(parsed.events)).toBe(true);
      expect((parsed.events ?? []).length).toBeGreaterThan(0);
      expect(typeof parsed.expected).toBe("object");
    });
  });
});
