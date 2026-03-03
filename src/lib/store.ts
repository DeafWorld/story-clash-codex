import { nanoid } from "nanoid";
import { containsProfanity, sanitizeDisplayName } from "./profanity";
import { generateRoomCode, validateRoomCode } from "./room-code";
import { getScene, getStoryTitle } from "./stories";
import { generateNarrationLine } from "./narrator";
import { logger } from "./logger";
import { sanitizeFreeformInput } from "./ai-copilot-local";
import { deterministicTieBreakChoice, stableHash } from "../../protocol/deterministic-lock";
import {
  applyEvolutionStep,
  createInitialPlayerProfile,
  createInitialWorldState,
  ensurePlayerProfiles,
} from "./evolution-engine";
import { applyNarrativeDirector, defaultMotionCue } from "./narrative-director";
import {
  applySplitVoteImpact,
  resolveRealityRemembers,
  resolveSplitVoteConsequence,
  scheduleDirectorCallbacks,
  syncArchetypeProgress,
} from "./director-v1";
import {
  appendWorldEvent,
  computeChaosLevel,
  createInitialGenrePower,
  deriveChoiceGenreShift,
  deriveRecentTensionDelta,
  deriveVoteSplitSeverity,
  evaluateRiftEvent,
  applyGenrePowerShift,
  scenesSinceLastRift,
  toWorldEventFromRift,
} from "./rift";
import type {
  Choice,
  EndingType,
  GMChoice,
  GMSessionState,
  GMTranscriptEntry,
  GenreId,
  HistoryEntry,
  MinigameOutcome,
  MVP,
  NarrationLine,
  NarrationTrigger,
  Player,
  SessionMode,
  StoryBeat,
  RoomState,
  RoomView,
  Scene,
} from "../types/game";

const ROOM_TTL_MS = 30 * 60 * 1000;
const TURN_DURATION_MS = 30 * 1000;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const MAX_NARRATION_LOG = 30;
const MAX_RIFT_HISTORY = 40;
const MAX_DIRECTOR_TIMELINE = 40;
const MAX_DIRECTOR_CALLBACKS = 28;
const GM_DEFAULT_VOTE_SECONDS = 30;
const MAX_GM_BEAT_HISTORY = 40;
const MAX_GM_TRANSCRIPT = 120;

const AVATARS = ["circle-cyan", "diamond-red", "hex-green", "triangle-blue", "square-gold", "ring-white"];
const ROUND_TWO_SCORES = [940, 760, 670, 610, 560, 520];
const ROUND_THREE_SCORES = [360, 300, 260, 230, 205, 180];
const MINIGAME_GENRES: GenreId[] = ["zombie", "alien", "haunted"];
const MINIGAME_PICK_SCORE: Record<GenreId, number> = {
  zombie: 11,
  alien: 22,
  haunted: 33,
};
const PICK_SCORE_TO_GENRE: Record<number, GenreId> = Object.entries(MINIGAME_PICK_SCORE).reduce(
  (acc, [genre, score]) => {
    acc[score] = genre as GenreId;
    return acc;
  },
  {} as Record<number, GenreId>
);

type SocketPlayer = {
  code: string;
  playerId: string;
};

type StoreState = {
  rooms: Map<string, RoomState>;
  sockets: Map<string, SocketPlayer>;
};

declare global {
  var __STORY_CLASH_STATE__: StoreState | undefined;
}

const state: StoreState =
  globalThis.__STORY_CLASH_STATE__ ?? {
    rooms: new Map(),
    sockets: new Map(),
  };

globalThis.__STORY_CLASH_STATE__ = state;

function now() {
  return Date.now();
}

function seededChoice<T>(items: T[], seed: string): T {
  const index = stableHash(seed) % items.length;
  return items[index] ?? items[0];
}

function decodeMinigamePick(score: number | undefined): GenreId | null {
  if (!Number.isFinite(score)) {
    return null;
  }
  const rounded = Math.round(score ?? 0);
  return PICK_SCORE_TO_GENRE[rounded] ?? null;
}

function scriptedScore(rank: number, round: 2 | 3): number {
  if (round === 2) {
    return ROUND_TWO_SCORES[rank] ?? Math.max(420, 540 - rank * 40);
  }
  return ROUND_THREE_SCORES[rank] ?? Math.max(110, 180 - rank * 18);
}

function playersByJoinOrder(room: RoomState): Player[] {
  return [...room.players].sort((a, b) => {
    const orderA = a.orderIndex ?? a.turnOrder ?? 0;
    const orderB = b.orderIndex ?? b.turnOrder ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });
}

function notFound(message: string): never {
  throw new Error(message);
}

function ensureFreshRoom(code: string): RoomState {
  const room = state.rooms.get(code);
  if (!room) {
    notFound("Room not found");
  }

  if (room.expiresAt < now()) {
    state.rooms.delete(code);
    notFound("Room expired");
  }

  room.phase = room.phase ?? room.status ?? "lobby";
  room.status = room.status ?? room.phase;
  room.sessionMode = (room.sessionMode ?? "classic") as SessionMode;
  if (room.sessionMode === "gm") {
    room.gmState = room.gmState ?? createInitialGMState(room.players.find((player) => player.isHost)?.id ?? null);
  } else {
    room.gmState = null;
  }
  room.storyId = room.storyId ?? room.genre ?? null;
  room.currentNodeId = room.currentNodeId ?? room.currentSceneId;
  room.currentPlayerId = room.currentPlayerId ?? activePlayerId(room);
  room.tensionLevel = room.tensionLevel ?? getCurrentScene(room)?.tensionLevel ?? 1;
  room.genrePower = room.genrePower ?? createInitialGenrePower(room.genre ?? null);
  room.chaosLevel =
    room.chaosLevel ??
    computeChaosLevel({
      genrePower: room.genrePower,
      selectedGenre: room.genre ?? null,
      tensionLevel: room.tensionLevel ?? 1,
    });
  room.riftHistory = (room.riftHistory ?? []).slice(-MAX_RIFT_HISTORY);
  room.activeRiftEvent = room.activeRiftEvent ?? null;
  room.latestNarration = room.latestNarration ?? null;
  room.narrationLog = (room.narrationLog ?? []).slice(-MAX_NARRATION_LOG);
  room.worldState = room.worldState ?? createInitialWorldState();
  room.latestWorldEvent = room.latestWorldEvent ?? room.worldState.timeline.at(-1) ?? null;
  room.playerProfiles = ensurePlayerProfiles(room.players, room.playerProfiles ?? {});
  room.archetypeProgress = room.archetypeProgress ?? {};
  room.splitVoteConsequence = room.splitVoteConsequence ?? null;
  room.deferredCallbacks = (room.deferredCallbacks ?? []).slice(-MAX_DIRECTOR_CALLBACKS);
  room.realityRemembersLine = room.realityRemembersLine ?? null;
  room.narrativeThreads = room.narrativeThreads ?? [];
  room.activeThreadId = room.activeThreadId ?? null;
  room.directorTimeline = (room.directorTimeline ?? []).slice(-MAX_DIRECTOR_TIMELINE);
  room.directedScene = room.directedScene ?? null;
  room.players = room.players.map((player, index) => ({
    ...player,
    orderIndex: player.orderIndex ?? player.turnOrder ?? index,
  }));
  room.sceneReadyPlayerIds = normalizeSceneReadyPlayerIds(room);
  if (room.sessionMode === "gm" && room.gmState) {
    room.gmState.gmPlayerId =
      room.gmState.gmPlayerId ??
      room.players.find((player) => player.isHost)?.id ??
      room.players[0]?.id ??
      null;
    room.gmState.beatHistory = (room.gmState.beatHistory ?? []).slice(-MAX_GM_BEAT_HISTORY);
    room.gmState.transcript = (room.gmState.transcript ?? []).slice(-MAX_GM_TRANSCRIPT);
    room.gmState.currentChoices = (room.gmState.currentChoices ?? []).slice(0, 3);
    room.gmState.phase = room.gmState.phase ?? "writing_beat";
    room.gmState.voteState = room.gmState.voteState ?? {
      votesByPlayerId: {},
      countsByChoiceId: {},
      freeformByPlayerId: {},
      lockedChoiceId: null,
      openedAt: null,
      deadlineAt: null,
    };
    room.gmState.readyState = room.gmState.readyState ?? {
      readyPlayerIds: [],
      readyGm: false,
      requiredReadyIds: [],
      allReady: false,
    };
    recomputeReadyState(room);
  }
  if (room.phase === "game") {
    const legacyChoicesOpen = (room as { choicesOpen?: boolean }).choicesOpen;
    if (room.turnDeadline && typeof legacyChoicesOpen !== "boolean") {
      room.choicesOpen = true;
      room.sceneReadyPlayerIds = connectedPlayerIds(room);
    }
    room.choicesOpen = room.choicesOpen ?? false;
    if (room.choicesOpen && !room.turnDeadline) {
      room.turnDeadline = now() + TURN_DURATION_MS;
    }
  } else {
    room.choicesOpen = false;
    room.sceneReadyPlayerIds = [];
    room.turnDeadline = null;
  }
  room.archetypeProgress = syncArchetypeProgress({
    players: room.players,
    playerProfiles: room.playerProfiles,
    current: room.archetypeProgress,
    step: room.history.length,
  });
  if (!room.directedScene) {
    const scene = getCurrentScene(room);
    if (scene) {
      room.directedScene = {
        sceneId: scene.id,
        baseText: scene.text,
        renderedText: scene.text,
        beatType: "setup",
        pressureBand: "calm",
        intensity: 22,
        activeThreadId: room.activeThreadId,
        payoffThreadId: null,
        motionCue: defaultMotionCue(),
        updatedAt: now(),
      };
    }
  }

  return room;
}

