export type GenreId = "zombie" | "alien" | "haunted";
export type EndingType = "triumph" | "survival" | "doom";
export type RoomPhase = "lobby" | "minigame" | "game" | "recap";
export type NarrationTone = "calm" | "uneasy" | "urgent" | "desperate" | "hopeful" | "grim";
export type NarrationTrigger = "scene_enter" | "choice_submitted" | "turn_timeout" | "ending";
export type RiftEventType = "genre_surge" | "scene_twist";

export type MinigameOutcome = {
  winningGenre: GenreId;
  contenders: string[];
  winnerId: string;
  tieBreak: boolean;
};

export type NarrationLine = {
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
};

export type GenrePower = {
  zombie: number;
  alien: number;
  haunted: number;
};

export type RiftEventRecord = {
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
};

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
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  activeRiftEvent: RiftEventRecord | null;
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
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
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
};

export type NarratorUpdatePayload = {
  line: NarrationLine;
  roomCode: string;
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
