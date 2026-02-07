import { nanoid } from "nanoid";
import { containsProfanity } from "./profanity";
import { sanitizeDisplayName } from "./profanity";
import { generateRoomCode, validateRoomCode } from "./room-code";
import { getScene, getStoryTitle } from "./stories";
import { mapFreeChoiceToPath } from "./story-utils";
import type {
  Choice,
  EndingType,
  GenreId,
  MVP,
  Player,
  RoomState,
  RoomView,
  Scene,
} from "../types/game";

const ROOM_TTL_MS = 30 * 60 * 1000;
const TURN_DURATION_MS = 30 * 1000;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;

const AVATARS = ["circle-cyan", "diamond-red", "hex-green", "triangle-blue", "square-gold", "ring-white"];

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
  room.storyId = room.storyId ?? room.genre ?? null;
  room.currentNodeId = room.currentNodeId ?? room.currentSceneId;
  room.currentPlayerId = room.currentPlayerId ?? activePlayerId(room);
  room.tensionLevel = room.tensionLevel ?? getCurrentScene(room)?.tensionLevel ?? 1;
  room.players = room.players.map((player, index) => ({
    ...player,
    orderIndex: player.orderIndex ?? player.turnOrder ?? index,
  }));

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

function ensureRoomCode(): string {
  for (let i = 0; i < 100; i += 1) {
    const code = generateRoomCode();
    if (!state.rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate room code");
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
  const room: RoomState = {
    id: nanoid(),
    code,
    createdAt: now(),
    expiresAt: now() + ROOM_TTL_MS,
    active: true,
    status: "lobby",
    phase: "lobby",
    storyId: null,
    players: [host],
    turnOrder: [host.id],
    activePlayerIndex: 0,
    currentPlayerId: host.id,
    genre: null,
    currentNodeId: "start",
    currentSceneId: "start",
    tensionLevel: 1,
    history: [],
    turnDeadline: null,
    endingScene: null,
    endingType: null,
  };

  state.rooms.set(code, room);

  return {
    code,
    roomId: room.id,
    playerId: host.id,
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
  room.currentPlayerId = activePlayerId(room);

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

  if (round < 1 || round > 3) {
    throw new Error("Invalid round");
  }

  const rounds = player.rounds ?? [];
  rounds[round - 1] = Math.max(0, Math.round(score));
  player.rounds = rounds;
  player.score = rounds.reduce((sum, value) => sum + value, 0);

  const completed = room.players.every(
    (entry) => (entry.rounds?.length ?? 0) >= 3 && (entry.rounds ?? []).every((value) => Number.isFinite(value))
  );

  if (!completed) {
    return {
      ready: false,
      leaderboard: [],
    };
  }

  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
  room.turnOrder = leaderboard.map((entry) => entry.id);
  room.players = room.players.map((entry) => ({
    ...entry,
    orderIndex: room.turnOrder.indexOf(entry.id),
    turnOrder: room.turnOrder.indexOf(entry.id),
  }));
  room.activePlayerIndex = 0;
  room.currentPlayerId = activePlayerId(room);

  return {
    ready: true,
    leaderboard,
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
  room.endingScene = null;
  room.endingType = null;
  room.activePlayerIndex = 0;
  room.turnDeadline = now() + TURN_DURATION_MS;

  const scene = getCurrentScene(room);
  if (!scene) {
    throw new Error("Story scene not found");
  }
  room.tensionLevel = scene.tensionLevel ?? 1;
  room.currentPlayerId = activePlayerId(room);

  return {
    genre,
    scene,
    activePlayerId: activePlayerId(room),
    turnDeadline: room.turnDeadline,
  };
}

export function getGameState(code: string): RoomView {
  return getRoomView(code);
}

export function submitChoice(
  code: string,
  playerId: string,
  payload: { choiceId?: string; freeText?: string; timeout?: boolean }
) {
  const room = ensureFreshRoom(code);
  if (room.phase !== "game") {
    throw new Error("Game is not active");
  }

  const activeId = activePlayerId(room);
  if (!activeId || activeId !== playerId) {
    throw new Error("Not your turn");
  }

  const scene = getCurrentScene(room);
  if (!scene || !scene.choices?.length) {
    throw new Error("Scene does not have choices");
  }

  const defaultChoice = scene.choices[0];
  let nextSceneId = defaultChoice.next ?? defaultChoice.nextId;
  let resolvedChoiceText = defaultChoice.text ?? defaultChoice.label ?? "Continue";
  let freeChoice = false;

  if (payload.freeText && payload.freeText.trim().length > 0) {
    if (containsProfanity(payload.freeText)) {
      throw new Error("Free choice contains blocked language");
    }
    freeChoice = true;
    resolvedChoiceText = payload.freeText.trim().slice(0, 60);
    nextSceneId = mapFreeChoiceToPath(resolvedChoiceText, scene.freeChoiceKeywords ?? { default: nextSceneId ?? "start" });
  } else if (payload.timeout) {
    const randomChoice = scene.choices[Math.floor(Math.random() * scene.choices.length)] ?? defaultChoice;
    nextSceneId = randomChoice.next ?? randomChoice.nextId;
    resolvedChoiceText = randomChoice.text ?? randomChoice.label ?? resolvedChoiceText;
  } else if (payload.choiceId) {
    const selected = getChoice(scene, payload.choiceId);
    if (selected) {
      nextSceneId = selected.next ?? selected.nextId;
      resolvedChoiceText = selected.text ?? selected.label ?? resolvedChoiceText;
    }
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found");
  }

  if (!nextSceneId) {
    throw new Error("Scene choice is missing a next node");
  }

  room.history.push({
    sceneId: scene.id,
    sceneText: scene.text,
    playerId,
    player: player.name,
    playerName: player.name,
    choice: resolvedChoiceText,
    choiceLabel: resolvedChoiceText,
    isFreeChoice: freeChoice,
    freeText: freeChoice ? resolvedChoiceText : undefined,
    nextNodeId: nextSceneId,
    tensionLevel: scene.tensionLevel ?? 1,
    timestamp: now(),
  });

  const genre = room.genre;
  if (!genre) {
    throw new Error("Genre is not selected");
  }

  const nextScene = getScene(genre, nextSceneId);
  if (!nextScene) {
    throw new Error("Next scene not found");
  }

  room.currentSceneId = nextScene.id;
  room.currentNodeId = nextScene.id;
  room.tensionLevel = nextScene.tensionLevel ?? 1;
  room.expiresAt = now() + ROOM_TTL_MS;

  if (nextScene.ending) {
    setRoomPhase(room, "recap");
    room.endingScene = nextScene;
    room.endingType = (nextScene.endingType ?? "doom") as EndingType;
    room.turnDeadline = null;
    room.currentPlayerId = null;

    return {
      ended: true,
      endingScene: nextScene,
      endingType: room.endingType,
      history: room.history,
    };
  }

  room.activePlayerIndex = rotateToConnectedPlayer(room, room.activePlayerIndex);
  room.currentPlayerId = activePlayerId(room);
  room.turnDeadline = now() + TURN_DURATION_MS;

  return {
    ended: false,
    nextScene,
    activePlayerId: activePlayerId(room),
    turnDeadline: room.turnDeadline,
    history: room.history,
  };
}

export function timeoutChoice(code: string) {
  const room = ensureFreshRoom(code);
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
  room.endingScene = null;
  room.endingType = null;
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
  room.turnDeadline = null;
  room.expiresAt = now() + ROOM_TTL_MS;

  return getRoomView(code);
}

export function registerSocket(socketId: string, code: string, playerId: string) {
  state.sockets.set(socketId, { code, playerId });
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