function newPlayer(name: string, isHost: boolean, index: number): Player {
  return {
    id: nanoid(),
    name,
    avatar: AVATARS[index % AVATARS.length],
    isHost,
    score: 0,
    orderIndex: index,
    turnOrder: index,
    connected: true,
    rounds: [],
    joinedAt: now(),
  };
}

function uniqueName(room: RoomState, requestedName: string): string {
  const base = sanitizeDisplayName(requestedName);
  if (!base) {
    throw new Error("Display name is required");
  }

  if (!room.players.some((player) => player.name.toLowerCase() === base.toLowerCase())) {
    return base;
  }

  let suffix = 2;
  while (suffix < 99) {
    const candidate = `${base.slice(0, Math.max(1, 12 - String(suffix).length))}${suffix}`;
    if (!room.players.some((player) => player.name.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }

  return `${base.slice(0, 10)}99`;
}

function activePlayerId(room: RoomState): string | null {
  if (!room.turnOrder.length) {
    return null;
  }
  return room.turnOrder[room.activePlayerIndex] ?? null;
}

function connectedPlayerIds(room: RoomState): string[] {
  return room.players.filter((player) => player.connected !== false).map((player) => player.id);
}

function normalizeSceneReadyPlayerIds(room: RoomState): string[] {
  const validIds = new Set(room.players.map((player) => player.id));
  return [...new Set((room.sceneReadyPlayerIds ?? []).filter((playerId) => validIds.has(playerId)))];
}

function resetSceneReadiness(room: RoomState) {
  room.sceneReadyPlayerIds = [];
  room.choicesOpen = false;
  room.turnDeadline = null;
}

function maybeUnlockChoices(room: RoomState): boolean {
  if (room.phase !== "game" || room.choicesOpen) {
    return false;
  }

  const required = connectedPlayerIds(room);
  if (!required.length) {
    return false;
  }

  const ready = new Set(room.sceneReadyPlayerIds);
  const allReady = required.every((playerId) => ready.has(playerId));
  if (!allReady) {
    return false;
  }

  room.choicesOpen = true;
  room.turnDeadline = now() + TURN_DURATION_MS;
  return true;
}

function getCurrentScene(room: RoomState): Scene | null {
  if (!room.genre) {
    return null;
  }
  return getScene(room.genre, room.currentSceneId);
}

function setRoomPhase(room: RoomState, nextPhase: RoomState["phase"]) {
  room.phase = nextPhase;
  room.status = nextPhase;
}

function rotateToConnectedPlayer(room: RoomState, fromIndex: number): number {
  if (!room.turnOrder.length) {
    return 0;
  }

  for (let i = 1; i <= room.turnOrder.length; i += 1) {
    const idx = (fromIndex + i) % room.turnOrder.length;
    const playerId = room.turnOrder[idx];
    const player = room.players.find((entry) => entry.id === playerId);
    if (player?.connected) {
      return idx;
    }
  }

  return fromIndex;
}

function getChoice(scene: Scene, choiceId: string): Choice | null {
  return scene.choices?.find((choice) => choice.id === choiceId) ?? null;
}

function appendNarration(
  room: RoomState,
  trigger: NarrationTrigger,
  input: {
    sceneId?: string | null;
    playerId?: string | null;
    choiceLabel?: string | null;
    freeText?: string | null;
    endingType?: EndingType | null;
    tensionLevel?: number;
  } = {}
): NarrationLine {
  const player = room.players.find((entry) => entry.id === (input.playerId ?? room.currentPlayerId));
  const line = generateNarrationLine({
    code: room.code,
    trigger,
    genre: room.genre,
    sceneId: input.sceneId ?? room.currentNodeId,
    historyLength: room.history.length,
    tensionLevel: input.tensionLevel ?? room.tensionLevel,
    playerId: input.playerId ?? room.currentPlayerId,
    playerName: player?.name ?? null,
    choiceLabel: input.choiceLabel ?? null,
    freeText: input.freeText ?? null,
    endingType: input.endingType ?? room.endingType,
  });
  room.latestNarration = line;
  room.narrationLog = [...(room.narrationLog ?? []), line].slice(-MAX_NARRATION_LOG);
  return line;
}

function ensureHostAssigned(room: RoomState) {
  const currentHost = room.players.find((player) => player.isHost && player.connected !== false);
  if (currentHost) {
    return;
  }

  const nextHost = room.players.find((player) => player.connected) ?? room.players[0];
  room.players = room.players.map((player) => ({
    ...player,
    isHost: Boolean(nextHost && player.id === nextHost.id),
  }));
  if (room.sessionMode === "gm" && room.gmState) {
    room.gmState.gmPlayerId = nextHost?.id ?? room.gmState.gmPlayerId;
    recomputeReadyState(room);
  }
}

function computeMVP(room: RoomState): MVP {
  const withMostScore = [...room.players].sort((a, b) => b.score - a.score)[0];
  if (room.endingType === "triumph") {
    return {
      player: withMostScore?.name ?? "Unknown",
      reason: "Made the decisive call that secured victory",
    };
  }
  if (room.endingType === "survival") {
    return {
      player: withMostScore?.name ?? "Unknown",
      reason: "Kept the team alive under pressure",
    };
  }
  const fallback = room.history[room.history.length - 1]?.player ?? withMostScore?.name ?? "Unknown";
  return {
    player: fallback,
    reason: "Owned the wildest move in a doomed run",
  };
}

function deriveGmEndingType(chaosLevel: number): EndingType {
  if (chaosLevel >= 70) {
    return "doom";
  }
  if (chaosLevel >= 35) {
    return "survival";
  }
  return "triumph";
}

function buildGmHistory(room: RoomState, gmState: GMSessionState): HistoryEntry[] {
  const beatsById = new Map(gmState.beatHistory.map((beat) => [beat.id, beat]));
  return gmState.transcript
    .filter((entry) => entry.phase === "vote_lock")
    .map((entry, index) => {
      const beat = beatsById.get(entry.beatId) ?? gmState.beatHistory[index] ?? null;
      const choiceLabel = entry.winningChoiceLabel ?? "Continue";
      const fallbackPlayer = room.players[index % Math.max(1, room.players.length)];
      const playerName = fallbackPlayer?.name ?? "Crew";
      return {
        sceneId: beat?.id ?? `gm-scene-${entry.beatIndex}`,
        sceneText: beat?.rawText ?? entry.beatText ?? "The scene shifted under Rift pressure.",
        playerId: fallbackPlayer?.id ?? "gm",
        player: playerName,
        playerName,
        choice: choiceLabel,
        choiceLabel,
        isFreeChoice: false,
        nextNodeId: `gm-beat-${entry.beatIndex + 1}`,
        tensionLevel: Math.min(5, 1 + Math.floor(room.chaosLevel / 20)),
        timestamp: entry.createdAt,
      };
    });
}

function computeGmMvp(room: RoomState, gmState: GMSessionState): MVP {
  const counts: Record<string, number> = {};
  gmState.transcript
    .filter((entry) => entry.phase === "vote_lock")
    .forEach((entry) => {
      (entry.freeform ?? []).forEach((item) => {
        counts[item.playerId] = (counts[item.playerId] ?? 0) + 1;
      });
    });

  const ranked = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (ranked.length > 0) {
    const [playerId] = ranked[0];
    const playerName = room.players.find((player) => player.id === playerId)?.name ?? "Unknown";
    return {
      player: playerName,
      reason: "Kept feeding decisive ideas that shaped the group's outcomes.",
    };
  }

  const gmName = room.players.find((player) => player.id === gmState.gmPlayerId)?.name ?? "GM";
  return {
    player: gmName,
    reason: "Directed the crew through every Rift beat without losing narrative momentum.",
  };
}

function ensureRoomCode(): string {
  for (let i = 0; i < 100; i += 1) {
    const code = generateRoomCode();
    if (!state.rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate room code");
}

function createInitialGMState(gmPlayerId: string | null): GMSessionState {
  return {
    mode: "gm",
    gmPlayerId,
    phase: "writing_beat",
    beatIndex: 0,
    currentBeat: null,
    currentChoices: [],
    currentOutcomeText: null,
    readyState: {
      readyPlayerIds: [],
      readyGm: false,
      requiredReadyIds: [],
      allReady: false,
    },
    voteState: {
      votesByPlayerId: {},
      countsByChoiceId: {},
      freeformByPlayerId: {},
      lockedChoiceId: null,
      openedAt: null,
      deadlineAt: null,
    },
    aiSource: null,
    beatHistory: [],
    transcript: [],
  };
}

function storyBeatToText(beat: StoryBeat): string {
  if (beat.rawText?.trim()) {
    return beat.rawText.trim();
  }
  return beat.visualBeats.map((entry) => entry.content).join("\n").trim();
}

function nextTranscriptEntryId() {
  return `gm-log-${nanoid(10)}`;
}

function sanitizeChoiceLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function recomputeReadyState(room: RoomState) {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return;
  }
  const gmState = room.gmState;
  const requiredPlayerIds = connectedPlayerIds(room).filter((id) => id !== gmState.gmPlayerId);
  gmState.readyState.requiredReadyIds = requiredPlayerIds;
  gmState.readyState.readyPlayerIds = gmState.readyState.readyPlayerIds.filter((id) => requiredPlayerIds.includes(id));
  gmState.readyState.allReady =
    gmState.readyState.readyGm &&
    requiredPlayerIds.every((id) => gmState.readyState.readyPlayerIds.includes(id));
}

function resetGMReadiness(room: RoomState) {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return;
  }
  room.gmState.readyState.readyPlayerIds = [];
  room.gmState.readyState.readyGm = false;
  recomputeReadyState(room);
}

function resetGMVoting(room: RoomState) {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return;
  }
  room.gmState.voteState = {
    votesByPlayerId: {},
    countsByChoiceId: {},
    freeformByPlayerId: {},
    lockedChoiceId: null,
    openedAt: null,
    deadlineAt: null,
  };
}

function maybeOpenGMVoting(room: RoomState, timeLimitSec = GM_DEFAULT_VOTE_SECONDS): boolean {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return false;
  }
  const gmState = room.gmState;
  if (!gmState.currentChoices.length || !gmState.readyState.allReady) {
    return false;
  }
  const openedAt = now();
  gmState.phase = "voting_open";
  gmState.voteState.openedAt = openedAt;
  gmState.voteState.deadlineAt = openedAt + Math.max(5, timeLimitSec) * 1000;
  room.turnDeadline = gmState.voteState.deadlineAt;
  room.choicesOpen = true;
  room.sceneReadyPlayerIds = [...gmState.readyState.readyPlayerIds];
  room.currentPlayerId = null;
  return true;
}

