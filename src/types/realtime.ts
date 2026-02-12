import type { NarrationLine } from "./game";

export type ClientEventName =
  | "join_room"
  | "leave_room"
  | "start_game"
  | "minigame_score"
  | "minigame_spin"
  | "genre_selected"
  | "submit_choice"
  | "restart_session";

export type ServerEventName =
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
  | "player_left";

export type RealtimeEventName = ClientEventName | ServerEventName | (string & {});

export type NarratorUpdatePayload = {
  line: NarrationLine;
  roomCode: string;
};

export type ServerEventPayloadMap = {
  narrator_update: NarratorUpdatePayload;
};

export type ClientEnvelope = {
  event: ClientEventName | (string & {});
  data?: unknown;
  id?: string;
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
