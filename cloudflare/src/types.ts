export type GenreId = "zombie" | "alien" | "haunted";
export type EndingType = "triumph" | "survival" | "doom";
export type RoomPhase = "lobby" | "minigame" | "game" | "recap";

export type Choice = {
  id: string;
  text?: string;
  next?: string;
  label?: string;
  nextId?: string;
};

export type Scene = {
  id: string;
  text: string;
  tensionLevel?: number;
  choices?: Choice[];
  freeChoiceTargetId?: string;
  freeChoiceKeywords?: Record<string, string>;
  ending?: boolean;
  endingType?: EndingType;
};

export type StoryTree = {
  genre: GenreId;
  title: string;
  scenes: Scene[];
};

export type Player = {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  orderIndex: number;
  avatar?: string;
  turnOrder?: number;
  connected?: boolean;
  rounds?: number[];
  joinedAt?: number;
};

export type HistoryEntry = {
  sceneId: string;
  sceneText: string;
  playerId: string;
  player: string;
  playerName?: string;
  choice: string;
  choiceLabel?: string;
  isFreeChoice: boolean;
  freeText?: string;
  nextNodeId?: string;
  tensionLevel?: number;
  timestamp: number;
};

export type RoomState = {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  status: RoomPhase;
  phase: RoomPhase;
  storyId: GenreId | null;
  players: Player[];
  turnOrder: string[];
  activePlayerIndex: number;
  currentPlayerId: string | null;
  genre: GenreId | null;
  currentNodeId: string;
  currentSceneId: string;
  tensionLevel: number;
  history: HistoryEntry[];
  turnDeadline: number | null;
  endingScene: Scene | null;
  endingType: EndingType | null;
};

export type RoomView = RoomState & {
  storyTitle: string | null;
  currentScene: Scene | null;
  activePlayerId: string | null;
};

export type MVP = {
  player: string;
  reason: string;
};

export type RecapPayload = {
  endingScene: Scene;
  endingType: EndingType;
  history: HistoryEntry[];
  mvp: MVP;
  genre: GenreId | null;
  storyTitle: string | null;
};

export type ClientEnvelope = {
  event: string;
  data?: unknown;
  id?: string;
};

export type ServerEnvelope = {
  event: string;
  data?: unknown;
  id?: string;
};
