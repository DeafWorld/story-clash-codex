export type GenreId = "zombie" | "alien" | "haunted";

export type EndingType = "triumph" | "survival" | "doom";

export type RoomPhase = "lobby" | "minigame" | "game" | "recap";

export interface Choice {
  id: string;
  text?: string;
  next?: string;
  label?: string;
  nextId?: string;
}

export interface Scene {
  id: string;
  text: string;
  tensionLevel?: number;
  choices?: Choice[];
  freeChoiceTargetId?: string;
  freeChoiceKeywords?: Record<string, string>;
  ending?: boolean;
  endingType?: EndingType;
}

export interface StoryTree {
  genre: GenreId;
  title: string;
  scenes: Scene[];
}

export interface Player {
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
}

export interface HistoryEntry {
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
}

export interface Room {
  code: string;
  players: Player[];
  storyId: GenreId | null;
  status: RoomPhase;
}

export interface StoryState {
  currentNodeId: string;
  history: HistoryEntry[];
  tensionLevel: number;
  currentPlayerId: string | null;
  storyId: GenreId | null;
}

export interface RoomState extends Room, StoryState {
  id: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  phase: RoomPhase;
  turnOrder: string[];
  activePlayerIndex: number;
  genre: GenreId | null;
  currentSceneId: string;
  turnDeadline: number | null;
  endingScene: Scene | null;
  endingType: EndingType | null;
}

export interface RoomView extends RoomState {
  storyTitle: string | null;
  currentScene: Scene | null;
  activePlayerId: string | null;
}

export interface MVP {
  player: string;
  reason: string;
}

export interface StoryChoiceNode {
  id: string;
  label: string;
  nextId: string;
}

export interface StoryNode {
  id: string;
  text: string;
  tensionLevel: number;
  choices: StoryChoiceNode[];
  freeChoiceTargetId?: string;
  freeChoiceKeywords?: Record<string, string>;
  ending?: boolean;
  endingType?: EndingType;
}