function resolveLockedGMChoice(room: RoomState): string | null {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return null;
  }
  const gmState = room.gmState;
  const counts = gmState.voteState.countsByChoiceId;
  const entries = Object.entries(counts);
  if (!entries.length) {
    return gmState.currentChoices[0]?.id ?? null;
  }
  const maxVotes = Math.max(...entries.map(([, count]) => count));
  const topChoiceIds = entries
    .filter(([, count]) => count === maxVotes)
    .map(([choiceId]) => choiceId)
    .sort((left, right) => left.localeCompare(right));
  return deterministicTieBreakChoice({
    roomCode: room.code,
    beatIndex: gmState.beatIndex,
    topChoiceIds,
  });
}

function lockGMVote(room: RoomState): boolean {
  if (room.sessionMode !== "gm" || !room.gmState) {
    return false;
  }
  const gmState = room.gmState;
  if (gmState.phase !== "voting_open") {
    return false;
  }

  const lockedChoiceId = resolveLockedGMChoice(room);
  gmState.voteState.lockedChoiceId = lockedChoiceId;
  gmState.phase = "vote_locked";
  room.choicesOpen = false;
  room.turnDeadline = null;
  room.sceneReadyPlayerIds = [];

  const lockedChoice = gmState.currentChoices.find((choice) => choice.id === lockedChoiceId);
  const freeform = Object.values(gmState.voteState.freeformByPlayerId).map((entry) => ({
    playerId: entry.playerId,
    playerName: entry.playerName,
    text: entry.text,
    timestamp: entry.timestamp,
  }));
  const logEntry: GMTranscriptEntry = {
    id: nextTranscriptEntryId(),
    beatId: gmState.currentBeat?.id ?? `beat-${gmState.beatIndex}`,
    beatIndex: gmState.beatIndex,
    phase: "vote_lock",
    winningChoiceId: lockedChoiceId,
    winningChoiceLabel: lockedChoice?.label ?? null,
    voteCounts: { ...gmState.voteState.countsByChoiceId },
    freeform,
    createdAt: now(),
  };
  gmState.transcript = [...gmState.transcript, logEntry].slice(-MAX_GM_TRANSCRIPT);
  return true;
}

export function roomExists(code: string): boolean {
  const result = validateRoomCode(code, (value) => state.rooms.has(value));
  return result.formatValid && result.exists;
}

