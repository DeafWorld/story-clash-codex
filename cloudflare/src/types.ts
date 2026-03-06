export type GenreId = "zombie" | "alien" | "haunted";
export type EndingType = "triumph" | "survival" | "doom";
export type RoomPhase = "lobby" | "minigame" | "game" | "recap";
export type SessionMode = "classic" | "gm";
export type GMPhase =
  | "writing_beat"
  | "reading"
  | "creating_choices"
  | "voting_open"
  | "vote_locked"
  | "writing_consequence"
  | "recap";
export type ProtocolVersion = "1.0.0";
export type SnapshotVersion = 1;
export type ClientType = "web" | "unity";
export type CapabilityFlag =
  | "gm_mode_v1"
  | "reconnect_snapshot_v1"
  | "vote_lock_deterministic_v1"
  | "freeform_v1";
export type NarrationTone = "calm" | "uneasy" | "urgent" | "desperate" | "hopeful" | "grim";
export type NarrationTrigger = "scene_enter" | "choice_submitted" | "turn_timeout" | "ending";
export type RiftEventType = "rift_genre_surge" | "rift_reality_fracture";
export type FactionId = "survivors" | "scientists" | "military";
export type ResourceId = "food" | "medicine" | "ammunition" | "fuel";
export type ResourceTrend = "stable" | "declining" | "critical";
export type WorldTensionId = "food_shortage" | "faction_conflict" | "external_threat" | "morale_crisis" | "disease_outbreak";
export type WorldEventType =
  | "resource_crisis"
  | "faction_conflict"
  | "tension_overflow"
  | "thread_seeded"
  | "thread_resolved"
  | "rift_genre_surge"
  | "rift_reality_fracture";
export type WorldEventSeverity = "low" | "medium" | "high" | "critical";
export type NarrativeThreadType = "mystery" | "conflict" | "relationship" | "quest" | "survival";
export type NarrativeThreadStatus = "active" | "resolved" | "abandoned" | "dormant";
export type DirectorBeatType = "setup" | "escalation" | "payoff" | "cooldown" | "fracture";
export type MotionIntensityBand = "calm" | "rising" | "critical";
export type TransitionStyle = "hard_cut" | "drift" | "surge";
export type EffectProfile = "rift_drift" | "shockwave" | "void_hum" | "cooldown_breath";

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

export type FactionState = {
  loyalty: number;
  power: number;
  leader: string | null;
  traits: string[];
  relationships: Partial<Record<FactionId, number>>;
};

export type ResourceState = {
  amount: number;
  trend: ResourceTrend;
  crisisPoint: number;
};

export type WorldTimelineEvent = {
  id: string;
  type: WorldEventType;
  title: string;
  detail: string;
  severity: WorldEventSeverity;
  source?: "rift" | "director" | "system";
  createdAt: number;
};

export type WorldEvent = WorldTimelineEvent;

export type WorldMetaState = {
  gamesPlayed: number;
  mostCommonEnding: EndingType | null;
  rarePath: boolean;
  communityChoiceInfluence: number;
};

export type WorldState = {
  factions: Record<FactionId, FactionState>;
  resources: Record<ResourceId, ResourceState>;
  scars: string[];
  tensions: Record<WorldTensionId, number>;
  timeline: WorldTimelineEvent[];
  meta: WorldMetaState;
};

export type MotionCue = {
  intensity: number;
  beat: DirectorBeatType;
  effectProfile: EffectProfile;
  transitionStyle: TransitionStyle;
  pressureBand: MotionIntensityBand;
};

export type DirectedSceneView = {
  sceneId: string;
  baseText: string;
  renderedText: string;
  beatType: DirectorBeatType;
  pressureBand: MotionIntensityBand;
  intensity: number;
  activeThreadId: string | null;
  payoffThreadId: string | null;
  motionCue: MotionCue;
  updatedAt: number;
};

export type DirectorBeatRecord = {
  id: string;
  sceneId: string;
  beatType: DirectorBeatType;
  pressureBand: MotionIntensityBand;
  intensity: number;
  effectProfile: EffectProfile;
  payoffThreadId: string | null;
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
  step: number;
  sceneId: string;
  playerId: string | null;
  choiceId?: string | null;
  originalNextSceneId?: string | null;
  nextSceneId?: string | null;
  targetGenre?: GenreId | null;
  chaosLevel: number;
  createdAt: number;
};

