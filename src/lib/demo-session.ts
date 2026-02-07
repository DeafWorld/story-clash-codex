import zombieSource from "../data/stories/zombie.json";
import {
  getNextNodeIdFromChoice,
  getNextNodeIdFromFreeChoice,
  getNodeById,
  getStoryStartNode,
} from "./story-utils";
import type { Player, StoryTree } from "../types/game";

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
  storyId: "zombie";
  status: "lobby" | "minigame" | "story" | "recap";
  players: DemoPlayer[];
  turnOrder: string[];
  minigameOrder: string[];
  currentPlayerId: string;
  currentNodeId: string;
  history: DemoStoryEntry[];
};

const storyTree = zombieSource as StoryTree;

const DEMO_PLAYERS: DemoPlayer[] = [
  { id: "demo-host", name: "Host", isHost: true, score: 0, orderIndex: 0, connected: true, rounds: [] },
  { id: "demo-p2", name: "Player 2", isHost: false, score: 0, orderIndex: 1, connected: true, rounds: [] },
  { id: "demo-p3", name: "Player 3", isHost: false, score: 0, orderIndex: 2, connected: true, rounds: [] },
];

let session: DemoSessionState = createSession();

function createSession(): DemoSessionState {
  const startNode = getStoryStartNode(storyTree);
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
  };
}

function markStoryOrRecap(nextNodeId: string) {
  const node = getNodeById(storyTree, nextNodeId);
  if (!node) {
    return;
  }
  session.status = node.ending ? "recap" : "story";
}

function pushHistory(nextNodeId: string, choiceLabel: string, isFreeChoice: boolean, freeText?: string) {
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
    isFreeChoice,
    freeText,
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
  return storyTree;
}

export function getDemoScene() {
  return getNodeById(storyTree, session.currentNodeId);
}

export function setDemoMinigameOrder(order: string[]) {
  session.minigameOrder = order;
  session.turnOrder = order;
  session.players = session.players.map((player) => ({
    ...player,
    orderIndex: order.indexOf(player.id) >= 0 ? order.indexOf(player.id) : player.orderIndex,
  }));
  session.status = "story";
  session.currentPlayerId = "demo-host";
}

export function advanceDemoStoryChoice(choiceId: string) {
  const scene = getDemoScene();
  if (!scene || scene.ending || !scene.choices.length) {
    return session;
  }

  const nextNodeId = getNextNodeIdFromChoice(scene, choiceId);
  if (!nextNodeId) {
    return session;
  }

  const choice = scene.choices.find((entry) => entry.id === choiceId) ?? scene.choices[0];
  pushHistory(nextNodeId, choice.label, false);

  session.currentNodeId = nextNodeId;
  markStoryOrRecap(nextNodeId);
  return session;
}

export function advanceDemoStoryFreeChoice(freeText: string) {
  const scene = getDemoScene();
  if (!scene || scene.ending) {
    return session;
  }

  const nextNodeId = getNextNodeIdFromFreeChoice(scene, freeText);
  if (!nextNodeId) {
    return session;
  }

  pushHistory(nextNodeId, "Free Choice", true, freeText.trim().slice(0, 120));

  session.currentNodeId = nextNodeId;
  markStoryOrRecap(nextNodeId);
  return session;
}

export function getDemoEndingText() {
  const scene = getDemoScene();
  return scene?.text ?? "The demo ended.";
}