export function createRoom(hostName: string) {
  const normalizedName = sanitizeDisplayName(hostName);
  if (!normalizedName) {
    throw new Error("Display name is required");
  }

  const code = ensureRoomCode();
  const host = newPlayer(normalizedName, true, 0);
  const initialProfiles = {
    [host.id]: createInitialPlayerProfile(host.id),
  };
  const room: RoomState = {
    id: nanoid(),
    code,
    createdAt: now(),
    expiresAt: now() + ROOM_TTL_MS,
    active: true,
    sessionMode: "gm",
    gmState: createInitialGMState(host.id),
    status: "lobby",
    phase: "lobby",
    storyId: null,
    players: [host],
    turnOrder: [host.id],
    activePlayerIndex: 0,
    currentPlayerId: host.id,
    sceneReadyPlayerIds: [],
    choicesOpen: false,
    genre: null,
    currentNodeId: "start",
    currentSceneId: "start",
    tensionLevel: 1,
    history: [],
    genrePower: createInitialGenrePower(null),
    chaosLevel: 0,
    riftHistory: [],
    activeRiftEvent: null,
    latestNarration: null,
    narrationLog: [],
    worldState: createInitialWorldState(),
    latestWorldEvent: null,
    playerProfiles: initialProfiles,
    archetypeProgress: syncArchetypeProgress({
      players: [host],
      playerProfiles: initialProfiles,
      current: {},
      step: 0,
    }),
    splitVoteConsequence: null,
    deferredCallbacks: [],
    realityRemembersLine: null,
    narrativeThreads: [],
    activeThreadId: null,
    directedScene: null,
    directorTimeline: [],
    turnDeadline: null,
    endingScene: null,
    endingType: null,
  };

  state.rooms.set(code, room);

  return {
    code,
    roomId: room.id,
    playerId: host.id,
    sessionMode: room.sessionMode,
  };
}

export function joinRoom(code: string, playerName: string) {
  const validation = validateRoomCode(code, (value) => state.rooms.has(value));
  if (!validation.formatValid || !validation.exists) {
    throw new Error("Room not found");
  }

  const room = ensureFreshRoom(validation.normalized);
  if (room.phase !== "lobby") {
    throw new Error("Game in progress");
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new Error("Room is full");
  }

  const name = uniqueName(room, playerName);
  const player = newPlayer(name, false, room.players.length);
  room.players.push(player);
  room.turnOrder = room.players.map((entry) => entry.id);
  room.currentPlayerId = activePlayerId(room);
  room.playerProfiles = ensurePlayerProfiles(room.players, room.playerProfiles ?? {});
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    room: getRoomView(room.code),
    playerId: player.id,
  };
}

export function markPlayerConnection(code: string, playerId: string, connected: boolean) {
  const room = ensureFreshRoom(code);
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  player.connected = connected;
  if (room.phase === "game" && !room.choicesOpen) {
    maybeUnlockChoices(room);
  }
  if (room.sessionMode === "gm") {
    recomputeReadyState(room);
    if (room.gmState?.phase === "creating_choices") {
      maybeOpenGMVoting(room);
    }
  }
  ensureHostAssigned(room);
}

export function getRoomView(code: string): RoomView {
  const room = ensureFreshRoom(code);
  return {
    ...room,
    storyTitle: getStoryTitle(room.genre),
    currentScene: getCurrentScene(room),
    activePlayerId: activePlayerId(room),
  };
}

export function startGame(code: string, hostPlayerId: string) {
  const room = ensureFreshRoom(code);
  const host = room.players.find((player) => player.isHost);

  if (!host || host.id !== hostPlayerId) {
    throw new Error("Only host can start the game");
  }

  if (room.players.length < MIN_PLAYERS) {
    throw new Error("Need 3+ players");
  }

  setRoomPhase(room, "minigame");
  room.players.forEach((player) => {
    player.score = 0;
    player.rounds = [];
  });
  room.playerProfiles = ensurePlayerProfiles(room.players, room.playerProfiles ?? {});
  room.archetypeProgress = syncArchetypeProgress({
    players: room.players,
    playerProfiles: room.playerProfiles,
    current: room.archetypeProgress ?? {},
    step: room.history.length,
  });
  room.currentPlayerId = activePlayerId(room);
  resetSceneReadiness(room);

  return {
    startAt: now() + 1200,
  };
}

export function recordMinigameScore(code: string, playerId: string, round: number, score: number) {
  const room = ensureFreshRoom(code);
  if (room.phase !== "minigame") {
    throw new Error("Minigame not active");
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  if (round !== 1) {
    throw new Error("Round is server-controlled");
  }

  const rounded = Math.round(score);
  if (!decodeMinigamePick(rounded)) {
    throw new Error("Invalid pick");
  }

  const rounds = player.rounds ?? [];
  if (Number.isFinite(rounds[0])) {
    throw new Error("Pick already locked");
  }

  rounds[0] = rounded;
  player.rounds = rounds;
  player.score = Math.max(0, rounded);

  const ready = room.players.every((entry) => decodeMinigamePick(entry.rounds?.[0]) !== null);
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    ready,
    pick: decodeMinigamePick(rounded),
  };
}

export function resolveMinigameSpin(code: string, hostPlayerId: string): { leaderboard: Player[]; outcome: MinigameOutcome } {
  const room = ensureFreshRoom(code);
  if (room.phase !== "minigame") {
    throw new Error("Minigame not active");
  }

  const host = room.players.find((player) => player.isHost);
  if (!host || host.id !== hostPlayerId) {
    throw new Error("Only host can spin the wheel");
  }

  const orderedPlayers = playersByJoinOrder(room);
  const missingPick = orderedPlayers.some((player) => decodeMinigamePick(player.rounds?.[0]) === null);
  if (missingPick) {
    throw new Error("Waiting for all picks");
  }

  const genrePool = MINIGAME_GENRES.filter((genre) =>
    orderedPlayers.some((player) => decodeMinigamePick(player.rounds?.[0]) === genre)
  );
  const availableGenres = genrePool.length ? genrePool : MINIGAME_GENRES;
  const seedBase = `${room.code}:${orderedPlayers.map((player) => `${player.id}:${Math.round(player.rounds?.[0] ?? 0)}`).join("|")}`;
  const winningGenre = seededChoice(availableGenres, `${seedBase}:genre`);

  const contendersByPick = orderedPlayers.filter((player) => decodeMinigamePick(player.rounds?.[0]) === winningGenre);
  const contenders = contendersByPick.length ? contendersByPick : orderedPlayers;
  const winner = seededChoice(contenders, `${seedBase}:winner`);

  const leaderboard = [winner, ...orderedPlayers.filter((player) => player.id !== winner.id)];
  leaderboard.forEach((player, rank) => {
    const firstRound = Math.round(player.rounds?.[0] ?? MINIGAME_PICK_SCORE.zombie);
    const rounds = [firstRound, scriptedScore(rank, 2), scriptedScore(rank, 3)];
    player.rounds = rounds;
    player.score = rounds.reduce((sum, value) => sum + value, 0);
  });

  room.turnOrder = leaderboard.map((player) => player.id);
  room.players = room.players.map((entry) => {
    const scored = leaderboard.find((player) => player.id === entry.id) ?? entry;
    const rank = room.turnOrder.indexOf(entry.id);
    return {
      ...entry,
      score: scored.score,
      rounds: scored.rounds ?? [],
      orderIndex: rank,
      turnOrder: rank,
    };
  });
  room.activePlayerIndex = 0;
  room.currentPlayerId = activePlayerId(room);
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    leaderboard: room.turnOrder.map((id) => room.players.find((player) => player.id === id) ?? notFound("Player not found")),
    outcome: {
      winningGenre,
      contenders: contenders.map((player) => player.id),
      winnerId: winner.id,
      tieBreak: contenders.length > 1,
    },
  };
}

