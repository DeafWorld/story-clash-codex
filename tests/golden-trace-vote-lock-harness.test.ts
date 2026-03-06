import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRoom,
  getGameState,
  getRecapState,
  joinRoom,
  markGMPlayerReady,
  markGMReady,
  publishGMBeat,
  publishGMChoices,
  publishGMConsequence,
  recordMinigameScore,
  resolveMinigameSpin,
  selectGenre,
  startGame,
  submitGMVote,
} from "../src/lib/store";
import { deterministicTieBreakChoice } from "../protocol/deterministic-lock";
import { RoomDurableObject } from "../cloudflare/src/room-do";
import type { RoomState } from "../cloudflare/src/types";

function loadTrace(id: string): any {
  const path = resolve(process.cwd(), "protocol", "golden-traces", `${id}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function setupStoreVotingRoom() {
  const host = createRoom("Host");
  const second = joinRoom(host.code, "Second");
  const third = joinRoom(host.code, "Third");

  startGame(host.code, host.playerId);
  recordMinigameScore(host.code, host.playerId, 1, 11);
  recordMinigameScore(host.code, second.playerId, 1, 22);
  recordMinigameScore(host.code, third.playerId, 1, 33);

  const spin = resolveMinigameSpin(host.code, host.playerId);
  const storyMasterId = getGameState(host.code).turnOrder[0];
  selectGenre(host.code, storyMasterId, spin.outcome.winningGenre);

  publishGMBeat(host.code, host.playerId, {
    title: "Bridge",
    location: "Deck",
    icon: "⚡",
    rawText: "Reality thins around the bulkhead.",
    visualBeats: [{ type: "text", content: "Reality thins around the bulkhead." }],
    aiSource: "local",
  });

  publishGMChoices(host.code, host.playerId, {
    choices: [
      { id: "a", label: "Push ahead", icon: "⚔️" },
      { id: "b", label: "Scan room", icon: "🔍" },
      { id: "c", label: "Hold line", icon: "🛡️" },
    ],
    timeLimitSec: 30,
  });

  markGMPlayerReady(host.code, second.playerId);
  markGMPlayerReady(host.code, third.playerId);
  markGMReady(host.code, host.playerId);

  return {
    code: host.code,
    hostId: host.playerId,
    secondId: second.playerId,
    thirdId: third.playerId,
  };
}

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

async function setupDoVotingRoom(code = "QWER") {
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

  roomDo.startGame(room, created.playerId);
  roomDo.recordMinigameScore(room, created.playerId, 1, 11);
  roomDo.recordMinigameScore(room, second.playerId, 1, 22);
  roomDo.recordMinigameScore(room, third.playerId, 1, 33);

  const spin = roomDo.resolveMinigameSpin(room, created.playerId);
  const storyMasterId = room.turnOrder[0];
  roomDo.selectGenre(room, storyMasterId, spin.outcome.winningGenre);

  roomDo.publishGMBeat(room, created.playerId, {
    title: "Bridge",
    location: "Deck",
    icon: "⚡",
    rawText: "Reality thins around the bulkhead.",
    visualBeats: [{ type: "text", content: "Reality thins around the bulkhead." }],
    aiSource: "local",
  });

  roomDo.publishGMChoices(room, created.playerId, {
    choices: [
      { id: "a", label: "Push ahead", icon: "⚔️" },
      { id: "b", label: "Scan room", icon: "🔍" },
      { id: "c", label: "Hold line", icon: "🛡️" },
    ],
    timeLimitSec: 30,
  });

  roomDo.markGMPlayerReady(room, second.playerId);
  roomDo.markGMPlayerReady(room, third.playerId);
  roomDo.markGMReady(room, created.playerId);

  return {
    roomDo,
    room,
    hostId: created.playerId,
    secondId: second.playerId,
    thirdId: third.playerId,
  };
}

describe("deterministic vote-lock harness", () => {
  it("replays majority and tie traces with parity across Node + Cloudflare", async () => {
    const majorityTrace = loadTrace("gm-majority-basic");
    const tieTrace = loadTrace("gm-tie-break-hash");

    const storeMajority = setupStoreVotingRoom();
    submitGMVote(storeMajority.code, storeMajority.secondId, "a");
    const storeMajorityLock = submitGMVote(storeMajority.code, storeMajority.thirdId, "a");
    publishGMConsequence(
      storeMajority.code,
      storeMajority.hostId,
      "The crew lunges forward and the corridor folds into a narrower passage."
    );
    const storeRecap = getRecapState(storeMajority.code);

    expect(storeMajorityLock.locked).toBe(true);
    expect(storeRecap.gmTranscript?.map((entry) => entry.phase)).toEqual(majorityTrace.expected.transcriptPhases);

    const doMajority = await setupDoVotingRoom("ZXCV");
    doMajority.roomDo.submitGMVote(doMajority.room, doMajority.secondId, "a");
    const doMajorityLock = doMajority.roomDo.submitGMVote(doMajority.room, doMajority.thirdId, "a");
    doMajority.roomDo.publishGMConsequence(
      doMajority.room,
      doMajority.hostId,
      "The crew lunges forward and the corridor folds into a narrower passage."
    );
    const doRecap = doMajority.roomDo.getRecapState(doMajority.room);

    expect(doMajorityLock.locked).toBe(true);
    expect(doRecap.gmTranscript?.map((entry: { phase: string }) => entry.phase)).toEqual(majorityTrace.expected.transcriptPhases);

    const storeTie = setupStoreVotingRoom();
    submitGMVote(storeTie.code, storeTie.secondId, "a");
    const storeTieLock = submitGMVote(storeTie.code, storeTie.thirdId, "b");

    const doTie = await setupDoVotingRoom("TYUK");
    doTie.roomDo.submitGMVote(doTie.room, doTie.secondId, "a");
    const doTieLock = doTie.roomDo.submitGMVote(doTie.room, doTie.thirdId, "b");

    const storeExpected = deterministicTieBreakChoice({
      roomCode: storeTie.code,
      beatIndex: storeTieLock.gmState.beatIndex,
      topChoiceIds: ["a", "b"],
    });

    const doExpected = deterministicTieBreakChoice({
      roomCode: doTie.room.code,
      beatIndex: doTie.room.gmState?.beatIndex ?? 0,
      topChoiceIds: ["a", "b"],
    });

    expect(tieTrace.expected.deterministicLock).toBe(true);
    expect(storeTieLock.locked).toBe(true);
    expect(doTieLock.locked).toBe(true);
    expect(storeTieLock.gmState.voteState.lockedChoiceId).toBe(storeExpected);
    expect(doTie.room.gmState?.voteState.lockedChoiceId).toBe(doExpected);
  });
});
