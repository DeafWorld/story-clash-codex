import type {
  DirectorBeatRecord,
  DirectedSceneView,
  MotionCue,
  MotionIntensityBand,
  NarrativeThread,
  PlayerProfile,
  Scene,
  TransitionStyle,
  WorldTimelineEvent,
} from "../types/game";

const MAX_DIRECTOR_TIMELINE = 40;
const MAX_WORLD_TIMELINE = 60;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: T[], seed: string): T {
  const index = stableHash(seed) % items.length;
  return items[index] ?? items[0];
}

function archetypeVolatility(profile: PlayerProfile | null): number {
  const archetype = profile?.archetypes.primary;
  if (!archetype) {
    return 10;
  }
  if (archetype === "The Renegade") {
    return 34;
  }
  if (archetype === "The Opportunist") {
    return 30;
  }
  if (archetype === "The Hero") {
    return 20;
  }
  if (archetype === "The Survivor") {
    return 22;
  }
  if (archetype === "The Peacekeeper") {
    return 12;
  }
  if (archetype === "The Supporter") {
    return 10;
  }
  return 16;
}

function pressureBand(input: {
  chaosLevel: number;
  tensionLevel: number;
  unresolvedThreads: number;
  volatility: number;
}): MotionIntensityBand {
  const score =
    input.chaosLevel * 0.58 +
    clamp(input.tensionLevel, 1, 5) * 8 +
    input.unresolvedThreads * 6 +
    input.volatility * 0.35;
  if (score >= 82) {
    return "critical";
  }
  if (score >= 45) {
    return "rising";
  }
  return "calm";
}

function transitionStyle(band: MotionIntensityBand, beat: DirectedSceneView["beatType"]): TransitionStyle {
  if (beat === "fracture") {
    return "hard_cut";
  }
  if (beat === "payoff") {
    return "surge";
  }
  if (band === "critical") {
    return "surge";
  }
  if (band === "rising") {
    return "drift";
  }
  return "drift";
}

function buildMotionCue(input: {
  beat: DirectedSceneView["beatType"];
  band: MotionIntensityBand;
  chaosLevel: number;
  tensionLevel: number;
  volatility: number;
}): MotionCue {
  const base = clamp(Math.round(input.chaosLevel * 0.72 + input.tensionLevel * 8 + input.volatility * 0.45), 8, 100);
  const beatBoost =
    input.beat === "payoff" ? 15 : input.beat === "fracture" ? 22 : input.beat === "escalation" ? 8 : input.beat === "cooldown" ? -18 : 0;
  const intensity = clamp(base + beatBoost, 0, 100);

  return {
    intensity,
    beat: input.beat,
    effectProfile:
      input.beat === "payoff"
        ? "shockwave"
        : input.beat === "fracture"
          ? "void_hum"
          : input.beat === "cooldown"
            ? "cooldown_breath"
            : "rift_drift",
    transitionStyle: transitionStyle(input.band, input.beat),
    pressureBand: input.band,
  };
}

