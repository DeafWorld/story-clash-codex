export type GenreId = "zombie" | "alien" | "haunted";

export type EndingType = "triumph" | "survival" | "doom";

export type RoomPhase = "lobby" | "minigame" | "game" | "recap";

export type NarrationTone = "calm" | "uneasy" | "urgent" | "desperate" | "hopeful" | "grim";
export type NarrationTrigger = "scene_enter" | "choice_submitted" | "turn_timeout" | "ending";
export type RiftEventType = "genre_surge" | "scene_twist";

export interface NarrationLine {
  id: string;
  text: string;
  tone: NarrationTone;
  trigger: NarrationTrigger;
  roomCode: string;
  sceneId: string | null;
  playerId: string | null;
  tensionLevel: number;
  genre: GenreId | null;
  endingType: EndingType | null;
  createdAt: number;
}

export interface GenrePower {
  zombie: number;
  alien: number;
  haunted: number;
}

export interface RiftEventRecord {
  id: string;
  type: RiftEventType;
  title: string;
  description: string;
  sceneId: string;
  playerId: string | null;
  choiceId?: string | null;
  originalNextSceneId?: string | null;
  nextSceneId?: string | null;
  targetGenre?: GenreId | null;
  chaosLevel: number;
  createdAt: number;
}

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
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  activeRiftEvent: RiftEventRecord | null;
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
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

export interface RecapPayload {
  endingScene: Scene;
  endingType: EndingType;
  history: HistoryEntry[];
  mvp: MVP;
  genre: GenreId | null;
  storyTitle: string | null;
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
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
