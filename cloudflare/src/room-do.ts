import { containsProfanity, sanitizeDisplayName } from "./profanity";
import {
  getNextSceneIdFromChoice,
  getNextSceneIdFromFreeChoice,
  getScene,
  getStoryStartScene,
  getStoryTitle,
} from "./stories";
import type {
  ClientEnvelope,
  EndingType,
  GenreId,
  MVP,
  Player,
  RecapPayload,
  RoomState,
  RoomView,
  Scene,
  ServerEnvelope,
} from "./types";

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

const ROOM_TTL_MS = 30 * 60 * 1000;
const TURN_DURATION_MS = 30 * 1000;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const DISCONNECT_TIMEOUT_MS = 10_000;

const AVATARS = ["circle-cyan", "diamond-red", "hex-green", "triangle-blue", "square-gold", "ring-white"];

function now(): number {
  return Date.now();
}

function randomId(): string {
  return crypto.randomUUID();
}

function errorResponse(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

function parseEnvelope(input: string): ClientEnvelope | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.event !== "string") {
      return null;
    }
    return {
      event: candidate.event,
      data: candidate.data,
      id: typeof candidate.id === "string" ? candidate.id : undefined,
    };
  } catch {
    return null;
  }
}

function sceneChoiceLabel(scene: Scene, choiceId: string): string {
  const choice = scene.choices?.find((entry) => entry.id === choiceId) ?? scene.choices?.[0];
  return choice?.text ?? choice?.label ?? "Continue";
}

export class RoomDurableObject {
  private state: any;

  private env: any;

  private sockets = new Map<WebSocket, string>();