export function selectGenre(code: string, playerId: string, genre: GenreId) {
  const room = ensureFreshRoom(code);

  if (room.phase !== "minigame") {
    throw new Error("Minigame not complete");
  }

  if (room.turnOrder[0] !== playerId) {
    throw new Error("Only Story Master can choose a genre");
  }

  room.genre = genre;
  room.storyId = genre;
  setRoomPhase(room, "game");
  room.currentSceneId = "start";
  room.currentNodeId = "start";
  room.history = [];
  room.genrePower = createInitialGenrePower(genre);
  room.chaosLevel = 0;
  room.riftHistory = [];
  room.activeRiftEvent = null;
  room.latestWorldEvent = null;
  room.splitVoteConsequence = null;
  room.deferredCallbacks = [];
  room.realityRemembersLine = null;
  room.directorTimeline = [];
  room.directedScene = null;
  room.endingScene = null;
  room.endingType = null;
  room.activePlayerIndex = 0;
  resetSceneReadiness(room);
  room.playerProfiles = ensurePlayerProfiles(room.players, room.playerProfiles ?? {});
  room.archetypeProgress = syncArchetypeProgress({
    players: room.players,
    playerProfiles: room.playerProfiles,
    current: room.archetypeProgress ?? {},
    step: room.history.length,
  });
  room.worldState.meta.communityChoiceInfluence = Math.min(100, room.worldState.meta.communityChoiceInfluence + 2);
  room.narrativeThreads = room.narrativeThreads.map((thread) => ({
    ...thread,
    status: thread.status === "dormant" ? "active" : thread.status,
    metadata: {
      ...thread.metadata,
      scenesSinceMention: thread.metadata.scenesSinceMention + 1,
    },
  }));
  room.activeThreadId = room.narrativeThreads.find((thread) => thread.status === "active")?.id ?? null;

  const scene = getCurrentScene(room);
  if (!scene) {
    throw new Error("Story scene not found");
  }
  room.tensionLevel = scene.tensionLevel ?? 1;
  room.chaosLevel = computeChaosLevel({
    genrePower: room.genrePower,
    selectedGenre: room.genre,
    tensionLevel: room.tensionLevel,
  });
  room.currentPlayerId = activePlayerId(room);
  const narration = appendNarration(room, "scene_enter", {
    sceneId: scene.id,
    playerId: room.currentPlayerId,
    tensionLevel: room.tensionLevel,
  });
  const directed = applyNarrativeDirector({
    roomCode: room.code,
    scene,
    chaosLevel: room.chaosLevel,
    tensionLevel: room.tensionLevel,
    historyLength: room.history.length + 1,
    actorProfile: room.currentPlayerId ? (room.playerProfiles[room.currentPlayerId] ?? null) : null,
    narrativeThreads: room.narrativeThreads,
    activeThreadId: room.activeThreadId,
    directorTimeline: room.directorTimeline,
  });
  room.narrativeThreads = directed.narrativeThreads;
  room.activeThreadId = directed.activeThreadId;
  room.directedScene = directed.directedScene;
  room.directorTimeline = directed.directorTimeline;
  if (directed.timelineEvents.length > 0) {
    room.worldState.timeline = [...room.worldState.timeline, ...directed.timelineEvents].slice(-60);
    room.latestWorldEvent = room.worldState.timeline.at(-1) ?? room.latestWorldEvent;
  }
  const memoryLine = resolveRealityRemembers({
    roomCode: room.code,
    step: room.history.length,
    currentPlayerId: room.currentPlayerId,
    players: room.players,
    playerProfiles: room.playerProfiles,
    queue: room.deferredCallbacks,
    history: room.history,
    worldState: room.worldState,
    splitVoteConsequence: room.splitVoteConsequence,
  });
  room.deferredCallbacks = memoryLine.queue;
  room.realityRemembersLine = memoryLine.line;
  if (room.sessionMode === "gm") {
    room.gmState = createInitialGMState(room.players.find((player) => player.isHost)?.id ?? playerId);
    room.gmState.phase = "writing_beat";
    room.gmState.beatIndex = 0;
    recomputeReadyState(room);
  }

  return {
    genre,
    scene,
    activePlayerId: activePlayerId(room),
    turnDeadline: room.turnDeadline,
    narration,
  };
}

export function getGameState(code: string): RoomView {
  return getRoomView(code);
}

function assertGMSession(room: RoomState): GMSessionState {
  if (room.sessionMode !== "gm" || !room.gmState) {
    throw new Error("Room is not in GM mode");
  }
  return room.gmState;
}

function assertGMControl(room: RoomState, gmPlayerId: string): GMSessionState {
  const gmState = assertGMSession(room);
  if (!gmState.gmPlayerId || gmState.gmPlayerId !== gmPlayerId) {
    throw new Error("Only GM can perform this action");
  }
  return gmState;
}

export function publishGMBeat(
  code: string,
  gmPlayerId: string,
  payload: {
    title?: string;
    location?: string;
    icon?: string;
    rawText: string;
    visualBeats: StoryBeat["visualBeats"];
    aiSource?: "claude" | "local" | null;
  }
) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMControl(room, gmPlayerId);
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }

  const rawText = payload.rawText.trim();
  if (!rawText) {
    throw new Error("Beat text is required");
  }

  const beat: StoryBeat = {
    id: `beat-${nanoid(10)}`,
    title: payload.title?.trim().slice(0, 42) || "Rift Beat",
    location: payload.location?.trim().slice(0, 42) || "Unknown Sector",
    icon: payload.icon?.trim().slice(0, 4) || "⚡",
    rawText: rawText.slice(0, 1600),
    visualBeats: payload.visualBeats.slice(0, 48),
    createdBy: gmPlayerId,
    createdAt: now(),
  };

  gmState.currentBeat = beat;
  gmState.currentOutcomeText = null;
  gmState.currentChoices = [];
  gmState.phase = "reading";
  gmState.aiSource = payload.aiSource ?? gmState.aiSource ?? null;
  gmState.beatHistory = [...gmState.beatHistory, beat].slice(-MAX_GM_BEAT_HISTORY);
  gmState.beatIndex += 1;
  resetGMReadiness(room);
  resetGMVoting(room);
  room.turnDeadline = null;
  room.choicesOpen = false;
  room.sceneReadyPlayerIds = [];

  const transcriptEntry: GMTranscriptEntry = {
    id: nextTranscriptEntryId(),
    beatId: beat.id,
    beatIndex: gmState.beatIndex,
    phase: "beat",
    beatText: storyBeatToText(beat),
    createdAt: now(),
  };
  gmState.transcript = [...gmState.transcript, transcriptEntry].slice(-MAX_GM_TRANSCRIPT);
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    gmState,
    beat,
  };
}

export function markGMReady(code: string, gmPlayerId: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMControl(room, gmPlayerId);
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }
  if (!gmState.currentBeat) {
    throw new Error("No active beat");
  }

  gmState.readyState.readyGm = true;
  recomputeReadyState(room);
  const opened = maybeOpenGMVoting(room);
  room.expiresAt = now() + ROOM_TTL_MS;
  return {
    gmState,
    opened,
  };
}

export function markGMPlayerReady(code: string, playerId: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMSession(room);
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }
  if (!gmState.currentBeat) {
    throw new Error("No active beat");
  }
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  if (playerId === gmState.gmPlayerId) {
    throw new Error("GM should use gm_mark_ready");
  }
  if (player.connected === false) {
    throw new Error("Player is disconnected");
  }

  const ready = new Set(gmState.readyState.readyPlayerIds);
  ready.add(playerId);
  gmState.readyState.readyPlayerIds = [...ready];
  recomputeReadyState(room);
  const opened = maybeOpenGMVoting(room);
  room.expiresAt = now() + ROOM_TTL_MS;
  return {
    gmState,
    opened,
  };
}

export function publishGMChoices(
  code: string,
  gmPlayerId: string,
  payload: { choices: Array<Partial<GMChoice>>; timeLimitSec?: number }
) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMControl(room, gmPlayerId);
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }
  if (!gmState.currentBeat) {
    throw new Error("No active beat");
  }

  const normalizedChoices: GMChoice[] = payload.choices
    .map((choice, index) => {
      const label = sanitizeChoiceLabel(choice.label ?? "");
      if (!label) {
        return null;
      }
      return {
        id: String(choice.id ?? `gm-choice-${index + 1}`),
        label,
        icon: String(choice.icon ?? "🎭").slice(0, 4),
        stakes: choice.stakes?.trim().slice(0, 100),
        personality: choice.personality,
        order: index,
      } as GMChoice;
    })
    .filter((choice): choice is GMChoice => Boolean(choice))
    .slice(0, 3);

  if (normalizedChoices.length < 2) {
    throw new Error("At least two choices are required");
  }

  gmState.currentChoices = normalizedChoices;
  gmState.phase = "creating_choices";
  resetGMVoting(room);
  gmState.voteState.countsByChoiceId = Object.fromEntries(normalizedChoices.map((choice) => [choice.id, 0]));
  const opened = maybeOpenGMVoting(room, payload.timeLimitSec ?? GM_DEFAULT_VOTE_SECONDS);
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    gmState,
    opened,
  };
}

