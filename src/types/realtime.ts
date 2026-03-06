import type {
  CapabilityFlag,
  ClientType,
  GMSessionState,
  NarrationLine,
  ProtocolVersion,
  SnapshotVersion,
  WorldEvent,
} from "./game";

export type ClientEventName =
  | "client_hello"
  | "join_room"
  | "leave_room"
  | "start_game"
  | "minigame_score"
  | "minigame_spin"
  | "genre_selected"
  | "scene_ready"
  | "submit_choice"
  | "restart_session"
  | "gm_publish_beat"
  | "gm_publish_choices"
  | "gm_mark_ready"
  | "player_mark_ready"
  | "player_vote"
  | "player_freeform"
  | "gm_publish_consequence"
  | "gm_next_beat";

export type ServerEventName =
  | "server_hello"
  | "room_updated"
  | "game_started"
  | "minigame_start"
  | "minigame_complete"
  | "genre_selected"
  | "narrator_update"
  | "scene_update"
  | "turn_timeout"
  | "turn_timer"
  | "game_end"
  | "reconnect_state"
  | "session_restarted"
  | "server_error"
  | "player_joined"
  | "player_left"
  | "gm_state_update"
  | "beat_published"
  | "choices_opened"
  | "vote_update"
  | "vote_locked"
  | "consequence_published";

export type RealtimeEventName = ClientEventName | ServerEventName | (string & {});

export type NarratorUpdatePayload = {
  line: NarrationLine;
  roomCode: string;
};

export type WorldEventPayload = {
  latestWorldEvent: WorldEvent | null;
  roomCode: string;
};

export type ServerEventPayloadMap = {
  server_hello: {
    accepted: boolean;
    protocolVersion: ProtocolVersion;
    capabilities: CapabilityFlag[];
    snapshotVersion: SnapshotVersion;
    serverTimeMs: number;
    buildId: string;
    reason?: string;
  };
  narrator_update: NarratorUpdatePayload;
  room_updated: WorldEventPayload;
  scene_update: WorldEventPayload;
  gm_state_update: {
    gmState: GMSessionState;
    roomCode: string;
    snapshotVersion: SnapshotVersion;
    serverTimeMs: number;
    tick: number;
  };
};

export type ClientEnvelope = {
  event: ClientEventName | (string & {});
  data?: unknown;
  id?: string;
};

export type ClientHelloPayload = {
  clientType: ClientType;
  protocolVersion: string;
  buildId: string;
};

export type ServerEnvelope = {
  event: ServerEventName | (string & {});
  data?: unknown;
  id?: string;
};

export function isServerEnvelope(value: unknown): value is ServerEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  return typeof maybe.event === "string";
}