  private disconnectTimers = new Map<string, number>();

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/internal/create" && request.method === "POST") {
      return this.handleCreate(request);
    }
    if (path === "/internal/join" && request.method === "POST") {
      return this.handleJoin(request);
    }
    if (path === "/internal/room" && request.method === "GET") {
      return this.handleGetRoom();
    }
    if (path === "/internal/game" && request.method === "GET") {
      return this.handleGetRoom();
    }
    if (path === "/internal/recap" && request.method === "GET") {
      return this.handleGetRecap();
    }
    if (path === "/ws" && request.method === "GET") {
      return this.handleWebSocket(request);
    }

    return errorResponse("Not found", 404);
  }

  async alarm(): Promise<void> {
    const room = await this.getRoom();
    if (!room) {
      return;
    }

    if (this.isExpired(room)) {
      await this.expireRoom(room);
      return;
    }

    if (room.phase === "game" && room.turnDeadline && room.turnDeadline <= now()) {
      const timedOutPlayerId = this.activePlayerId(room);
      if (timedOutPlayerId) {
        const result = this.submitChoice(room, timedOutPlayerId, { timeout: true });
        await this.saveRoom(room);
        await this.broadcast("turn_timeout", {
          playerId: timedOutPlayerId,
          message: "Random choice made due to timeout.",
        });

        if (result.ended) {
          await this.broadcast("game_end", result);
          await this.broadcast("room_updated", this.getRoomView(room));
          return;
        }

        await this.broadcast("scene_update", this.getRoomView(room));
      }
    }

    await this.scheduleAlarm(room);
  }

  private async handleCreate(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string; code?: string };
    const name = sanitizeDisplayName(body?.name ?? "");
    const code = String(body?.code ?? "").toUpperCase().trim();
    if (!name) {
      return errorResponse("Display name is required", 400);
    }
    if (!/^[A-HJ-NP-Z]{4}$/.test(code)) {
      return errorResponse("Invalid room code", 400);
    }
    if (containsProfanity(name)) {
      return errorResponse("Name contains blocked language", 400);
    }

    const existing = await this.getRoom();
    if (existing && !this.isExpired(existing) && existing.active) {
      return errorResponse("Room already exists", 409);
    }

    const host = this.newPlayer(name, true, 0);
    const room: RoomState = {
      id: randomId(),
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

    await this.saveRoom(room);
    return Response.json(
      {
        code: room.code,
        roomId: room.id,
        playerId: host.id,
      },
      { status: 201 }
    );
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as { name?: string };
    const room = await this.requireFreshRoom();

    if (room.phase !== "lobby") {
      return errorResponse("Game in progress", 409);
    }
    if (room.players.length >= MAX_PLAYERS) {
      return errorResponse("Room is full", 409);
    }

    const requested = sanitizeDisplayName(body?.name ?? "");
    if (!requested) {
      return errorResponse("Display name is required", 400);
    }
    if (containsProfanity(requested)) {
      return errorResponse("Name contains blocked language", 400);
    }

    const name = this.uniqueName(room, requested);
    const player = this.newPlayer(name, false, room.players.length);
    room.players.push(player);
    room.turnOrder = room.players.map((entry) => entry.id);
    room.currentPlayerId = this.activePlayerId(room);
    room.expiresAt = now() + ROOM_TTL_MS;

    await this.saveRoom(room);

    return Response.json(
      {
        room: this.getRoomView(room),
        playerId: player.id,
      },
      { status: 200 }
    );
  }

  private async handleGetRoom(): Promise<Response> {
    const room = await this.requireFreshRoom();
    return Response.json(this.getRoomView(room));
  }

  private async handleGetRecap(): Promise<Response> {
    const room = await this.requireFreshRoom();
    if (room.phase !== "recap" || !room.endingScene || !room.endingType) {
      return errorResponse("Recap is not ready", 404);
    }
    return Response.json(this.getRecapState(room));
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return errorResponse("Expected WebSocket upgrade", 426);
    }

    const url = new URL(request.url);
    const requestedPlayerId = url.searchParams.get("playerId") ?? "";
    const room = await this.requireFreshRoom();
    const player = room.players.find((entry) => entry.id === requestedPlayerId);
    if (!player) {
      return errorResponse("Player not found", 404);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    this.bindSocket(server, requestedPlayerId);
    const wasConnected = player.connected ?? false;
    player.connected = true;
    this.ensureHostAssigned(room);
    await this.saveRoom(room);

    if (!wasConnected) {
      await this.broadcast("player_joined", {
        playerId: player.id,
        playerName: player.name,
      });
    }

    await this.broadcast("room_updated", this.getRoomView(room));
    this.emitToSocket(server, "reconnect_state", this.getRoomView(room));

    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  private bindSocket(socket: WebSocket, playerId: string) {
    this.sockets.set(socket, playerId);

    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(socket, typeof event.data === "string" ? event.data : "");
    });

    socket.addEventListener("close", () => {
      void this.handleSocketClose(socket);
    });

    socket.addEventListener("error", () => {
      void this.handleSocketClose(socket);
    });
  }

  private async handleSocketMessage(socket: WebSocket, raw: string) {
    const envelope = parseEnvelope(raw);
    if (!envelope) {
      this.emitToSocket(socket, "server_error", { message: "Invalid event envelope" });
      return;
    }

    const room = await this.requireFreshRoom();
    const socketPlayerId = this.sockets.get(socket) ?? "";
    const payload = (envelope.data ?? {}) as Record<string, unknown>;
    const payloadPlayerId = typeof payload.playerId === "string" ? payload.playerId : socketPlayerId;

    try {
      if (envelope.event === "join_room") {
        await this.handleJoinRoomEvent(socket, room, payloadPlayerId, envelope.id);
        return;
      }

      if (envelope.event === "leave_room") {
        await this.handleLeaveRoomEvent(room, payloadPlayerId, envelope.id);
        return;
      }

      if (envelope.event === "start_game") {
        const started = this.startGame(room, payloadPlayerId);
        await this.saveRoom(room);
        await this.broadcast("game_started", { code: room.code }, envelope.id);
        await this.broadcast("minigame_start", { startAt: started.startAt }, envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "minigame_score") {
        const round = Number(payload.round);
        const score = Number(payload.score);
        const result = this.recordMinigameScore(room, payloadPlayerId, round, score);
        await this.saveRoom(room);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        if (result.ready) {
          await this.broadcast("minigame_complete", { players: result.leaderboard }, envelope.id);
        }
        return;
      }

      if (envelope.event === "genre_selected") {
        const genre = String(payload.genre ?? "") as GenreId;
        const selection = this.selectGenre(room, payloadPlayerId, genre);
        await this.saveRoom(room);
        await this.broadcast(
          "genre_selected",
          {
            genre: selection.genre,
            genreName: this.getRoomView(room).storyTitle,
          },
          envelope.id
        );
        await this.broadcast("scene_update", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "submit_choice") {
        const choiceId = typeof payload.choiceId === "string" ? payload.choiceId : undefined;
        const freeText = typeof payload.freeText === "string" ? payload.freeText : undefined;
        const result = this.submitChoice(room, payloadPlayerId, { choiceId, freeText });
        await this.saveRoom(room);

        if (result.ended) {
          await this.broadcast("game_end", result, envelope.id);
          await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
          return;
        }

        await this.broadcast("scene_update", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "restart_session") {
        this.restartSession(room);
        await this.saveRoom(room);
        await this.broadcast("session_restarted", {}, envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      this.emitToSocket(socket, "server_error", { message: `Unknown event: ${envelope.event}` }, envelope.id);
    } catch (error) {
      this.emitToSocket(
        socket,
        "server_error",
        { message: error instanceof Error ? error.message : "Event failed" },
        envelope.id
      );
    }
  }

  private async handleSocketClose(socket: WebSocket) {
    const playerId = this.sockets.get(socket);
    this.sockets.delete(socket);
    if (!playerId) {
      return;
    }

    if (this.hasAnySocketForPlayer(playerId)) {
      return;
    }

    const room = await this.getRoom();
    if (!room || this.isExpired(room)) {
      return;
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }

    player.connected = false;
    this.ensureHostAssigned(room);
    await this.saveRoom(room);
    await this.broadcast("player_left", { playerId });
    await this.broadcast("room_updated", this.getRoomView(room));

    if (room.phase === "game" && room.currentPlayerId === playerId) {
      const existing = this.disconnectTimers.get(playerId);
      if (existing) {
        clearTimeout(existing);
      }
      const timeout = setTimeout(() => {
        void this.forceTimeoutIfDisconnected(playerId);
      }, DISCONNECT_TIMEOUT_MS) as unknown as number;
      this.disconnectTimers.set(playerId, timeout);
    }
  }

  private async forceTimeoutIfDisconnected(playerId: string) {
    this.disconnectTimers.delete(playerId);
    const room = await this.getRoom();
    if (!room || this.isExpired(room) || room.phase !== "game" || room.currentPlayerId !== playerId) {
      return;
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player || player.connected) {
      return;
    }

    const result = this.submitChoice(room, playerId, { timeout: true });
    await this.saveRoom(room);
    await this.broadcast("turn_timeout", {
      playerId,
      message: "Random choice made due to timeout.",
    });
    if (result.ended) {
      await this.broadcast("game_end", result);
      await this.broadcast("room_updated", this.getRoomView(room));
      return;
    }
    await this.broadcast("scene_update", this.getRoomView(room));
  }

  private async handleJoinRoomEvent(socket: WebSocket, room: RoomState, playerId: string, id?: string) {
    if (!playerId) {
      throw new Error("Missing player id");
    }
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const wasConnected = player.connected ?? false;
    player.connected = true;
    this.ensureHostAssigned(room);
    await this.saveRoom(room);
    this.sockets.set(socket, playerId);

    if (!wasConnected) {
      await this.broadcast("player_joined", { playerId, playerName: player.name }, id);
    }
    await this.broadcast("room_updated", this.getRoomView(room), id);
    this.emitToSocket(socket, "reconnect_state", this.getRoomView(room), id);
  }

  private async handleLeaveRoomEvent(room: RoomState, playerId: string, id?: string) {
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    player.connected = false;
    this.ensureHostAssigned(room);
    await this.saveRoom(room);
    await this.broadcast("player_left", { playerId }, id);
    await this.broadcast("room_updated", this.getRoomView(room), id);
  }

  private async expireRoom(room: RoomState) {
    room.active = false;
    room.turnDeadline = null;
    await this.state.storage.put("room", room);
    await this.state.storage.deleteAlarm?.();
    this.sockets.forEach((_, socket) => {
      try {
        socket.close(1000, "Room expired");
      } catch {
        // ignore close errors
      }
    });
    this.sockets.clear();
  }

  private async getRoom(): Promise<RoomState | null> {
    const room = (await this.state.storage.get("room")) as RoomState | undefined;
    return room ?? null;
  }

  private async requireFreshRoom(): Promise<RoomState> {
    const room = await this.getRoom();
    if (!room || this.isExpired(room)) {
      throw new Error("Room not found");
    }

    room.phase = room.phase ?? room.status ?? "lobby";
    room.status = room.status ?? room.phase;
    room.storyId = room.storyId ?? room.genre ?? null;
    room.currentNodeId = room.currentNodeId ?? room.currentSceneId;
    room.currentPlayerId = room.currentPlayerId ?? this.activePlayerId(room);
    room.tensionLevel = room.tensionLevel ?? this.getCurrentScene(room)?.tensionLevel ?? 1;
    room.players = room.players.map((player, index) => ({
      ...player,
      orderIndex: player.orderIndex ?? player.turnOrder ?? index,
    }));

    return room;
  }

  private async saveRoom(room: RoomState): Promise<void> {
    room.expiresAt = now() + ROOM_TTL_MS;
    await this.state.storage.put("room", room);
    await this.scheduleAlarm(room);
  }

  private async scheduleAlarm(room: RoomState): Promise<void> {
    let alarmAt = room.expiresAt;
    if (room.phase === "game" && room.turnDeadline) {
      alarmAt = Math.min(alarmAt, room.turnDeadline + 120);
    }
    await this.state.storage.setAlarm(alarmAt);
  }

  private isExpired(room: RoomState): boolean {
    return !room.active || room.expiresAt < now();
  }

  private hasAnySocketForPlayer(playerId: string): boolean {
    for (const [, socketPlayerId] of this.sockets.entries()) {
      if (socketPlayerId === playerId) {
        return true;
      }
    }
    return false;
  }

  private setRoomPhase(room: RoomState, phase: RoomState["phase"]) {
    room.phase = phase;
    room.status = phase;
  }

  private uniqueName(room: RoomState, requestedName: string): string {
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

  private newPlayer(name: string, isHost: boolean, index: number): Player {
    return {
      id: randomId(),
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

  private ensureHostAssigned(room: RoomState) {
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

  private activePlayerId(room: RoomState): string | null {
    if (!room.turnOrder.length) {
      return null;
    }
    return room.turnOrder[room.activePlayerIndex] ?? null;
  }

  private rotateToConnectedPlayer(room: RoomState, fromIndex: number): number {
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

  private getCurrentScene(room: RoomState): Scene | null {
    if (!room.genre) {
      return null;
    }
    return getScene(room.genre, room.currentSceneId);
  }

  private getRoomView(room: RoomState): RoomView {
    return {
      ...room,
      storyTitle: getStoryTitle(room.genre),
      currentScene: this.getCurrentScene(room),
      activePlayerId: this.activePlayerId(room),
    };
  }

  private startGame(room: RoomState, hostPlayerId: string): { startAt: number } {
    const host = room.players.find((player) => player.isHost);
    if (!host || host.id !== hostPlayerId) {
      throw new Error("Only host can start the game");
    }
    if (room.players.length < MIN_PLAYERS) {
      throw new Error("Need 3+ players");
    }

    this.setRoomPhase(room, "minigame");
    room.players.forEach((player) => {
      player.score = 0;
      player.rounds = [];
    });
    room.currentPlayerId = this.activePlayerId(room);
    room.turnDeadline = null;
    return { startAt: now() + 1200 };
  }

  private recordMinigameScore(room: RoomState, playerId: string, round: number, score: number) {
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
      return { ready: false, leaderboard: [] as Player[] };
    }

    const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
    room.turnOrder = leaderboard.map((entry) => entry.id);
    room.players = room.players.map((entry) => ({
      ...entry,
      orderIndex: room.turnOrder.indexOf(entry.id),
      turnOrder: room.turnOrder.indexOf(entry.id),
    }));
    room.activePlayerIndex = 0;
    room.currentPlayerId = this.activePlayerId(room);

    return { ready: true, leaderboard };
  }

  private selectGenre(room: RoomState, playerId: string, genre: GenreId) {
    if (room.phase !== "minigame") {
      throw new Error("Minigame not complete");
    }
    if (!["zombie", "alien", "haunted"].includes(genre)) {
      throw new Error("Invalid genre");
    }
    if (room.turnOrder[0] !== playerId) {
      throw new Error("Only Story Master can choose a genre");
    }

    room.genre = genre;
    room.storyId = genre;
    this.setRoomPhase(room, "game");
    room.history = [];
    room.endingScene = null;
    room.endingType = null;
    room.activePlayerIndex = 0;

    const startScene = getStoryStartScene(genre);
    room.currentSceneId = startScene.id;
    room.currentNodeId = startScene.id;
    room.turnDeadline = now() + TURN_DURATION_MS;
    room.tensionLevel = startScene.tensionLevel ?? 1;
    room.currentPlayerId = this.activePlayerId(room);

    return {
      genre,
      scene: startScene,
      activePlayerId: room.currentPlayerId,
      turnDeadline: room.turnDeadline,
    };
  }

  private submitChoice(
    room: RoomState,
    playerId: string,
    payload: { choiceId?: string; freeText?: string; timeout?: boolean }
  ) {
    if (room.phase !== "game") {
      throw new Error("Game is not active");
    }

    const activeId = this.activePlayerId(room);
    if (!activeId || activeId !== playerId) {
      throw new Error("Not your turn");
    }

    const scene = this.getCurrentScene(room);
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
      nextSceneId = getNextSceneIdFromFreeChoice(scene, resolvedChoiceText) ?? nextSceneId;
    } else if (payload.timeout) {
      const randomChoice = scene.choices[Math.floor(Math.random() * scene.choices.length)] ?? defaultChoice;
      nextSceneId = randomChoice.next ?? randomChoice.nextId;
      resolvedChoiceText = randomChoice.text ?? randomChoice.label ?? resolvedChoiceText;
    } else if (payload.choiceId) {
      const selectedId = getNextSceneIdFromChoice(scene, payload.choiceId);
      if (selectedId) {
        nextSceneId = selectedId;
        resolvedChoiceText = sceneChoiceLabel(scene, payload.choiceId);
      }
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    if (!room.genre) {
      throw new Error("Genre is not selected");
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

    const nextScene = getScene(room.genre, nextSceneId);
    if (!nextScene) {
      throw new Error("Next scene not found");
    }

    room.currentSceneId = nextScene.id;
    room.currentNodeId = nextScene.id;
    room.tensionLevel = nextScene.tensionLevel ?? 1;
    room.currentPlayerId = this.activePlayerId(room);

    if (nextScene.ending) {
      this.setRoomPhase(room, "recap");
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

    room.activePlayerIndex = this.rotateToConnectedPlayer(room, room.activePlayerIndex);
    room.currentPlayerId = this.activePlayerId(room);
    room.turnDeadline = now() + TURN_DURATION_MS;

    return {
      ended: false,
      nextScene,
      activePlayerId: room.currentPlayerId,
      turnDeadline: room.turnDeadline,
      history: room.history,
    };
  }

  private restartSession(room: RoomState) {
    this.setRoomPhase(room, "lobby");
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
    room.currentPlayerId = this.activePlayerId(room);
    room.turnDeadline = null;
  }

  private computeMVP(room: RoomState): MVP {
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

  private getRecapState(room: RoomState): RecapPayload {
    if (!room.endingScene || !room.endingType) {
      throw new Error("Recap is not ready");
    }
    return {
      endingScene: room.endingScene,
      endingType: room.endingType,
      history: room.history,
      mvp: this.computeMVP(room),
      genre: room.genre,
      storyTitle: getStoryTitle(room.genre),
    };
  }

  private async broadcast(event: string, data?: unknown, id?: string) {
    const envelope: ServerEnvelope = { event, data, id };
    const serialized = JSON.stringify(envelope);
    this.sockets.forEach((_, socket) => {
      try {
        socket.send(serialized);
      } catch {
        // stale socket; will clear on close
      }
    });
  }

  private emitToSocket(socket: WebSocket, event: string, data?: unknown, id?: string) {
    const envelope: ServerEnvelope = { event, data, id };
    try {
      socket.send(JSON.stringify(envelope));
    } catch {
      // ignore send errors
    }
  }
}
