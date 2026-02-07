import alienSource from "../data/stories/alien.json";
import hauntedSource from "../data/stories/haunted.json";
import zombieSource from "../data/stories/zombie.json";
import type { GenreId, Scene, StoryTree } from "../types/game";

const zombie = zombieSource as StoryTree;
const alien = alienSource as StoryTree;
const haunted = hauntedSource as StoryTree;

const STORIES: Record<GenreId, StoryTree> = {
  zombie,
  alien,
  haunted,
};

export function getStory(genre: GenreId): StoryTree {
  return STORIES[genre];
}

export function getScene(genre: GenreId, sceneId: string): Scene | null {
  return STORIES[genre].scenes.find((scene) => scene.id === sceneId) ?? null;
}

export function getStoryTitle(genre: GenreId | null): string | null {
  if (!genre) {
    return null;
  }
  return STORIES[genre].title;
}