export type RiftTriggerContext = {
  roomCode: string;
  step: number;
  sceneId: string;
  chaosLevel: number;
  genrePower: GenrePower;
  voteSplitSeverity: number;
  scenesSinceLastRift: number;
  recentTensionDelta: number;
  timeout?: boolean;
};

export type RiftDecision = {
  triggered: boolean;
  selectedType: RiftEventType | null;
  probability: number;
  roll: number;
  reason: string;
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

export type VisualBeat = {
  type: "text" | "dialogue" | "action" | "separator";
  content: string;
  speaker?: string;
  icon?: string;
};

export type StoryBeat = {
  id: string;
  title: string;
  location: string;
  icon: string;
  rawText: string;
  visualBeats: VisualBeat[];
  createdBy: string;
  createdAt: number;
};

export type GMChoice = {
  id: string;
  label: string;
  icon: string;
  stakes?: string;
  personality?: "brave" | "analytical" | "defensive" | "chaotic" | "empathetic" | "opportunistic";
  order: number;
};

export type FreeformSubmission = {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
};

export type VoteState = {
  votesByPlayerId: Record<string, string>;
  countsByChoiceId: Record<string, number>;
  freeformByPlayerId: Record<string, FreeformSubmission>;
  lockedChoiceId: string | null;
  openedAt: number | null;
  deadlineAt: number | null;
};

export type ReadyState = {
  readyPlayerIds: string[];
  readyGm: boolean;
  requiredReadyIds: string[];
  allReady: boolean;
};

export type GMTranscriptEntry = {
  id: string;
  beatId: string;
  beatIndex: number;
  phase: "beat" | "vote_lock" | "consequence";
  beatText?: string;
  winningChoiceId?: string | null;
  winningChoiceLabel?: string | null;
  voteCounts?: Record<string, number>;
  freeform?: Array<{
    playerId: string;
    playerName: string;
    text: string;
    timestamp: number;
  }>;
  consequenceText?: string | null;
  createdAt: number;
};

export type GMSessionState = {
  mode: "gm";
  gmPlayerId: string | null;
  phase: GMPhase;
  beatIndex: number;
  currentBeat: StoryBeat | null;
  currentChoices: GMChoice[];
  currentOutcomeText: string | null;
  readyState: ReadyState;
  voteState: VoteState;
  aiSource: "claude" | "local" | null;
  beatHistory: StoryBeat[];
  transcript: GMTranscriptEntry[];
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

export type NarrativeThreadMoment = {
  sceneId: string;
  detail: string;
  timestamp: number;
};

export type NarrativeThread = {
  id: string;
  type: NarrativeThreadType;
  priority: number;
  status: NarrativeThreadStatus;
  seeds: NarrativeThreadMoment[];
  developments: NarrativeThreadMoment[];
  payoff: NarrativeThreadMoment | null;
  clues: string[];
  playerAwareness: number;
  metadata: {
    created: number;
    lastMention: number;
    scenesSinceMention: number;
  };
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
  sessionMode: SessionMode;
  gmState: GMSessionState | null;
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
  sceneReadyPlayerIds: string[];
  choicesOpen: boolean;
  history: HistoryEntry[];
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  activeRiftEvent: RiftEventRecord | null;
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
  worldState: WorldState;
  latestWorldEvent: WorldEvent | null;
  narrativeThreads: NarrativeThread[];
  activeThreadId: string | null;
  directedScene: DirectedSceneView | null;
  directorTimeline: DirectorBeatRecord[];
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
  worldState: WorldState;
  latestWorldEvent: WorldEvent | null;
  narrativeThreads: NarrativeThread[];
  activeThreadId: string | null;
  directedScene: DirectedSceneView | null;
  directorTimeline: DirectorBeatRecord[];
  gmTranscript?: GMTranscriptEntry[];
  sessionMode?: SessionMode;
};

export type NarratorUpdatePayload = {
  line: NarrationLine;
  roomCode: string;
};

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

export type ServerHelloPayload = {
  accepted: boolean;
  protocolVersion: ProtocolVersion;
  capabilities: CapabilityFlag[];
  snapshotVersion: SnapshotVersion;
  serverTimeMs: number;
  buildId: string;
  reason?: string;
};

export type GMStateUpdatePayload = {
  roomCode: string;
  gmState: GMSessionState;
  snapshotVersion: SnapshotVersion;
  serverTimeMs: number;
  tick: number;
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