export function submitGMVote(code: string, playerId: string, choiceId: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMSession(room);
  if (gmState.phase !== "voting_open") {
    throw new Error("Voting is not open");
  }
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  if (playerId === gmState.gmPlayerId) {
    throw new Error("GM cannot vote in GM mode");
  }
  if (player.connected === false) {
    throw new Error("Player is disconnected");
  }
  if (gmState.voteState.votesByPlayerId[playerId]) {
    throw new Error("Player already voted");
  }
  const choice = gmState.currentChoices.find((entry) => entry.id === choiceId);
  if (!choice) {
    throw new Error("Invalid choice");
  }

  gmState.voteState.votesByPlayerId[playerId] = choice.id;
  gmState.voteState.countsByChoiceId[choice.id] = (gmState.voteState.countsByChoiceId[choice.id] ?? 0) + 1;

  const totalVoters = connectedPlayerIds(room).filter((id) => id !== gmState.gmPlayerId).length;
  const votedCount = Object.keys(gmState.voteState.votesByPlayerId).length;
  const majorityThreshold = Math.floor(Math.max(1, totalVoters) / 2) + 1;
  const choiceVotes = gmState.voteState.countsByChoiceId[choice.id] ?? 0;
  let locked = false;
  if (choiceVotes >= majorityThreshold || votedCount >= totalVoters) {
    locked = lockGMVote(room);
  }
  room.expiresAt = now() + ROOM_TTL_MS;
  return {
    gmState,
    locked,
  };
}

export function submitGMFreeform(code: string, playerId: string, rawText: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMSession(room);
  if (gmState.phase !== "voting_open") {
    throw new Error("Freeform is only available during voting");
  }
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  const sanitized = sanitizeFreeformInput(rawText);
  if (!sanitized) {
    throw new Error("Freeform cannot be empty");
  }
  if (containsProfanity(sanitized)) {
    throw new Error("Freeform contains blocked language");
  }

  gmState.voteState.freeformByPlayerId[playerId] = {
    playerId,
    playerName: player.name,
    text: sanitized,
    timestamp: now(),
  };
  room.expiresAt = now() + ROOM_TTL_MS;
  return {
    gmState,
    text: sanitized,
  };
}

export function lockGMVoteIfDue(code: string, force = false) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMSession(room);
  if (gmState.phase !== "voting_open") {
    return { locked: false, gmState };
  }

  const deadline = gmState.voteState.deadlineAt ?? 0;
  if (!force && (!deadline || deadline > now())) {
    return { locked: false, gmState };
  }

  const locked = lockGMVote(room);
  room.expiresAt = now() + ROOM_TTL_MS;
  return { locked, gmState };
}

export function publishGMConsequence(code: string, gmPlayerId: string, rawText: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMControl(room, gmPlayerId);
  if (gmState.phase !== "vote_locked") {
    throw new Error("Vote must be locked before publishing a consequence");
  }
  const text = rawText.trim().slice(0, 2000);
  if (!text) {
    throw new Error("Consequence text is required");
  }

  gmState.currentOutcomeText = text;
  gmState.phase = "writing_consequence";
  const winningChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId);
  gmState.transcript = [
    ...gmState.transcript,
    {
      id: nextTranscriptEntryId(),
      beatId: gmState.currentBeat?.id ?? `beat-${gmState.beatIndex}`,
      beatIndex: gmState.beatIndex,
      phase: "consequence" as const,
      consequenceText: text,
      winningChoiceId: gmState.voteState.lockedChoiceId,
      winningChoiceLabel: winningChoice?.label ?? null,
      createdAt: now(),
    },
  ].slice(-MAX_GM_TRANSCRIPT);
  room.expiresAt = now() + ROOM_TTL_MS;
  return {
    gmState,
  };
}

export function advanceGMBeat(code: string, gmPlayerId: string) {
  const room = ensureFreshRoom(code);
  const gmState = assertGMControl(room, gmPlayerId);
  if (gmState.phase !== "writing_consequence") {
    throw new Error("Publish consequence before advancing");
  }
  gmState.phase = "writing_beat";
  gmState.currentBeat = null;
  gmState.currentChoices = [];
  gmState.currentOutcomeText = null;
  resetGMReadiness(room);
  resetGMVoting(room);
  room.turnDeadline = null;
  room.choicesOpen = false;
  room.sceneReadyPlayerIds = [];
  room.expiresAt = now() + ROOM_TTL_MS;
  return { gmState };
}

export function markSceneReady(code: string, playerId: string) {
  const room = ensureFreshRoom(code);
  if (room.sessionMode === "gm") {
    throw new Error("Use player_mark_ready in GM mode");
  }
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  if (player.connected === false) {
    throw new Error("Player is disconnected");
  }

  const previouslyOpen = room.choicesOpen;
  const ready = new Set(room.sceneReadyPlayerIds ?? []);
  ready.add(playerId);
  room.sceneReadyPlayerIds = [...ready];
  const justOpened = maybeUnlockChoices(room);
  const requiredPlayers = connectedPlayerIds(room);
  room.expiresAt = now() + ROOM_TTL_MS;

  return {
    activePlayerId: activePlayerId(room),
    readyCount: requiredPlayers.filter((id) => room.sceneReadyPlayerIds.includes(id)).length,
    totalCount: requiredPlayers.length,
    choicesOpen: room.choicesOpen,
    turnDeadline: room.turnDeadline,
    justOpened: !previouslyOpen && justOpened,
  };
}

