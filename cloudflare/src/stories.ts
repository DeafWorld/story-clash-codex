import alienSource from "../../src/data/stories/alien.json";
import hauntedSource from "../../src/data/stories/haunted.json";
import zombieSource from "../../src/data/stories/zombie.json";
import type { Choice, GenreId, Scene, StoryTree } from "./types";

const STORIES: Record<GenreId, StoryTree> = {
  zombie: zombieSource as StoryTree,
  alien: alienSource as StoryTree,
  haunted: hauntedSource as StoryTree,
};

function normalizeChoice(choice: Choice): { id: string; label: string; nextId: string } | null {
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

export function getStory(genre: GenreId): StoryTree {
  return STORIES[genre];
}

export function getStoryTitle(genre: GenreId | null): string | null {
  if (!genre) {
    return null;
  }
  return STORIES[genre].title;
}

export function getScene(genre: GenreId, sceneId: string): Scene | null {
  return STORIES[genre].scenes.find((scene) => scene.id === sceneId) ?? null;
}

export function getStoryStartScene(genre: GenreId): Scene {
  return getScene(genre, "start") ?? STORIES[genre].scenes[0];
}

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

export function getNeutralNextNode(scene: Scene): string | null {
  const normalized = (scene.choices ?? [])
    .map((choice) => normalizeChoice(choice))
    .filter((choice): choice is { id: string; label: string; nextId: string } => Boolean(choice));

  if (!normalized.length) {
    return null;
  }

  const middle = Math.floor(normalized.length / 2);
  return normalized[middle]?.nextId ?? normalized[0].nextId;
}

export function getNextSceneIdFromChoice(scene: Scene, choiceId: string): string | null {
  const choices = scene.choices ?? [];
  const selected = choices.find((choice) => choice.id === choiceId) ?? choices[0];
  if (!selected) {
    return null;
  }
  return selected.nextId ?? selected.next ?? null;
}

export function getNextSceneIdFromFreeChoice(scene: Scene, freeText: string): string | null {
  if (scene.freeChoiceKeywords) {
    return mapFreeChoiceToPath(freeText, scene.freeChoiceKeywords);
  }
  if (scene.freeChoiceTargetId) {
    return scene.freeChoiceTargetId;
  }
  return getNeutralNextNode(scene);
}
