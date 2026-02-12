import zombieSource from "../data/stories/zombie.json";
import alienSource from "../data/stories/alien.json";
import hauntedSource from "../data/stories/haunted.json";
import { generateNarrationLine } from "./narrator";
import {
  applyGenrePowerShift,
  computeChaosLevel,
  createInitialGenrePower,
  deriveChoiceGenreShift,
  evaluateRiftEvent,
} from "./rift";
import {
  getNextNodeIdFromChoice,
  getNodeById,
  getStoryStartNode,
} from "./story-utils";
import type {
  GenreId,
  GenrePower,
  NarrationLine,
  Player,
  RiftEventRecord,
  StoryTree,
} from "../types/game";

export type DemoPlayer = Player;

export type DemoStoryEntry = {
  stepIndex: number;
  sceneId: string;
  sceneText: string;
  choiceLabel: string;
  isFreeChoice: boolean;
  freeText?: string;
  nextNodeId: string;
  tensionLevel: number;
  playerId: string;
  playerName: string;
  timestamp: number;
};

export type DemoSessionState = {
  roomCode: "DEMO1";
  storyId: GenreId;
  status: "lobby" | "minigame" | "story" | "recap";
  players: DemoPlayer[];
  turnOrder: string[];
  minigameOrder: string[];
  currentPlayerId: string;
  currentNodeId: string;
  history: DemoStoryEntry[];
  genrePower: GenrePower;
  chaosLevel: number;
  riftHistory: RiftEventRecord[];
  activeRiftEvent: RiftEventRecord | null;
  latestNarration: NarrationLine | null;
  narrationLog: NarrationLine[];
};

const storyTrees: Record<GenreId, StoryTree> = {
  zombie: zombieSource as StoryTree,
  alien: alienSource as StoryTree,
  haunted: hauntedSource as StoryTree,
};

const DEMO_PLAYERS: DemoPlayer[] = [
  { id: "demo-host", name: "Host", isHost: true, score: 0, orderIndex: 0, connected: true, rounds: [] },
  { id: "demo-p2", name: "Player 2", isHost: false, score: 0, orderIndex: 1, connected: true, rounds: [] },
  { id: "demo-p3", name: "Player 3", isHost: false, score: 0, orderIndex: 2, connected: true, rounds: [] },
];

let session: DemoSessionState = createSession();

function createSession(): DemoSessionState {
  const startNode = getStoryStartNode(storyTrees.zombie);
  return {
    roomCode: "DEMO1",
    storyId: "zombie",
    status: "lobby",
    players: DEMO_PLAYERS,
    turnOrder: DEMO_PLAYERS.map((player) => player.id),
    minigameOrder: DEMO_PLAYERS.map((player) => player.id),
    currentPlayerId: "demo-host",
    currentNodeId: startNode.id,
    history: [],
    genrePower: createInitialGenrePower(null),
    chaosLevel: 0,
    riftHistory: [],
    activeRiftEvent: null,
    latestNarration: null,
    narrationLog: [],
  };
}

function appendNarration(trigger: "scene_enter" | "choice_submitted" | "turn_timeout" | "ending", input: {
  sceneId?: string;
  playerId?: string;
  choiceLabel?: string;
  freeText?: string;
} = {}) {
  const storyTree = storyTrees[session.storyId];
  const scene = getNodeById(storyTree, input.sceneId ?? session.currentNodeId) ?? getStoryStartNode(storyTree);
  const player = session.players.find((entry) => entry.id === (input.playerId ?? session.currentPlayerId));
  const endingType = scene.ending ? scene.endingType ?? "doom" : null;
  const line = generateNarrationLine({
    code: session.roomCode,
    trigger,
    genre: session.storyId,
    sceneId: scene.id,
    historyLength: session.history.length,
    tensionLevel: scene.tensionLevel ?? 1,
    playerId: player?.id ?? null,
    playerName: player?.name ?? null,
    choiceLabel: input.choiceLabel ?? null,
    freeText: input.freeText ?? null,
    endingType,
  });
  session.latestNarration = line;
  session.narrationLog = [...session.narrationLog, line].slice(-30);
}

function markStoryOrRecap(nextNodeId: string) {
  const storyTree = storyTrees[session.storyId];
  const node = getNodeById(storyTree, nextNodeId);
  if (!node) {
    return;
  }
  session.status = node.ending ? "recap" : "story";
}

