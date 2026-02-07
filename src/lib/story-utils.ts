import type { Choice, Scene, StoryChoiceNode, StoryNode, StoryTree } from "../types/game";

export function mapFreeChoiceToPath(input: string, keywords: Record<string, string>): string {
  const normalized = input.toLowerCase().trim();
  if (!normalized) {
    return keywords.default ?? Object.values(keywords)[0];
  }

  for (const [pattern, sceneId] of Object.entries(keywords)) {
    if (pattern === "default") {
      continue;
    }

    const matcher = new RegExp(`\\b(${pattern})\\b`, "i");
    if (matcher.test(normalized)) {
      return sceneId;
    }
  }

  return keywords.default ?? Object.values(keywords)[0];
}

function normalizeChoice(choice: Choice): StoryChoiceNode | null {
  const label = choice.label ?? choice.text;
  const nextId = choice.nextId ?? choice.next;
  if (!label || !nextId) {
    return null;
  }
  return {
    id: choice.id,
    label,
    nextId,
  };
}

export function normalizeSceneNode(scene: Scene): StoryNode {
  const normalizedChoices = (scene.choices ?? [])
    .map((choice) => normalizeChoice(choice))
    .filter((choice): choice is StoryChoiceNode => Boolean(choice));

  return {
    id: scene.id,
    text: scene.text,
    tensionLevel: scene.tensionLevel ?? 2,
    choices: normalizedChoices,
    freeChoiceTargetId: scene.freeChoiceTargetId,
    freeChoiceKeywords: scene.freeChoiceKeywords,
    ending: scene.ending,
    endingType: scene.endingType,
  };
}

export function getStoryStartNode(story: StoryTree): StoryNode {
  const first = story.scenes.find((scene) => scene.id === "start") ?? story.scenes[0];
  return normalizeSceneNode(first);
}

export function getNodeById(story: StoryTree, nodeId: string): StoryNode | null {
  const scene = story.scenes.find((entry) => entry.id === nodeId);
  if (!scene) {
    return null;
  }
  return normalizeSceneNode(scene);
}

export function getNextNodeIdFromChoice(node: StoryNode, choiceId: string): string | null {
  const choice = node.choices.find((entry) => entry.id === choiceId) ?? node.choices[0];
  return choice?.nextId ?? null;
}

export function getNeutralNextNodeId(node: StoryNode): string | null {
  if (!node.choices.length) {
    return null;
  }

  const middle = Math.floor(node.choices.length / 2);
  return node.choices[middle]?.nextId ?? node.choices[0].nextId;
}

export function getNextNodeIdFromFreeChoice(node: StoryNode, freeText: string): string | null {
  if (node.freeChoiceKeywords) {
    return mapFreeChoiceToPath(freeText, node.freeChoiceKeywords);
  }
  if (node.freeChoiceTargetId) {
    return node.freeChoiceTargetId;
  }
  return getNeutralNextNodeId(node);
}
