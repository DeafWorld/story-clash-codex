import { describe, expect, it } from "vitest";
import { buildSentryTags } from "../src/lib/logger";

describe("logger sentry tags", () => {
  it("maps room/phase/transport tags from common socket context", () => {
    const tags = buildSentryTags("socket.event.failed", {
      code: "ABCD",
      phase: "game",
      gmPhase: "voting_open",
      transport: "socketio",
      sessionMode: "gm",
      socketEvent: "player_vote",
      failureMode: "player_vote",
    });

    expect(tags).toMatchObject({
      event: "socket.event.failed",
      room_code: "ABCD",
      phase: "game",
      gm_phase: "voting_open",
      transport: "socketio",
      session_mode: "gm",
      socket_event: "player_vote",
      failure_mode: "player_vote",
    });
  });

  it("supports alternate key aliases", () => {
    const tags = buildSentryTags("custom.error", {
      roomCode: "ROOM",
      gm_phase: "vote_locked",
      session_mode: "gm",
      source: "timeout",
    });

    expect(tags).toMatchObject({
      event: "custom.error",
      room_code: "ROOM",
      gm_phase: "vote_locked",
      session_mode: "gm",
      source: "timeout",
    });
  });
});
