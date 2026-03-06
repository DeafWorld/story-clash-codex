import { describe, expect, it } from "vitest";
import { RoomDurableObject } from "../src/room-do";
import type { RoomState } from "../src/types";
import { deterministicTieBreakChoice } from "../../protocol/deterministic-lock";

type FakeStorage = {
  map: Map<string, unknown>;
  alarmAt: number | null;
  get: (key: string) => Promise<unknown>;
  put: (key: string, value: unknown) => Promise<void>;
  setAlarm: (ts: number) => Promise<void>;
  deleteAlarm: () => Promise<void>;
};

function createFakeState() {
  const storage: FakeStorage = {
    map: new Map<string, unknown>(),
    alarmAt: null,
    async get(key: string) {
      return this.map.get(key);
    },
    async put(key: string, value: unknown) {
      this.map.set(key, value);
    },
    async setAlarm(ts: number) {
      this.alarmAt = ts;
    },
    async deleteAlarm() {
      this.alarmAt = null;
    },
  };

  return {
    storage,
  } as unknown as { storage: FakeStorage };
}

async function createRoomFixture(code = "WXYZ") {
  const state = createFakeState();
  const roomDo = new RoomDurableObject(state as any, { WORKER_BUILD_ID: "test-build" }) as any;

  const createResponse = await roomDo.fetch(
    new Request("https://example/internal/create", {
      method: "POST",
      body: JSON.stringify({ code, name: "Host" }),
    })
  );
  const created = (await createResponse.json()) as { playerId: string };

  const joinSecondResponse = await roomDo.fetch(
    new Request("https://example/internal/join", {
      method: "POST",
      body: JSON.stringify({ name: "Second" }),
    })
  );
  const second = (await joinSecondResponse.json()) as { playerId: string };

  const joinThirdResponse = await roomDo.fetch(
    new Request("https://example/internal/join", {
      method: "POST",
      body: JSON.stringify({ name: "Third" }),
    })
  );
  const third = (await joinThirdResponse.json()) as { playerId: string };

  const room = (await state.storage.get("room")) as RoomState;

  return {
    roomDo,
    state,
    room,
    hostId: created.playerId,
    secondId: second.playerId,
    thirdId: third.playerId,
  };
}

function runToVotingOpen(fixture: Awaited<ReturnType<typeof createRoomFixture>>) {
  fixture.roomDo.startGame(fixture.room, fixture.hostId);
  fixture.roomDo.recordMinigameScore(fixture.room, fixture.hostId, 1, 11);
  fixture.roomDo.recordMinigameScore(fixture.room, fixture.secondId, 1, 22);
  fixture.roomDo.recordMinigameScore(fixture.room, fixture.thirdId, 1, 33);

  const spin = fixture.roomDo.resolveMinigameSpin(fixture.room, fixture.hostId);
  const storyMasterId = fixture.room.turnOrder[0];
  fixture.roomDo.selectGenre(fixture.room, storyMasterId, spin.outcome.winningGenre);

  fixture.roomDo.publishGMBeat(fixture.room, fixture.hostId, {
    title: "Bridge",
    location: "Deck",
    icon: "⚡",
    rawText: "Reality thins around the bulkhead.",
    visualBeats: [{ type: "text", content: "Reality thins around the bulkhead." }],
    aiSource: "local",
  });

  fixture.roomDo.publishGMChoices(fixture.room, fixture.hostId, {
    choices: [
      { id: "a", label: "Push ahead", icon: "⚔️" },
      { id: "b", label: "Scan room", icon: "🔍" },
      { id: "c", label: "Hold line", icon: "🛡️" },
    ],
    timeLimitSec: 30,
  });

  fixture.roomDo.markGMPlayerReady(fixture.room, fixture.secondId);
  fixture.roomDo.markGMPlayerReady(fixture.room, fixture.thirdId);
  fixture.roomDo.markGMReady(fixture.room, fixture.hostId);
}

describe("cloudflare room-do gm flow", () => {
  it("runs full gm loop into recap transcript", async () => {
    const fixture = await createRoomFixture();
    runToVotingOpen(fixture);

    const vote1 = fixture.roomDo.submitGMVote(fixture.room, fixture.secondId, "a");
    expect(vote1.locked).toBe(false);

    const vote2 = fixture.roomDo.submitGMVote(fixture.room, fixture.thirdId, "a");
    expect(vote2.locked).toBe(true);
    expect(fixture.room.gmState?.phase).toBe("vote_locked");

    fixture.roomDo.publishGMConsequence(
      fixture.room,
      fixture.hostId,
      "The crew lunges forward and the corridor folds into a narrower passage."
    );

    const recap = fixture.roomDo.getRecapState(fixture.room);
    expect(recap.sessionMode).toBe("gm");
    expect(recap.gmTranscript?.map((entry: { phase: string }) => entry.phase)).toEqual(["beat", "vote_lock", "consequence"]);
  });

  it("locks split votes with deterministic tie break parity", async () => {
    const fixture = await createRoomFixture("ABCD");
    runToVotingOpen(fixture);

    fixture.roomDo.submitGMVote(fixture.room, fixture.secondId, "a");
    const lock = fixture.roomDo.submitGMVote(fixture.room, fixture.thirdId, "b");

    expect(lock.locked).toBe(true);
    const beatIndex = fixture.room.gmState?.beatIndex ?? 0;
    const expected = deterministicTieBreakChoice({
      roomCode: fixture.room.code,
      beatIndex,
      topChoiceIds: ["a", "b"],
    });

    expect(fixture.room.gmState?.voteState.lockedChoiceId).toBe(expected);
  });
});