function renderText(input: {
  roomCode: string;
  scene: Scene;
  beat: DirectedSceneView["beatType"];
  activeThreadId: string | null;
  payoffThreadId: string | null;
  actorProfile: PlayerProfile | null;
  band: MotionIntensityBand;
  historyLength: number;
}): string {
  const introPool =
    input.beat === "payoff"
      ? [
          "A buried thread snaps into focus.",
          "The Rift finally answers an old debt.",
          "What was seeded before now demands payment.",
        ]
      : input.beat === "fracture"
        ? [
            "Reality buckles and cracks along the seams.",
            "The Rift tears wide and swallows your margin for error.",
            "Space warps around your crew in a violent shear.",
          ]
        : input.beat === "cooldown"
          ? [
              "The aftershock settles into a thin, dangerous calm.",
              "For one breath, the pressure drops.",
              "The room exhales, but only for a second.",
            ]
          : input.beat === "escalation"
            ? [
                "Pressure climbs and every choice gets expensive.",
                "The Rift tightens around the next decision.",
                "A heavier wave of danger moves in.",
              ]
            : [
                "The Rift hums beneath the surface.",
                "A fragile calm masks the next hit.",
                "The air steadies, but nothing is safe.",
              ];
  const intro = pick(introPool, `${input.roomCode}:${input.scene.id}:${input.historyLength}:intro:${input.beat}`);

  const archetypeHook =
    input.actorProfile?.archetypes.primary === "The Renegade"
      ? "Your reckless instinct surges."
      : input.actorProfile?.archetypes.primary === "The Peacekeeper"
        ? "You can feel the crew looking for your restraint."
        : input.actorProfile?.archetypes.primary === "The Opportunist"
          ? "The best selfish angle is suddenly visible."
          : input.actorProfile?.archetypes.primary === "The Hero"
            ? "Leadership pressure lands squarely on you."
            : input.actorProfile?.archetypes.primary === "The Survivor"
              ? "Your survival instinct takes over."
              : "";

  const threadLine = input.payoffThreadId
    ? `Thread payoff: ${input.payoffThreadId.replace(/^thread-/, "").replaceAll("-", " ")}.`
    : input.activeThreadId
      ? `Thread pressure: ${input.activeThreadId.replace(/^thread-/, "").replaceAll("-", " ")}.`
      : "";

  const suffix = input.band === "critical" ? "Everything feels one move from collapse." : "";
  return [intro, archetypeHook, threadLine, input.scene.text, suffix].filter(Boolean).join(" ");
}

function choosePayoffThread(input: {
  roomCode: string;
  sceneId: string;
  historyLength: number;
  chaosLevel: number;
  threads: NarrativeThread[];
}): NarrativeThread | null {
  if (input.historyLength < 4) {
    return null;
  }

  const eligible = input.threads.filter(
    (thread) =>
      thread.status === "active" &&
      thread.developments.length >= 2 &&
      thread.metadata.scenesSinceMention >= 2 &&
      thread.payoff === null
  );
  if (!eligible.length) {
    return null;
  }
  if (input.chaosLevel < 52) {
    return null;
  }

  const scored = eligible
    .map((thread) => ({
      thread,
      score:
        thread.priority * 12 +
        thread.metadata.scenesSinceMention * 5 +
        thread.playerAwareness * 0.15 +
        (input.chaosLevel >= 70 ? 14 : 0),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftTiebreak = stableHash(`${input.roomCode}:${threadSeed(left.thread)}:${input.sceneId}`);
      const rightTiebreak = stableHash(`${input.roomCode}:${threadSeed(right.thread)}:${input.sceneId}`);
      return rightTiebreak - leftTiebreak;
    });

  return scored[0]?.thread ?? null;
}

function threadSeed(thread: NarrativeThread) {
  return `${thread.id}:${thread.metadata.created}:${thread.metadata.lastMention}`;
}

function determineBeat(input: {
  chaosLevel: number;
  band: MotionIntensityBand;
  hasPayoff: boolean;
  recent: DirectorBeatRecord[];
}): DirectedSceneView["beatType"] {
  if (input.hasPayoff) {
    return "payoff";
  }
  if (input.chaosLevel >= 92) {
    return "fracture";
  }

  const recentBeats = input.recent.slice(-3).map((entry) => entry.beatType);
  const last = recentBeats[recentBeats.length - 1];

  if ((last === "payoff" || last === "fracture") && input.band !== "critical") {
    return "cooldown";
  }

  if (recentBeats.length >= 2 && recentBeats[recentBeats.length - 1] === "setup" && recentBeats[recentBeats.length - 2] === "setup") {
    return "escalation";
  }

  if (input.band === "critical") {
    return input.chaosLevel >= 84 ? "fracture" : "escalation";
  }
  if (input.band === "rising") {
    return "escalation";
  }
  return "setup";
}

function nextActiveThreadId(threads: NarrativeThread[]): string | null {
  const active = threads
    .filter((thread) => thread.status === "active")
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.metadata.scenesSinceMention - left.metadata.scenesSinceMention;
    });
  return active[0]?.id ?? null;
}