export function submitChoice(
  code: string,
  playerId: string,
  payload: { choiceId?: string; timeout?: boolean }
) {
  const room = ensureFreshRoom(code);
  if (room.sessionMode === "gm") {
    throw new Error("Classic submit_choice is disabled in GM mode");
  }
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }
  if (!room.choicesOpen || !room.turnDeadline) {
    throw new Error("Choices are locked until everyone is ready");
  }

  const activeId = activePlayerId(room);
  if (!activeId || activeId !== playerId) {
    throw new Error("Not your turn");
  }

  const scene = getCurrentScene(room);
  if (!scene || !scene.choices?.length) {
    throw new Error("Scene does not have choices");
  }
  const sceneChoices = scene.choices;
  if (!payload.timeout && !payload.choiceId) {
    throw new Error("Choice is required");
  }

  const defaultChoice = sceneChoices[0];
  let nextSceneId = defaultChoice.next ?? defaultChoice.nextId;
  let resolvedChoiceText = defaultChoice.text ?? defaultChoice.label ?? "Continue";
  let selectedChoiceId = defaultChoice.id;

  if (payload.timeout) {
    const randomChoice = sceneChoices[Math.floor(Math.random() * sceneChoices.length)] ?? defaultChoice;
    nextSceneId = randomChoice.next ?? randomChoice.nextId;
    resolvedChoiceText = randomChoice.text ?? randomChoice.label ?? resolvedChoiceText;
    selectedChoiceId = randomChoice.id;
  } else if (payload.choiceId) {
    const selected = getChoice(scene, payload.choiceId);
    if (!selected) {
      throw new Error("Choice not found");
    }
    nextSceneId = selected.next ?? selected.nextId;
    resolvedChoiceText = selected.text ?? selected.label ?? resolvedChoiceText;
    selectedChoiceId = selected.id;
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  if (!nextSceneId) {
    throw new Error("Scene choice is missing a next node");
  }
  const genre = room.genre;
  if (!genre) {
    throw new Error("Genre is not selected");
  }

  room.genrePower = applyGenrePowerShift(
    room.genrePower,
    deriveChoiceGenreShift({
      selectedGenre: genre,
      scene,
      choiceLabel: resolvedChoiceText,
      timeout: payload.timeout,
    })
  );
  room.chaosLevel = computeChaosLevel({
    genrePower: room.genrePower,
    selectedGenre: genre,
    tensionLevel: scene.tensionLevel ?? 1,
    timeout: payload.timeout,
  });

  const voteSplitSeverity = deriveVoteSplitSeverity({
    availableChoices: sceneChoices.length,
    recentChoiceTargets: room.history
      .slice(-4)
      .map((entry) => entry.nextNodeId)
      .filter((value): value is string => Boolean(value)),
    selectedNextSceneId: nextSceneId,
  });

  const rift = evaluateRiftEvent({
    roomCode: room.code,
    step: room.history.length + 1,
    scene,
    choices: sceneChoices,
    selectedChoiceId,
    selectedNextSceneId: nextSceneId,
    playerId,
    genrePower: room.genrePower,
    chaosLevel: room.chaosLevel,
    timeout: payload.timeout,
    voteSplitSeverity,
    scenesSinceLastRift: scenesSinceLastRift({
      historyLength: room.history.length,
      riftHistory: room.riftHistory,
    }),
    recentTensionDelta: deriveRecentTensionDelta({
      currentTension: scene.tensionLevel ?? 1,
      recentTensions: room.history.slice(-3).map((entry) => entry.tensionLevel ?? 1),
    }),
  });
  nextSceneId = rift.nextSceneId;
  room.genrePower = rift.genrePower;
  room.chaosLevel = rift.chaosLevel;
  room.activeRiftEvent = rift.event;
  const splitConsequence = resolveSplitVoteConsequence({
    roomCode: room.code,
    step: room.history.length + 1,
    sceneId: scene.id,
    sourcePlayerId: playerId,
    sourcePlayerName: player.name,
    choiceLabel: resolvedChoiceText,
    availableChoices: sceneChoices.length,
    voteSplitSeverity,
    chaosLevel: room.chaosLevel,
    worldState: room.worldState,
  });
  room.splitVoteConsequence = splitConsequence;
  if (rift.event) {
    room.riftHistory = [...room.riftHistory, rift.event].slice(-MAX_RIFT_HISTORY);
    const mappedWorldEvent = toWorldEventFromRift(rift.event);
    const worldUpdate = appendWorldEvent(room.worldState.timeline, mappedWorldEvent, 60);
    room.worldState.timeline = worldUpdate.timeline;
    room.latestWorldEvent = worldUpdate.latest;
  }
  if (splitConsequence) {
    const splitImpact = applySplitVoteImpact({
      consequence: splitConsequence,
      genrePower: room.genrePower,
    });
    room.genrePower = applyGenrePowerShift(room.genrePower, splitImpact.genreShift);
    room.chaosLevel = computeChaosLevel({
      genrePower: room.genrePower,
      selectedGenre: genre,
      tensionLevel: scene.tensionLevel ?? 1,
      timeout: payload.timeout,
      bonus: splitImpact.chaosBonus,
    });
    const splitWorld = appendWorldEvent(room.worldState.timeline, splitImpact.worldEvent, 60);
    room.worldState.timeline = splitWorld.timeline;
    room.latestWorldEvent = splitWorld.latest;
  }
  logger.info("rift.trigger_evaluated", {
    roomCode: room.code,
    step: room.history.length + 1,
    probability: rift.decision.probability,
    roll: rift.decision.roll,
    triggered: rift.decision.triggered,
    eventType: rift.event?.type ?? null,
    chaos: room.chaosLevel,
    genreLead: Math.max(room.genrePower.zombie, room.genrePower.alien, room.genrePower.haunted),
  });

  const historyEntry = {
    sceneId: scene.id,
    sceneText: scene.text,
    playerId,
    player: player.name,
    playerName: player.name,
    choice: resolvedChoiceText,
    choiceLabel: resolvedChoiceText,
    isFreeChoice: false,
    nextNodeId: nextSceneId,
    tensionLevel: scene.tensionLevel ?? 1,
    timestamp: now(),
  };
  room.history.push(historyEntry);

  const narration = appendNarration(room, payload.timeout ? "turn_timeout" : "choice_submitted", {
    sceneId: scene.id,
    playerId,
    choiceLabel: resolvedChoiceText,
    tensionLevel: scene.tensionLevel ?? 1,
  });

  const nextScene = getScene(genre, nextSceneId);
  if (!nextScene) {
    throw new Error("Next scene not found");
  }

  room.currentSceneId = nextScene.id;
  room.currentNodeId = nextScene.id;
  room.tensionLevel = nextScene.tensionLevel ?? 1;
  room.expiresAt = now() + ROOM_TTL_MS;

  const evolution = applyEvolutionStep({
    roomCode: room.code,
    players: room.players,
    worldState: room.worldState,
    playerProfiles: room.playerProfiles,
    narrativeThreads: room.narrativeThreads,
    actorPlayerId: playerId,
    genre,
    scene,
    choiceId: selectedChoiceId,
    choiceLabel: resolvedChoiceText,
    choices: sceneChoices,
    tensionLevel: scene.tensionLevel ?? 1,
    chaosLevel: room.chaosLevel,
    timeout: payload.timeout,
    historyLength: room.history.length,
    endingType: nextScene.ending ? ((nextScene.endingType ?? "doom") as EndingType) : null,
  });
  room.worldState = evolution.worldState;
  room.playerProfiles = evolution.playerProfiles;
  room.narrativeThreads = evolution.narrativeThreads;
  room.activeThreadId = evolution.activeThreadId;
  room.chaosLevel = evolution.chaosLevel;
  room.archetypeProgress = syncArchetypeProgress({
    players: room.players,
    playerProfiles: room.playerProfiles,
    current: room.archetypeProgress ?? {},
    step: room.history.length,
  });
  const directed = applyNarrativeDirector({
    roomCode: room.code,
    scene: nextScene,
    chaosLevel: room.chaosLevel,
    tensionLevel: room.tensionLevel,
    historyLength: room.history.length + 1,
    actorProfile: room.playerProfiles[playerId] ?? null,
    narrativeThreads: room.narrativeThreads,
    activeThreadId: room.activeThreadId,
    directorTimeline: room.directorTimeline,
  });
  room.narrativeThreads = directed.narrativeThreads;
  room.activeThreadId = directed.activeThreadId;
  room.directedScene = directed.directedScene;
  room.directorTimeline = directed.directorTimeline;
  if (directed.timelineEvents.length > 0) {
    room.worldState.timeline = [...room.worldState.timeline, ...directed.timelineEvents].slice(-60);
    room.latestWorldEvent = room.worldState.timeline.at(-1) ?? room.latestWorldEvent;
  }
  room.deferredCallbacks = scheduleDirectorCallbacks({
    roomCode: room.code,
    step: room.history.length,
    queue: room.deferredCallbacks ?? [],
    historyEntry,
    latestWorldEvent: room.latestWorldEvent,
    splitVoteConsequence: room.splitVoteConsequence,
  });

  if (nextScene.ending) {
    setRoomPhase(room, "recap");
    room.endingScene = nextScene;
    room.endingType = (nextScene.endingType ?? "doom") as EndingType;
    resetSceneReadiness(room);
    room.currentPlayerId = null;
    const recapMemory = resolveRealityRemembers({
      roomCode: room.code,
      step: room.history.length,
      currentPlayerId: playerId,
      players: room.players,
      playerProfiles: room.playerProfiles,
      queue: room.deferredCallbacks,
      history: room.history,
      worldState: room.worldState,
      splitVoteConsequence: room.splitVoteConsequence,
    });
    room.deferredCallbacks = recapMemory.queue;
    room.realityRemembersLine = recapMemory.line;
    const endingNarration = appendNarration(room, "ending", {
      sceneId: nextScene.id,
      playerId,
      endingType: room.endingType,
      tensionLevel: nextScene.tensionLevel ?? room.tensionLevel,
    });

    return {
      ended: true,
      endingScene: nextScene,
      endingType: room.endingType,
      history: room.history,
      riftEvent: room.activeRiftEvent,
      riftDecision: rift.decision,
      narration,
      endingNarration,
    };
  }

  room.activePlayerIndex = rotateToConnectedPlayer(room, room.activePlayerIndex);
  room.currentPlayerId = activePlayerId(room);
  resetSceneReadiness(room);
  const rememberLine = resolveRealityRemembers({
    roomCode: room.code,
    step: room.history.length,
    currentPlayerId: room.currentPlayerId,
    players: room.players,
    playerProfiles: room.playerProfiles,
    queue: room.deferredCallbacks,
    history: room.history,
    worldState: room.worldState,
    splitVoteConsequence: room.splitVoteConsequence,
  });
  room.deferredCallbacks = rememberLine.queue;
  room.realityRemembersLine = rememberLine.line;

  return {
    ended: false,
    nextScene,
    activePlayerId: activePlayerId(room),
    turnDeadline: room.turnDeadline,
    history: room.history,
    riftEvent: room.activeRiftEvent,
    riftDecision: rift.decision,
    narration,
  };
}

