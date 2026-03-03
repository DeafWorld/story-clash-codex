import { containsProfanity, sanitizeDisplayName } from "./profanity";
import { generateNarrationLine } from "./narrator";
import { applyNarrativeDirector, defaultMotionCue } from "./narrative-director";
import {
  appendWorldEvent,
  applyGenrePowerShift,
  computeChaosLevel,
  createInitialGenrePower,
  deriveChoiceGenreShift,
  deriveRecentTensionDelta,
  deriveVoteSplitSeverity,
  evaluateRiftEvent,
  scenesSinceLastRift,
  toWorldEventFromRift,
} from "./rift";
import {
  getNextSceneIdFromChoice,
  getScene,
  getStoryStartScene,
  getStoryTitle,
} from "./stories";
import {
  PROTOCOL_VERSION,
  SERVER_CAPABILITIES,
  SNAPSHOT_VERSION,
  isSupportedProtocolVersion,
  type ClientHelloPayload,
  type ServerHelloPayload,
} from "../../protocol/protocol-version";
import { deterministicTieBreakChoice, stableHash } from "../../protocol/deterministic-lock";
import type {
  ClientEnvelope,
  EndingType,
  GMChoice,
  GMSessionState,
  GMTranscriptEntry,
  GenreId,
  MinigameOutcome,
  MVP,
  NarrationLine,
  NarrativeThread,
  Player,
  RecapPayload,
  RoomState,
  RoomView,
  Scene,
  ServerEnvelope,
  StoryBeat,
} from "./types";

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

const ROOM_TTL_MS = 30 * 60 * 1000;
const TURN_DURATION_MS = 30 * 1000;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const MAX_NARRATION_LOG = 30;
const MAX_RIFT_HISTORY = 40;
const MAX_DIRECTOR_TIMELINE = 40;
const MAX_GM_BEAT_HISTORY = 40;
const MAX_GM_TRANSCRIPT = 120;
const DISCONNECT_TIMEOUT_MS = 10_000;
const workerBuildId = "cloudflare-worker";

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

function logRiftEvent(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })
  );
}

function createInitialWorldState(): RoomState["worldState"] {
  return {
    factions: {
      survivors: {
        loyalty: 50,
        power: 30,
        leader: null,
        traits: ["desperate", "paranoid"],
        relationships: {
          scientists: -20,
          military: 15,
        },
      },
      scientists: {
        loyalty: 70,
        power: 40,
        leader: "Dr. Chen",
        traits: ["rational", "secretive"],
        relationships: {
          survivors: -20,
          military: 30,
        },
      },
      military: {
        loyalty: 80,
        power: 60,
        leader: "Commander Shaw",
        traits: ["authoritarian", "pragmatic"],
        relationships: {
          survivors: 15,
          scientists: 30,
        },
      },
    },
    resources: {
      food: { amount: 45, trend: "declining", crisisPoint: 20 },
      medicine: { amount: 30, trend: "stable", crisisPoint: 15 },
      ammunition: { amount: 60, trend: "declining", crisisPoint: 25 },
      fuel: { amount: 20, trend: "critical", crisisPoint: 10 },
    },
    scars: [],
    tensions: {
      food_shortage: 0,
      faction_conflict: 0,
      external_threat: 0,
      morale_crisis: 0,
      disease_outbreak: 0,
    },
    timeline: [],
    meta: {
      gamesPlayed: 0,
      mostCommonEnding: null,
      rarePath: false,
      communityChoiceInfluence: 0,
    },
  };
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

function sanitizeFreeformInput(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const withoutControls = withoutTags.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, 200);
}

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

export class RoomDurableObject {
  private state: any;

  private env: any;

  private sockets = new Map<WebSocket, string>();

  private disconnectTimers = new Map<string, number>();

  private gmSnapshotTicks = new Map<string, number>();

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  private nextSnapshotTick(roomCode: string): number {
    const next = (this.gmSnapshotTicks.get(roomCode) ?? 0) + 1;
    this.gmSnapshotTicks.set(roomCode, next);
    return next;
  }

  private gmStateUpdatePayload(roomCode: string, gmState: GMSessionState) {
    return {
      roomCode,
      gmState,
      snapshotVersion: SNAPSHOT_VERSION,
      serverTimeMs: now(),
      tick: this.nextSnapshotTick(roomCode),
    };
  }