export type NarrativeDirectorInput = {
  roomCode: string;
  scene: Scene;
  chaosLevel: number;
  tensionLevel: number;
  historyLength: number;
  actorProfile: PlayerProfile | null;
  narrativeThreads: NarrativeThread[];
  activeThreadId: string | null;
  directorTimeline: DirectorBeatRecord[];
};

export type NarrativeDirectorResult = {
  directedScene: DirectedSceneView;
  narrativeThreads: NarrativeThread[];
  activeThreadId: string | null;
  directorTimeline: DirectorBeatRecord[];
  timelineEvents: WorldTimelineEvent[];
};

export function applyNarrativeDirector(input: NarrativeDirectorInput): NarrativeDirectorResult {
  const nowTs = Date.now();
  const threads = structuredClone(input.narrativeThreads);
  const unresolvedCount = threads.filter((thread) => thread.status === "active").length;
  const volatility = archetypeVolatility(input.actorProfile);
  const band = pressureBand({
    chaosLevel: input.chaosLevel,
    tensionLevel: input.tensionLevel,
    unresolvedThreads: unresolvedCount,
    volatility,
  });

  const payoffThread = choosePayoffThread({
    roomCode: input.roomCode,
    sceneId: input.scene.id,
    historyLength: input.historyLength,
    chaosLevel: input.chaosLevel,
    threads,
  });
  const beat = determineBeat({
    chaosLevel: input.chaosLevel,
    band,
    hasPayoff: Boolean(payoffThread),
    recent: input.directorTimeline,
  });

  const timelineEvents: WorldTimelineEvent[] = [];

  if (payoffThread) {
    payoffThread.status = "resolved";
    payoffThread.payoff = {
      sceneId: input.scene.id,
      detail: `Resolved during ${input.scene.id}`,
      timestamp: nowTs,
    };
    payoffThread.metadata.lastMention = nowTs;
    timelineEvents.push({
      id: `evt-${input.roomCode}-${input.historyLength}-thread-resolved-${payoffThread.id}`,
      type: "thread_resolved",
      title: "Thread payoff",
      detail: `Narrative thread ${payoffThread.id} reached payoff state.`,
      severity: band === "critical" ? "high" : "medium",
      createdAt: nowTs,
    });
  }

  const motionCue = buildMotionCue({
    beat,
    band,
    chaosLevel: input.chaosLevel,
    tensionLevel: input.tensionLevel,
    volatility,
  });

  const activeThreadId = nextActiveThreadId(threads);
  const directedScene: DirectedSceneView = {
    sceneId: input.scene.id,
    baseText: input.scene.text,
    renderedText: renderText({
      roomCode: input.roomCode,
      scene: input.scene,
      beat,
      activeThreadId,
      payoffThreadId: payoffThread?.id ?? null,
      actorProfile: input.actorProfile,
      band,
      historyLength: input.historyLength,
    }),
    beatType: beat,
    pressureBand: band,
    intensity: motionCue.intensity,
    activeThreadId,
    payoffThreadId: payoffThread?.id ?? null,
    motionCue,
    updatedAt: nowTs,
  };

  const beatRecord: DirectorBeatRecord = {
    id: `beat-${input.roomCode}-${input.historyLength}-${stableHash(`${input.scene.id}:${beat}:${nowTs}`).toString(16)}`,
    sceneId: input.scene.id,
    beatType: beat,
    pressureBand: band,
    intensity: directedScene.intensity,
    effectProfile: motionCue.effectProfile,
    payoffThreadId: payoffThread?.id ?? null,
    createdAt: nowTs,
  };

  const directorTimeline = [...input.directorTimeline, beatRecord].slice(-MAX_DIRECTOR_TIMELINE);

  return {
    directedScene,
    narrativeThreads: threads,
    activeThreadId,
    directorTimeline,
    timelineEvents: timelineEvents.slice(-MAX_WORLD_TIMELINE),
  };
}

export function defaultMotionCue(): MotionCue {
  return {
    intensity: 22,
    beat: "setup",
    effectProfile: "rift_drift",
    transitionStyle: "drift",
    pressureBand: "calm",
  };
}