function pushHistory(nextNodeId: string, choiceLabel: string) {
  const storyTree = storyTrees[session.storyId];
  const node = getNodeById(storyTree, session.currentNodeId);
  if (!node) {
    return;
  }

  const player = session.players.find((entry) => entry.id === session.currentPlayerId) ?? session.players[0];

  session.history.push({
    stepIndex: session.history.length + 1,
    sceneId: node.id,
    sceneText: node.text,
    choiceLabel,
    isFreeChoice: false,
    nextNodeId,
    tensionLevel: node.tensionLevel,
    playerId: player.id,
    playerName: player.name,
    timestamp: Date.now(),
  });
}

export function initDemoRoom() {
  session = createSession();
}

export function getDemoSession() {
  return session;
}

export function getDemoStoryTree() {
  return storyTrees[session.storyId];
}

export function getDemoScene() {
  const storyTree = storyTrees[session.storyId];
  return getNodeById(storyTree, session.currentNodeId);
}

export function setDemoMinigameOrder(order: string[], genre: GenreId = "zombie") {
  const storyTree = storyTrees[genre] ?? storyTrees.zombie;
  const startNode = getStoryStartNode(storyTree);
  session.minigameOrder = order;
  session.turnOrder = order;
  session.storyId = genre;
  session.currentNodeId = startNode.id;
  session.history = [];
  session.players = session.players.map((player) => ({
    ...player,
    orderIndex: order.indexOf(player.id) >= 0 ? order.indexOf(player.id) : player.orderIndex,
  }));
  session.genrePower = createInitialGenrePower(genre);
  session.chaosLevel = computeChaosLevel({
    genrePower: session.genrePower,
    selectedGenre: genre,
    tensionLevel: startNode.tensionLevel,
  });
  session.riftHistory = [];
  session.activeRiftEvent = null;
  session.status = "story";
  session.currentPlayerId = order[0] ?? "demo-host";
  appendNarration("scene_enter", { playerId: session.currentPlayerId, sceneId: session.currentNodeId });
}

export function advanceDemoStoryChoice(choiceId: string) {
  const storyTree = storyTrees[session.storyId];
  const scene = getDemoScene();
  if (!scene || scene.ending || !scene.choices.length) {
    return session;
  }
  const sceneChoices = scene.choices;

  let nextNodeId = getNextNodeIdFromChoice(scene, choiceId);
  if (!nextNodeId) {
    return session;
  }

  const choice = sceneChoices.find((entry) => entry.id === choiceId) ?? sceneChoices[0];
  session.genrePower = applyGenrePowerShift(
    session.genrePower,
    deriveChoiceGenreShift({
      selectedGenre: session.storyId,
      scene,
      choiceLabel: choice.label,
    })
  );
  session.chaosLevel = computeChaosLevel({
    genrePower: session.genrePower,
    selectedGenre: session.storyId,
    tensionLevel: scene.tensionLevel,
  });
  const rift = evaluateRiftEvent({
    roomCode: session.roomCode,
    step: session.history.length + 1,
    scene,
    choices: sceneChoices,
    selectedChoiceId: choice.id,
    selectedNextSceneId: nextNodeId,
    playerId: session.currentPlayerId,
    genrePower: session.genrePower,
    chaosLevel: session.chaosLevel,
  });
  nextNodeId = rift.nextSceneId;
  session.genrePower = rift.genrePower;
  session.chaosLevel = rift.chaosLevel;
  session.activeRiftEvent = rift.event;
  if (rift.event) {
    session.riftHistory = [...session.riftHistory, rift.event].slice(-40);
  }

  pushHistory(nextNodeId, choice.label);
  appendNarration("choice_submitted", {
    sceneId: scene.id,
    playerId: session.currentPlayerId,
    choiceLabel: choice.label,
  });

  session.currentNodeId = nextNodeId;
  markStoryOrRecap(nextNodeId);
  const nextScene = getNodeById(storyTree, nextNodeId);
  if (nextScene?.ending) {
    appendNarration("ending", { sceneId: nextScene.id, playerId: session.currentPlayerId });
  }
  return session;
}

export function getDemoEndingText() {
  const scene = getDemoScene();
  return scene?.text ?? "The demo ended.";
}