  private serverHelloPayload(accepted: boolean, reason?: string): ServerHelloPayload {
    return {
      accepted,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: [...SERVER_CAPABILITIES],
      snapshotVersion: SNAPSHOT_VERSION,
      serverTimeMs: now(),
      buildId: this.env.WORKER_BUILD_ID?.toString?.() || workerBuildId,
      ...(reason ? { reason } : {}),
    };
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

    if (room.phase === "game" && room.choicesOpen && room.turnDeadline && room.turnDeadline <= now()) {
      if (room.sessionMode === "gm" && room.gmState) {
        const locked = this.lockGMVoteIfDue(room, true);
        await this.saveRoom(room);
        if (locked.locked) {
          await this.broadcast("vote_locked", { roomCode: room.code, gmState: locked.gmState });
          await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, locked.gmState));
          await this.broadcast("room_updated", this.getRoomView(room));
        }
      } else {
        const timedOutPlayerId = this.activePlayerId(room);
        if (!timedOutPlayerId) {
          await this.scheduleAlarm(room);
          return;
        }
        const result = this.submitChoice(room, timedOutPlayerId, { timeout: true });
        await this.saveRoom(room);
        if (result.narration) {
          await this.broadcast("narrator_update", { line: result.narration, roomCode: room.code });
        }
        await this.broadcast("turn_timeout", {
          playerId: timedOutPlayerId,
          message: "Random choice made due to timeout.",
        });

        if (result.ended) {
          if (result.endingNarration) {
            await this.broadcast("narrator_update", { line: result.endingNarration, roomCode: room.code });
          }
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
      narrativeThreads: [],
      activeThreadId: null,
      directedScene: null,
      directorTimeline: [],
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
        sessionMode: room.sessionMode,
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
    const gmRecapReady = room.sessionMode === "gm" && (room.gmState?.transcript.length ?? 0) > 0;
    if (!gmRecapReady && (room.phase !== "recap" || !room.endingScene || !room.endingType)) {
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
    const server = pair[1] as WebSocket & { accept: () => void };
    server.accept();

    this.bindSocket(server, requestedPlayerId);
    this.emitToSocket(server, "server_hello", this.serverHelloPayload(true));
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
    const claimedPlayerId = typeof payload.playerId === "string" ? payload.playerId : socketPlayerId;
    if (socketPlayerId && claimedPlayerId && claimedPlayerId !== socketPlayerId) {
      throw new Error("Invalid player session");
    }
    const actorPlayerId = socketPlayerId || claimedPlayerId;

    try {
      if (envelope.event === "client_hello") {
        const hello = (payload ?? {}) as Partial<ClientHelloPayload>;
        const protocolVersion = typeof hello.protocolVersion === "string" ? hello.protocolVersion : "";
        const accepted = isSupportedProtocolVersion(protocolVersion);
        const reason = accepted
          ? undefined
          : `Unsupported protocol version ${protocolVersion || "unknown"}. Expected ${PROTOCOL_VERSION}.`;
        this.emitToSocket(socket, "server_hello", this.serverHelloPayload(accepted, reason), envelope.id);
        if (!accepted && reason) {
          this.emitToSocket(socket, "server_error", { message: reason }, envelope.id);
        }
        return;
      }

      if (envelope.event === "join_room") {
        await this.handleJoinRoomEvent(socket, room, actorPlayerId, envelope.id);
        return;
      }

      if (envelope.event === "leave_room") {
        await this.handleLeaveRoomEvent(room, actorPlayerId, envelope.id);
        return;
      }

      if (envelope.event === "start_game") {
        const started = this.startGame(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("game_started", { code: room.code }, envelope.id);
        await this.broadcast("minigame_start", { startAt: started.startAt }, envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "minigame_score") {
        const round = Number(payload.round);
        const score = Number(payload.score);
        const result = this.recordMinigameScore(room, actorPlayerId, round, score);
        await this.saveRoom(room);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        if (result.ready) {
          // Host can now trigger authoritative wheel resolution with `minigame_spin`.
        }
        return;
      }

      if (envelope.event === "minigame_spin") {
        const result = this.resolveMinigameSpin(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        await this.broadcast("minigame_complete", { players: result.leaderboard, outcome: result.outcome }, envelope.id);
        return;
      }

      if (envelope.event === "genre_selected") {
        const genre = String(payload.genre ?? "") as GenreId;
        const selection = this.selectGenre(room, actorPlayerId, genre);
        await this.saveRoom(room);
        await this.broadcast(
          "genre_selected",
          {
            genre: selection.genre,
            genreName: this.getRoomView(room).storyTitle,
          },
          envelope.id
        );
        if (selection.narration) {
          await this.broadcast("narrator_update", { line: selection.narration, roomCode: room.code }, envelope.id);
        }
        await this.broadcast("scene_update", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "gm_publish_beat") {
        const result = this.publishGMBeat(room, actorPlayerId, {
          title: typeof payload.title === "string" ? payload.title : undefined,
          location: typeof payload.location === "string" ? payload.location : undefined,
          icon: typeof payload.icon === "string" ? payload.icon : undefined,
          rawText: typeof payload.rawText === "string" ? payload.rawText : "",
          visualBeats: Array.isArray(payload.visualBeats)
            ? payload.visualBeats
                .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
                .filter((entry): entry is Record<string, unknown> => Boolean(entry))
                .map((entry) => ({
                  type: String(entry.type ?? "text") as "text" | "dialogue" | "action" | "separator",
                  content: String(entry.content ?? ""),
                  speaker: typeof entry.speaker === "string" ? entry.speaker : undefined,
                  icon: typeof entry.icon === "string" ? entry.icon : undefined,
                }))
            : [],
          aiSource:
            payload.aiSource === "claude" || payload.aiSource === "local" || payload.aiSource === null
              ? (payload.aiSource as "claude" | "local" | null)
              : null,
        });
        await this.saveRoom(room);
        await this.broadcast("beat_published", { roomCode: room.code, beat: result.beat, gmState: result.gmState }, envelope.id);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "gm_mark_ready") {
        const result = this.markGMReady(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        if (result.opened) {
          await this.broadcast("choices_opened", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        }
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "player_mark_ready") {
        const result = this.markGMPlayerReady(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        if (result.opened) {
          await this.broadcast("choices_opened", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        }
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "gm_publish_choices") {
        const result = this.publishGMChoices(room, actorPlayerId, {
          choices: Array.isArray(payload.choices)
            ? payload.choices.map((entry) =>
                entry && typeof entry === "object" ? (entry as Partial<GMChoice>) : {}
              )
            : [],
          timeLimitSec: Number(payload.timeLimitSec),
        });
        await this.saveRoom(room);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        if (result.opened) {
          await this.broadcast("choices_opened", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        }
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "player_vote") {
        const choiceId = typeof payload.choiceId === "string" ? payload.choiceId : "";
        const result = this.submitGMVote(room, actorPlayerId, choiceId);
        await this.saveRoom(room);
        await this.broadcast("vote_update", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        if (result.locked) {
          await this.broadcast("vote_locked", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        }
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "player_freeform") {
        const text = typeof payload.text === "string" ? payload.text : "";
        const result = this.submitGMFreeform(room, actorPlayerId, text);
        await this.saveRoom(room);
        await this.broadcast("vote_update", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        return;
      }

      if (envelope.event === "gm_publish_consequence") {
        const text = typeof payload.text === "string" ? payload.text : "";
        const result = this.publishGMConsequence(room, actorPlayerId, text);
        await this.saveRoom(room);
        await this.broadcast("consequence_published", { roomCode: room.code, gmState: result.gmState }, envelope.id);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "gm_next_beat") {
        const result = this.advanceGMBeat(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, result.gmState), envelope.id);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        return;
      }

      if (envelope.event === "scene_ready") {
        const result = this.markSceneReady(room, actorPlayerId);
        await this.saveRoom(room);
        await this.broadcast("room_updated", this.getRoomView(room), envelope.id);
        if (result.justOpened) {
          await this.broadcast("scene_update", this.getRoomView(room), envelope.id);
        }
        return;
      }

      if (envelope.event === "submit_choice") {
        const choiceId = typeof payload.choiceId === "string" ? payload.choiceId : undefined;
        const result = this.submitChoice(room, actorPlayerId, { choiceId });
        await this.saveRoom(room);
        if (result.narration) {
          await this.broadcast("narrator_update", { line: result.narration, roomCode: room.code }, envelope.id);
        }

        if (result.ended) {
          if (result.endingNarration) {
            await this.broadcast("narrator_update", { line: result.endingNarration, roomCode: room.code }, envelope.id);
          }
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
    if (room.phase === "game" && !room.choicesOpen) {
      if (room.sessionMode === "gm") {
        this.recomputeGMReadyState(room);
        this.maybeOpenGMVoting(room);
      } else {
        this.maybeUnlockChoices(room);
      }
    }
    this.ensureHostAssigned(room);
    await this.saveRoom(room);
    await this.broadcast("player_left", { playerId });
    await this.broadcast("room_updated", this.getRoomView(room));
    if (room.choicesOpen) {
      await this.broadcast("scene_update", this.getRoomView(room));
    }

    if (room.phase === "game" && room.currentPlayerId === playerId && room.choicesOpen && room.turnDeadline) {
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
    if (!room || this.isExpired(room) || room.phase !== "game" || !room.choicesOpen || !room.turnDeadline || room.currentPlayerId !== playerId) {
      return;
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player || player.connected) {
      return;
    }

    if (room.sessionMode === "gm" && room.gmState) {
      const locked = this.lockGMVoteIfDue(room, true);
      await this.saveRoom(room);
      if (locked.locked) {
        await this.broadcast("vote_locked", { roomCode: room.code, gmState: locked.gmState });
        await this.broadcast("gm_state_update", this.gmStateUpdatePayload(room.code, locked.gmState));
        await this.broadcast("room_updated", this.getRoomView(room));
      }
      return;
    }

    const result = this.submitChoice(room, playerId, { timeout: true });
    await this.saveRoom(room);
    if (result.narration) {
      await this.broadcast("narrator_update", { line: result.narration, roomCode: room.code });
    }
    await this.broadcast("turn_timeout", {
      playerId,
      message: "Random choice made due to timeout.",
    });
    if (result.ended) {
      if (result.endingNarration) {
        await this.broadcast("narrator_update", { line: result.endingNarration, roomCode: room.code });
      }
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
    if (room.phase === "game" && !room.choicesOpen) {
      if (room.sessionMode === "gm") {
        this.recomputeGMReadyState(room);
        this.maybeOpenGMVoting(room);
      } else {
        this.maybeUnlockChoices(room);
      }
    }
    this.ensureHostAssigned(room);
    await this.saveRoom(room);
    await this.broadcast("player_left", { playerId }, id);
    await this.broadcast("room_updated", this.getRoomView(room), id);
    if (room.choicesOpen) {
      await this.broadcast("scene_update", this.getRoomView(room), id);
    }
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
    room.sessionMode = room.sessionMode ?? "classic";
    if (room.sessionMode === "gm") {
      room.gmState = room.gmState ?? createInitialGMState(room.players.find((player) => player.isHost)?.id ?? null);
    } else {
      room.gmState = null;
    }
    room.storyId = room.storyId ?? room.genre ?? null;
    room.currentNodeId = room.currentNodeId ?? room.currentSceneId;
    room.currentPlayerId = room.currentPlayerId ?? this.activePlayerId(room);
    room.tensionLevel = room.tensionLevel ?? this.getCurrentScene(room)?.tensionLevel ?? 1;
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
    room.narrativeThreads = room.narrativeThreads ?? [];
    room.activeThreadId = room.activeThreadId ?? null;
    room.directorTimeline = (room.directorTimeline ?? []).slice(-MAX_DIRECTOR_TIMELINE);
    room.directedScene = room.directedScene ?? null;
    room.players = room.players.map((player, index) => ({
      ...player,
      orderIndex: player.orderIndex ?? player.turnOrder ?? index,
    }));
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
      room.gmState.readyState = room.gmState.readyState ?? {
        readyPlayerIds: [],
        readyGm: false,
        requiredReadyIds: [],
        allReady: false,
      };
      room.gmState.voteState = room.gmState.voteState ?? {
        votesByPlayerId: {},
        countsByChoiceId: {},
        freeformByPlayerId: {},
        lockedChoiceId: null,
        openedAt: null,
        deadlineAt: null,
      };
      this.recomputeGMReadyState(room);
    }
    room.sceneReadyPlayerIds = this.normalizeSceneReadyPlayerIds(room);
    if (room.phase === "game") {
      const legacyChoicesOpen = (room as { choicesOpen?: boolean }).choicesOpen;
      if (room.turnDeadline && typeof legacyChoicesOpen !== "boolean") {
        room.choicesOpen = true;
        room.sceneReadyPlayerIds = this.connectedPlayerIds(room);
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
    if (!room.directedScene) {
      const scene = this.getCurrentScene(room);
      if (scene) {
        room.directedScene = {
          sceneId: scene.id,
          baseText: scene.text,
          renderedText: scene.text,
          beatType: "setup",
          pressureBand: "calm",
          intensity: 20,
          activeThreadId: room.activeThreadId,
          payoffThreadId: null,
          motionCue: defaultMotionCue(),
          updatedAt: now(),
        };
      }
    }

    return room;
  }

  private async saveRoom(room: RoomState): Promise<void> {
    room.expiresAt = now() + ROOM_TTL_MS;
    await this.state.storage.put("room", room);
    await this.scheduleAlarm(room);
  }

  private async scheduleAlarm(room: RoomState): Promise<void> {
    let alarmAt = room.expiresAt;
    if (room.phase === "game" && room.choicesOpen && room.turnDeadline) {
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

  private playersByJoinOrder(room: RoomState): Player[] {
    return [...room.players].sort((a, b) => {
      const orderA = a.orderIndex ?? a.turnOrder ?? 0;
      const orderB = b.orderIndex ?? b.turnOrder ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.id.localeCompare(b.id);
    });
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
    if (room.sessionMode === "gm" && room.gmState) {
      room.gmState.gmPlayerId = nextHost?.id ?? room.gmState.gmPlayerId;
      this.recomputeGMReadyState(room);
    }
  }

  private activePlayerId(room: RoomState): string | null {
    if (!room.turnOrder.length) {
      return null;
    }
    return room.turnOrder[room.activePlayerIndex] ?? null;
  }

  private connectedPlayerIds(room: RoomState): string[] {
    return room.players.filter((player) => player.connected !== false).map((player) => player.id);
  }

  private normalizeSceneReadyPlayerIds(room: RoomState): string[] {
    const validIds = new Set(room.players.map((player) => player.id));
    return [...new Set((room.sceneReadyPlayerIds ?? []).filter((playerId) => validIds.has(playerId)))];
  }

  private resetSceneReadiness(room: RoomState) {
    room.sceneReadyPlayerIds = [];
    room.choicesOpen = false;
    room.turnDeadline = null;
  }

  private recomputeGMReadyState(room: RoomState) {
    if (room.sessionMode !== "gm" || !room.gmState) {
      return;
    }
    const required = this.connectedPlayerIds(room).filter((id) => id !== room.gmState?.gmPlayerId);
    room.gmState.readyState.requiredReadyIds = required;
    room.gmState.readyState.readyPlayerIds = room.gmState.readyState.readyPlayerIds.filter((id) => required.includes(id));
    room.gmState.readyState.allReady =
      room.gmState.readyState.readyGm &&
      required.every((id) => room.gmState?.readyState.readyPlayerIds.includes(id));
  }

  private resetGMReadiness(room: RoomState) {
    if (room.sessionMode !== "gm" || !room.gmState) {
      return;
    }
    room.gmState.readyState.readyPlayerIds = [];
    room.gmState.readyState.readyGm = false;
    this.recomputeGMReadyState(room);
  }

  private resetGMVoting(room: RoomState) {
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

  private maybeOpenGMVoting(room: RoomState, timeLimitSec = 30): boolean {
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

  private lockGMVote(room: RoomState): boolean {
    if (room.sessionMode !== "gm" || !room.gmState) {
      return false;
    }
    const gmState = room.gmState;
    if (gmState.phase !== "voting_open") {
      return false;
    }
    const entries = Object.entries(gmState.voteState.countsByChoiceId);
    const maxVotes = entries.length ? Math.max(...entries.map(([, count]) => count)) : 0;
    const top = entries
      .filter(([, count]) => count === maxVotes)
      .map(([id]) => id)
      .sort((a, b) => a.localeCompare(b));
    let winner =
      deterministicTieBreakChoice({
        roomCode: room.code,
        beatIndex: gmState.beatIndex,
        topChoiceIds: top,
      }) ?? gmState.currentChoices[0]?.id ?? null;
    gmState.voteState.lockedChoiceId = winner;
    gmState.phase = "vote_locked";
    room.turnDeadline = null;
    room.choicesOpen = false;
    room.sceneReadyPlayerIds = [];
    const lockedChoice = gmState.currentChoices.find((choice) => choice.id === winner);
    const transcript: GMTranscriptEntry = {
      id: `gm-log-${randomId()}`,
      beatId: gmState.currentBeat?.id ?? `beat-${gmState.beatIndex}`,
      beatIndex: gmState.beatIndex,
      phase: "vote_lock",
      winningChoiceId: winner,
      winningChoiceLabel: lockedChoice?.label ?? null,
      voteCounts: { ...gmState.voteState.countsByChoiceId },
      freeform: Object.values(gmState.voteState.freeformByPlayerId),
      createdAt: now(),
    };
    gmState.transcript = [...gmState.transcript, transcript].slice(-MAX_GM_TRANSCRIPT);
    return true;
  }

  private maybeUnlockChoices(room: RoomState): boolean {
    if (room.phase !== "game" || room.choicesOpen) {
      return false;
    }

    const required = this.connectedPlayerIds(room);
    if (!required.length) {
      return false;
    }

    const ready = new Set(room.sceneReadyPlayerIds ?? []);
    const allReady = required.every((playerId) => ready.has(playerId));
    if (!allReady) {
      return false;
    }

    room.choicesOpen = true;
    room.turnDeadline = now() + TURN_DURATION_MS;
    return true;
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

  private appendNarration(
    room: RoomState,
    trigger: "scene_enter" | "choice_submitted" | "turn_timeout" | "ending",
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

  private bumpThreadAges(threads: NarrativeThread[]) {
    return threads.map((thread) => ({
      ...thread,
      metadata: {
        ...thread.metadata,
        scenesSinceMention: thread.metadata.scenesSinceMention + 1,
      },
    }));
  }

  private upsertThread(room: RoomState, input: { id: string; sceneId: string; detail: string; priority: number; clue?: string }) {
    const nowTs = now();
    const threads = this.bumpThreadAges(room.narrativeThreads ?? []);
    const existingIndex = threads.findIndex((thread) => thread.id === input.id);

    if (existingIndex >= 0) {
      const existing = threads[existingIndex];
      threads[existingIndex] = {
        ...existing,
        status: "active",
        priority: Math.max(existing.priority, input.priority),
        developments: [
          ...existing.developments,
          {
            sceneId: input.sceneId,
            detail: input.detail,
            timestamp: nowTs,
          },
        ].slice(-16),
        clues: input.clue ? [...existing.clues, input.clue].slice(-18) : existing.clues,
        playerAwareness: Math.min(100, existing.playerAwareness + 6),
        metadata: {
          ...existing.metadata,
          lastMention: nowTs,
          scenesSinceMention: 0,
        },
      };
      room.narrativeThreads = threads.slice(-40);
      return;
    }

    const created: NarrativeThread = {
      id: input.id,
      type: "conflict",
      priority: input.priority,
      status: "active",
      seeds: [
        {
          sceneId: input.sceneId,
          detail: input.detail,
          timestamp: nowTs,
        },
      ],
      developments: [],
      payoff: null,
      clues: input.clue ? [input.clue] : [],
      playerAwareness: 22,
      metadata: {
        created: nowTs,
        lastMention: nowTs,
        scenesSinceMention: 0,
      },
    };
    room.narrativeThreads = [...threads, created].slice(-40);
  }

  private deriveActiveThread(room: RoomState) {
    const active = (room.narrativeThreads ?? [])
      .filter((thread) => thread.status === "active")
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return right.metadata.scenesSinceMention - left.metadata.scenesSinceMention;
      });
    room.activeThreadId = active[0]?.id ?? null;
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
    this.resetSceneReadiness(room);
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
    return { ready, pick: decodeMinigamePick(rounded) };
  }

  private resolveMinigameSpin(room: RoomState, hostPlayerId: string): { leaderboard: Player[]; outcome: MinigameOutcome } {
    if (room.phase !== "minigame") {
      throw new Error("Minigame not active");
    }

    const host = room.players.find((player) => player.isHost);
    if (!host || host.id !== hostPlayerId) {
      throw new Error("Only host can spin the wheel");
    }

    const orderedPlayers = this.playersByJoinOrder(room);
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
    room.currentPlayerId = this.activePlayerId(room);

    return {
      leaderboard: room.turnOrder.map((id) => {
        const player = room.players.find((entry) => entry.id === id);
        if (!player) {
          throw new Error("Player not found");
        }
        return player;
      }),
      outcome: {
        winningGenre,
        contenders: contenders.map((player) => player.id),
        winnerId: winner.id,
        tieBreak: contenders.length > 1,
      },
    };
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
    room.genrePower = createInitialGenrePower(genre);
    room.chaosLevel = 0;
    room.riftHistory = [];
    room.activeRiftEvent = null;
    room.latestWorldEvent = null;
    room.directorTimeline = [];
    room.directedScene = null;
    room.gmState = room.sessionMode === "gm" ? createInitialGMState(room.players.find((player) => player.isHost)?.id ?? null) : null;
    room.endingScene = null;
    room.endingType = null;
    room.activePlayerIndex = 0;

    const startScene = getStoryStartScene(genre);
    room.currentSceneId = startScene.id;
    room.currentNodeId = startScene.id;
    this.resetSceneReadiness(room);
    room.tensionLevel = startScene.tensionLevel ?? 1;
    room.chaosLevel = computeChaosLevel({
      genrePower: room.genrePower,
      selectedGenre: room.genre,
      tensionLevel: room.tensionLevel,
    });
    room.currentPlayerId = this.activePlayerId(room);
    const narration = this.appendNarration(room, "scene_enter", {
      sceneId: startScene.id,
      playerId: room.currentPlayerId,
      tensionLevel: room.tensionLevel,
    });
    const directed = applyNarrativeDirector(room, startScene, room.history.length + 1);
    room.directedScene = directed.directedScene;
    room.directorTimeline = directed.directorTimeline;
    if (directed.timelineEvents.length > 0) {
      room.worldState.timeline = [...room.worldState.timeline, ...directed.timelineEvents].slice(-60);
      room.latestWorldEvent = room.worldState.timeline.at(-1) ?? room.latestWorldEvent;
    }
    if (room.sessionMode === "gm") {
      room.gmState = createInitialGMState(room.players.find((player) => player.isHost)?.id ?? playerId);
      this.recomputeGMReadyState(room);
    }

    return {
      genre,
      scene: startScene,
      activePlayerId: room.currentPlayerId,
      turnDeadline: room.turnDeadline,
      narration,
    };
  }

  private markSceneReady(room: RoomState, playerId: string) {
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
    const unlocked = this.maybeUnlockChoices(room);
    const required = this.connectedPlayerIds(room);

    return {
      activePlayerId: this.activePlayerId(room),
      readyCount: required.filter((id) => room.sceneReadyPlayerIds.includes(id)).length,
      totalCount: required.length,
      choicesOpen: room.choicesOpen,
      turnDeadline: room.turnDeadline,
      justOpened: !previouslyOpen && unlocked,
    };
  }

  private assertGMSession(room: RoomState): GMSessionState {
    if (room.sessionMode !== "gm" || !room.gmState) {
      throw new Error("Room is not in GM mode");
    }
    return room.gmState;
  }

  private assertGMControl(room: RoomState, playerId: string): GMSessionState {
    const gmState = this.assertGMSession(room);
    if (!gmState.gmPlayerId || gmState.gmPlayerId !== playerId) {
      throw new Error("Only GM can perform this action");
    }
    return gmState;
  }

  private publishGMBeat(room: RoomState, playerId: string, payload: {
    title?: string;
    location?: string;
    icon?: string;
    rawText: string;
    visualBeats: StoryBeat["visualBeats"];
    aiSource?: "claude" | "local" | null;
  }) {
    const gmState = this.assertGMControl(room, playerId);
    if (room.phase !== "game") {
      throw new Error("Game is not active");
    }
    const rawText = payload.rawText.trim();
    if (!rawText) {
      throw new Error("Beat text is required");
    }

    const beat: StoryBeat = {
      id: `beat-${randomId()}`,
      title: payload.title?.trim().slice(0, 42) || "Rift Beat",
      location: payload.location?.trim().slice(0, 42) || "Unknown Sector",
      icon: payload.icon?.trim().slice(0, 4) || "⚡",
      rawText: rawText.slice(0, 1600),
      visualBeats: payload.visualBeats.slice(0, 48),
      createdBy: playerId,
      createdAt: now(),
    };

    gmState.currentBeat = beat;
    gmState.currentChoices = [];
    gmState.currentOutcomeText = null;
    gmState.phase = "reading";
    gmState.aiSource = payload.aiSource ?? gmState.aiSource ?? null;
    gmState.beatHistory = [...gmState.beatHistory, beat].slice(-MAX_GM_BEAT_HISTORY);
    gmState.beatIndex += 1;
    this.resetGMReadiness(room);
    this.resetGMVoting(room);
    room.choicesOpen = false;
    room.turnDeadline = null;
    room.sceneReadyPlayerIds = [];

    const transcript: GMTranscriptEntry = {
      id: `gm-log-${randomId()}`,
      beatId: beat.id,
      beatIndex: gmState.beatIndex,
      phase: "beat",
      beatText: beat.rawText,
      createdAt: now(),
    };
    gmState.transcript = [...gmState.transcript, transcript].slice(-MAX_GM_TRANSCRIPT);
    return { gmState, beat };
  }

  private markGMReady(room: RoomState, playerId: string) {
    const gmState = this.assertGMControl(room, playerId);
    gmState.readyState.readyGm = true;
    this.recomputeGMReadyState(room);
    const opened = this.maybeOpenGMVoting(room);
    return { gmState, opened };
  }

  private markGMPlayerReady(room: RoomState, playerId: string) {
    const gmState = this.assertGMSession(room);
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    if (playerId === gmState.gmPlayerId) {
      throw new Error("GM should use gm_mark_ready");
    }
    const ready = new Set(gmState.readyState.readyPlayerIds);
    ready.add(playerId);
    gmState.readyState.readyPlayerIds = [...ready];
    this.recomputeGMReadyState(room);
    const opened = this.maybeOpenGMVoting(room);
    return { gmState, opened };
  }

  private publishGMChoices(room: RoomState, playerId: string, payload: {
    choices: Array<Partial<GMChoice>>;
    timeLimitSec?: number;
  }) {
    const gmState = this.assertGMControl(room, playerId);
    const choices: GMChoice[] = payload.choices
      .map((choice, index) => {
        const label = (choice.label ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
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
    if (choices.length < 2) {
      throw new Error("At least two choices are required");
    }

    gmState.currentChoices = choices;
    gmState.phase = "creating_choices";
    this.resetGMVoting(room);
    gmState.voteState.countsByChoiceId = Object.fromEntries(choices.map((choice) => [choice.id, 0]));
    const safeTimeLimit =
      typeof payload.timeLimitSec === "number" && Number.isFinite(payload.timeLimitSec)
        ? payload.timeLimitSec
        : 30;
    const opened = this.maybeOpenGMVoting(room, safeTimeLimit);
    return { gmState, opened };
  }

  private submitGMVote(room: RoomState, playerId: string, choiceId: string) {
    const gmState = this.assertGMSession(room);
    if (gmState.phase !== "voting_open") {
      throw new Error("Voting is not open");
    }
    if (playerId === gmState.gmPlayerId) {
      throw new Error("GM cannot vote in GM mode");
    }
    if (gmState.voteState.votesByPlayerId[playerId]) {
      throw new Error("Player already voted");
    }
    if (!gmState.currentChoices.some((choice) => choice.id === choiceId)) {
      throw new Error("Invalid choice");
    }
    gmState.voteState.votesByPlayerId[playerId] = choiceId;
    gmState.voteState.countsByChoiceId[choiceId] = (gmState.voteState.countsByChoiceId[choiceId] ?? 0) + 1;
    const total = this.connectedPlayerIds(room).filter((id) => id !== gmState.gmPlayerId).length;
    const voted = Object.keys(gmState.voteState.votesByPlayerId).length;
    const majorityThreshold = Math.floor(Math.max(1, total) / 2) + 1;
    const choiceVotes = gmState.voteState.countsByChoiceId[choiceId] ?? 0;
    const locked = choiceVotes >= majorityThreshold || voted >= total ? this.lockGMVote(room) : false;
    return { gmState, locked };
  }

  private submitGMFreeform(room: RoomState, playerId: string, text: string) {
    const gmState = this.assertGMSession(room);
    if (gmState.phase !== "voting_open") {
      throw new Error("Freeform is only available during voting");
    }
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    const sanitized = sanitizeFreeformInput(text);
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
    return { gmState };
  }

  private lockGMVoteIfDue(room: RoomState, force = false) {
    const gmState = this.assertGMSession(room);
    if (gmState.phase !== "voting_open") {
      return { gmState, locked: false };
    }
    const deadline = gmState.voteState.deadlineAt ?? 0;
    if (!force && (!deadline || deadline > now())) {
      return { gmState, locked: false };
    }
    const locked = this.lockGMVote(room);
    return { gmState, locked };
  }

  private publishGMConsequence(room: RoomState, playerId: string, text: string) {
    const gmState = this.assertGMControl(room, playerId);
    if (gmState.phase !== "vote_locked") {
      throw new Error("Vote must be locked before consequence");
    }
    const normalized = text.trim().slice(0, 2000);
    if (!normalized) {
      throw new Error("Consequence text is required");
    }
    gmState.currentOutcomeText = normalized;
    gmState.phase = "writing_consequence";
    const lockedChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId);
    gmState.transcript = [
      ...gmState.transcript,
      {
        id: `gm-log-${randomId()}`,
        beatId: gmState.currentBeat?.id ?? `beat-${gmState.beatIndex}`,
        beatIndex: gmState.beatIndex,
        phase: "consequence" as const,
        consequenceText: normalized,
        winningChoiceId: gmState.voteState.lockedChoiceId,
        winningChoiceLabel: lockedChoice?.label ?? null,
        createdAt: now(),
      },
    ].slice(-MAX_GM_TRANSCRIPT);
    return { gmState };
  }

  private advanceGMBeat(room: RoomState, playerId: string) {
    const gmState = this.assertGMControl(room, playerId);
    if (gmState.phase !== "writing_consequence") {
      throw new Error("Publish consequence before advancing");
    }
    gmState.phase = "writing_beat";
    gmState.currentBeat = null;
    gmState.currentChoices = [];
    gmState.currentOutcomeText = null;
    this.resetGMReadiness(room);
    this.resetGMVoting(room);
    room.turnDeadline = null;
    room.choicesOpen = false;
    room.sceneReadyPlayerIds = [];
    return { gmState };
  }

  private submitChoice(
    room: RoomState,
    playerId: string,
    payload: { choiceId?: string; timeout?: boolean }
  ) {
    if (room.sessionMode === "gm") {
      throw new Error("Classic submit_choice is disabled in GM mode");
    }
    if (room.phase !== "game") {
      throw new Error("Game is not active");
    }
    if (!room.choicesOpen || !room.turnDeadline) {
      throw new Error("Choices are locked until everyone is ready");
    }

    const activeId = this.activePlayerId(room);
    if (!activeId || activeId !== playerId) {
      throw new Error("Not your turn");
    }

    const scene = this.getCurrentScene(room);
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
      const selectedId = getNextSceneIdFromChoice(scene, payload.choiceId);
      if (!selectedId) {
        throw new Error("Choice not found");
      }
      nextSceneId = selectedId;
      resolvedChoiceText = sceneChoiceLabel(scene, payload.choiceId);
      selectedChoiceId = payload.choiceId;
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

    room.genrePower = applyGenrePowerShift(
      room.genrePower,
      deriveChoiceGenreShift({
        selectedGenre: room.genre,
        scene,
        choiceLabel: resolvedChoiceText,
        timeout: payload.timeout,
      })
    );
    room.chaosLevel = computeChaosLevel({
      genrePower: room.genrePower,
      selectedGenre: room.genre,
      tensionLevel: scene.tensionLevel ?? 1,
      timeout: payload.timeout,
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
      voteSplitSeverity: deriveVoteSplitSeverity({
        availableChoices: sceneChoices.length,
        recentChoiceTargets: room.history
          .slice(-4)
          .map((entry) => entry.nextNodeId)
          .filter((value): value is string => Boolean(value)),
        selectedNextSceneId: nextSceneId,
      }),
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
    if (rift.event) {
      room.riftHistory = [...room.riftHistory, rift.event].slice(-MAX_RIFT_HISTORY);
      const worldUpdate = appendWorldEvent(room.worldState.timeline, toWorldEventFromRift(rift.event), 60);
      room.worldState.timeline = worldUpdate.timeline;
      room.latestWorldEvent = worldUpdate.latest;
      this.upsertThread(room, {
        id: `thread-rift-${rift.event.type}`,
        sceneId: scene.id,
        detail: rift.event.description,
        priority: rift.event.type === "rift_reality_fracture" ? 9 : 7,
        clue: rift.event.title,
      });
    } else if (room.chaosLevel >= 58) {
      this.upsertThread(room, {
        id: "thread-rift-escalation",
        sceneId: scene.id,
        detail: "Rift pressure keeps compounding between choices.",
        priority: 6,
      });
    }
    logRiftEvent("rift.trigger_evaluated", {
      roomCode: room.code,
      step: room.history.length + 1,
      probability: rift.decision.probability,
      roll: rift.decision.roll,
      triggered: rift.decision.triggered,
      eventType: rift.event?.type ?? null,
      chaos: room.chaosLevel,
      genreLead: Math.max(room.genrePower.zombie, room.genrePower.alien, room.genrePower.haunted),
    });
    this.deriveActiveThread(room);

    room.history.push({
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
    });

    const narration = this.appendNarration(room, payload.timeout ? "turn_timeout" : "choice_submitted", {
      sceneId: scene.id,
      playerId,
      choiceLabel: resolvedChoiceText,
      tensionLevel: scene.tensionLevel ?? 1,
    });

    const nextScene = getScene(room.genre, nextSceneId);
    if (!nextScene) {
      throw new Error("Next scene not found");
    }

    room.currentSceneId = nextScene.id;
    room.currentNodeId = nextScene.id;
    room.tensionLevel = nextScene.tensionLevel ?? 1;
    room.currentPlayerId = this.activePlayerId(room);
    const directed = applyNarrativeDirector(room, nextScene, room.history.length + 1);
    room.directedScene = directed.directedScene;
    room.directorTimeline = directed.directorTimeline;
    if (directed.timelineEvents.length > 0) {
      room.worldState.timeline = [...room.worldState.timeline, ...directed.timelineEvents].slice(-60);
      room.latestWorldEvent = room.worldState.timeline.at(-1) ?? room.latestWorldEvent;
    }

    if (nextScene.ending) {
      this.setRoomPhase(room, "recap");
      room.endingScene = nextScene;
      room.endingType = (nextScene.endingType ?? "doom") as EndingType;
      this.resetSceneReadiness(room);
      room.currentPlayerId = null;
      const endingNarration = this.appendNarration(room, "ending", {
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

    room.activePlayerIndex = this.rotateToConnectedPlayer(room, room.activePlayerIndex);
    room.currentPlayerId = this.activePlayerId(room);
    this.resetSceneReadiness(room);

    return {
      ended: false,
      nextScene,
      activePlayerId: room.currentPlayerId,
      turnDeadline: room.turnDeadline,
      history: room.history,
      riftEvent: room.activeRiftEvent,
      riftDecision: rift.decision,
      narration,
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
    room.genrePower = createInitialGenrePower(null);
    room.chaosLevel = 0;
    room.riftHistory = [];
    room.activeRiftEvent = null;
    room.latestWorldEvent = room.worldState.timeline.at(-1) ?? null;
    room.latestNarration = null;
    room.narrationLog = [];
    room.narrativeThreads = [];
    room.activeThreadId = null;
    room.directorTimeline = [];
    room.directedScene = null;
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
    this.resetSceneReadiness(room);
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

  private deriveGmEndingType(chaosLevel: number): EndingType {
    if (chaosLevel >= 70) {
      return "doom";
    }
    if (chaosLevel >= 35) {
      return "survival";
    }
    return "triumph";
  }

  private buildGmHistory(room: RoomState, gmState: GMSessionState): RoomState["history"] {
    const beatsById = new Map(gmState.beatHistory.map((beat) => [beat.id, beat]));
    return gmState.transcript
      .filter((entry) => entry.phase === "vote_lock")
      .map((entry, index) => {
        const beat = beatsById.get(entry.beatId) ?? gmState.beatHistory[index] ?? null;
        const fallbackPlayer = room.players[index % Math.max(1, room.players.length)];
        const playerName = fallbackPlayer?.name ?? "Crew";
        return {
          sceneId: beat?.id ?? `gm-scene-${entry.beatIndex}`,
          sceneText: beat?.rawText ?? entry.beatText ?? "The scene shifted under Rift pressure.",
          playerId: fallbackPlayer?.id ?? "gm",
          player: playerName,
          playerName,
          choice: entry.winningChoiceLabel ?? "Continue",
          choiceLabel: entry.winningChoiceLabel ?? "Continue",
          isFreeChoice: false,
          nextNodeId: `gm-beat-${entry.beatIndex + 1}`,
          tensionLevel: Math.min(5, 1 + Math.floor(room.chaosLevel / 20)),
          timestamp: entry.createdAt,
        };
      });
  }

  private computeGmMvp(room: RoomState, gmState: GMSessionState): MVP {
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

  private getRecapState(room: RoomState): RecapPayload {
    if (room.sessionMode === "gm" && room.gmState) {
      const gmState = room.gmState;
      const endingType = room.endingType ?? this.deriveGmEndingType(room.chaosLevel);
      const endingScene = room.endingScene ?? {
        id: "gm-ending",
        text:
          gmState.currentOutcomeText ??
          [...gmState.transcript]
            .reverse()
            .find((entry) => entry.phase === "consequence")
            ?.consequenceText ??
          "Reality settles for now, but the Rift keeps score.",
        ending: true,
        endingType,
      };

      return {
        endingScene,
        endingType,
        history: room.history.length > 0 ? room.history : this.buildGmHistory(room, gmState),
        mvp: this.computeGmMvp(room, gmState),
        genre: room.genre,
        storyTitle: getStoryTitle(room.genre),
        genrePower: room.genrePower,
        chaosLevel: room.chaosLevel,
        riftHistory: room.riftHistory,
        latestNarration: room.latestNarration ?? null,
        narrationLog: room.narrationLog ?? [],
        worldState: room.worldState,
        latestWorldEvent: room.latestWorldEvent,
        narrativeThreads: room.narrativeThreads,
        activeThreadId: room.activeThreadId,
        directedScene: room.directedScene,
        directorTimeline: room.directorTimeline,
        gmTranscript: gmState.transcript,
        sessionMode: room.sessionMode,
      };
    }

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
      genrePower: room.genrePower,
      chaosLevel: room.chaosLevel,
      riftHistory: room.riftHistory,
      latestNarration: room.latestNarration ?? null,
      narrationLog: room.narrationLog ?? [],
      worldState: room.worldState,
      latestWorldEvent: room.latestWorldEvent,
      narrativeThreads: room.narrativeThreads,
      activeThreadId: room.activeThreadId,
      directedScene: room.directedScene,
      directorTimeline: room.directorTimeline,
      gmTranscript: room.gmState?.transcript ?? [],
      sessionMode: room.sessionMode,
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