export function timeoutChoice(code: string) {
  const room = ensureFreshRoom(code);
  if (room.sessionMode === "gm") {
    throw new Error("Classic timeout is disabled in GM mode");
  }
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }

  const playerId = activePlayerId(room);
  if (!playerId) {
    throw new Error("No active player");
  }

  return submitChoice(code, playerId, { timeout: true });
}

export function getRecapState(code: string) {
  const room = ensureFreshRoom(code);
  if (room.sessionMode === "gm" && room.gmState) {
    const gmState = room.gmState;
    const endingType = room.endingType ?? deriveGmEndingType(room.chaosLevel);
    const endingText =
      gmState.currentOutcomeText ??
      [...gmState.transcript]
        .reverse()
        .find((entry) => entry.phase === "consequence")
        ?.consequenceText ??
      "Reality settles for now, but the Rift keeps score.";
    const endingScene = room.endingScene ?? {
      id: "gm-ending",
      text: endingText,
      ending: true,
      endingType,
    };
    const history = room.history.length > 0 ? room.history : buildGmHistory(room, gmState);

    return {
      endingScene,
      endingType,
      history,
      mvp: computeGmMvp(room, gmState),
      genre: room.genre,
      storyTitle: getStoryTitle(room.genre),
      genrePower: room.genrePower,
      chaosLevel: room.chaosLevel,
      riftHistory: room.riftHistory,
      latestNarration: room.latestNarration ?? null,
      narrationLog: room.narrationLog ?? [],
      worldState: room.worldState,
      latestWorldEvent: room.latestWorldEvent,
      playerProfiles: room.playerProfiles,
      archetypeProgress: room.archetypeProgress,
      splitVoteConsequence: room.splitVoteConsequence,
      deferredCallbacks: room.deferredCallbacks,
      realityRemembersLine: room.realityRemembersLine,
      narrativeThreads: room.narrativeThreads,
      activeThreadId: room.activeThreadId,
      directedScene: room.directedScene,
      directorTimeline: room.directorTimeline,
      gmTranscript: gmState.transcript,
      sessionMode: room.sessionMode,
    };
  }

  if (room.phase !== "recap" || !room.endingScene || !room.endingType) {
    throw new Error("Recap is not ready");
  }

  return {
    endingScene: room.endingScene,
    endingType: room.endingType,
    history: room.history,
    mvp: computeMVP(room),
    genre: room.genre,
    storyTitle: getStoryTitle(room.genre),
    genrePower: room.genrePower,
    chaosLevel: room.chaosLevel,
    riftHistory: room.riftHistory,
    latestNarration: room.latestNarration ?? null,
    narrationLog: room.narrationLog ?? [],
    worldState: room.worldState,
    latestWorldEvent: room.latestWorldEvent,
    playerProfiles: room.playerProfiles,
    archetypeProgress: room.archetypeProgress,
    splitVoteConsequence: room.splitVoteConsequence,
    deferredCallbacks: room.deferredCallbacks,
    realityRemembersLine: room.realityRemembersLine,
    narrativeThreads: room.narrativeThreads,
    activeThreadId: room.activeThreadId,
    directedScene: room.directedScene,
    directorTimeline: room.directorTimeline,
    gmTranscript: room.gmState?.transcript ?? [],
    sessionMode: room.sessionMode,
  };
}

export function restartSession(code: string) {
  const room = ensureFreshRoom(code);
  setRoomPhase(room, "lobby");
  room.genre = null;
  room.storyId = null;
  room.currentSceneId = "start";
  room.currentNodeId = "start";
  room.tensionLevel = 1;
  room.history = [];
  room.genrePower = createInitialGenrePower(null);
  room.chaosLevel = 0;
  room.riftHistory = [];
  room.activeRiftEvent = null;
  room.splitVoteConsequence = null;
  room.deferredCallbacks = [];
  room.realityRemembersLine = null;
  room.latestWorldEvent = room.worldState.timeline.at(-1) ?? null;
  room.latestNarration = null;
  room.narrationLog = [];
  room.endingScene = null;
  room.endingType = null;
  room.worldState.meta.communityChoiceInfluence = Math.max(0, room.worldState.meta.communityChoiceInfluence - 1);
  room.narrativeThreads = room.narrativeThreads.map((thread) => ({
    ...thread,
    status: thread.status === "active" ? "dormant" : thread.status,
    metadata: {
      ...thread.metadata,
      scenesSinceMention: thread.metadata.scenesSinceMention + 1,
    },
  }));
  room.activeThreadId = null;
  room.directedScene = null;
  room.directorTimeline = [];
  room.gmState = room.sessionMode === "gm" ? createInitialGMState(room.players.find((player) => player.isHost)?.id ?? null) : null;
  room.turnOrder = room.players.map((player) => player.id);
  room.players = room.players.map((player, index) => ({
    ...player,
    score: 0,
    rounds: [],
    orderIndex: index,
    turnOrder: index,
  }));
  room.activePlayerIndex = 0;
  room.currentPlayerId = activePlayerId(room);
  room.archetypeProgress = syncArchetypeProgress({
    players: room.players,
    playerProfiles: room.playerProfiles,
    current: room.archetypeProgress ?? {},
    step: 0,
  });
  resetSceneReadiness(room);
  room.expiresAt = now() + ROOM_TTL_MS;

  return getRoomView(code);
}

export function registerSocket(socketId: string, code: string, playerId: string) {
  state.sockets.set(socketId, { code, playerId });
}

export function getSocketPlayer(socketId: string) {
  return state.sockets.get(socketId) ?? null;
}

export function removeSocket(socketId: string) {
  const mapping = state.sockets.get(socketId);
  state.sockets.delete(socketId);
  return mapping ?? null;
}

export function getPlayerByCodeAndId(code: string, playerId: string) {
  const room = ensureFreshRoom(code);
  return room.players.find((player) => player.id === playerId) ?? null;
}

export function getAvailableGenres(): Array<{ id: GenreId; name: string; icon: string }> {
  return [
    { id: "zombie", name: "Zombie Outbreak", icon: "z" },
    { id: "alien", name: "Alien Invasion", icon: "a" },
    { id: "haunted", name: "Haunted Manor", icon: "h" },
  ];
}
