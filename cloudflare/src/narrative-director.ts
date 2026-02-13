import type {
  DirectedSceneView,
  DirectorBeatRecord,
  MotionCue,
  MotionIntensityBand,
  NarrativeThreadStatus,
  RoomState,
  Scene,
  WorldTimelineEvent,
} from "./types";

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

function pressureBand(chaosLevel: number, tensionLevel: number, unresolvedThreads: number): MotionIntensityBand {
  const score = chaosLevel * 0.62 + tensionLevel * 7 + unresolvedThreads * 6;
  if (score >= 82) {
    return "critical";
  }
  if (score >= 46) {
    return "rising";
  }
  return "calm";
}

function beatFromContext(input: {
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
  const last = input.recent.at(-1)?.beatType;
  if ((last === "payoff" || last === "fracture") && input.band !== "critical") {
    return "cooldown";
  }
  if (input.band === "critical") {
    return input.chaosLevel >= 84 ? "fracture" : "escalation";
  }
  return input.band === "rising" ? "escalation" : "setup";
}

function motionCue(input: {
  beat: DirectedSceneView["beatType"];
  band: MotionIntensityBand;
  chaosLevel: number;
  tensionLevel: number;
}): MotionCue {
  const base = clamp(Math.round(input.chaosLevel * 0.74 + input.tensionLevel * 9), 8, 100);
  const boost =
    input.beat === "payoff" ? 14 : input.beat === "fracture" ? 20 : input.beat === "cooldown" ? -16 : input.beat === "escalation" ? 6 : 0;
  const intensity = clamp(base + boost, 0, 100);
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
    transitionStyle: input.beat === "fracture" ? "hard_cut" : input.beat === "payoff" ? "surge" : "drift",
    pressureBand: input.band,
  };
}

function renderText(input: {
  roomCode: string;
  scene: Scene;
  beat: DirectedSceneView["beatType"];
  activeThreadId: string | null;
  payoffThreadId: string | null;
  historyLength: number;
}): string {
  const lead =
    input.beat === "payoff"
      ? "The Rift cashes in a long-buried thread."
      : input.beat === "fracture"
        ? "Reality fractures and the room twists."
        : input.beat === "cooldown"
          ? "The aftershock slows to a dangerous calm."
          : input.beat === "escalation"
            ? "The pressure line spikes higher."
            : "A thin calm settles over the crew.";
  const thread = input.payoffThreadId
    ? `Payoff: ${input.payoffThreadId.replace(/^thread-/, "").replaceAll("-", " ")}.`
    : input.activeThreadId
      ? `Thread pressure: ${input.activeThreadId.replace(/^thread-/, "").replaceAll("-", " ")}.`
      : "";
  return [lead, thread, input.scene.text].filter(Boolean).join(" ");
}

function choosePayoffThread(room: RoomState): string | null {
  const mature = room.narrativeThreads
    .filter((thread) => thread.status === "active" && thread.developments.length >= 2 && thread.metadata.scenesSinceMention >= 2)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.metadata.scenesSinceMention - left.metadata.scenesSinceMention;
    });
  return mature[0]?.id ?? null;
}

function nextActiveThreadId(room: RoomState) {
  const active = room.narrativeThreads
    .filter((thread) => thread.status === "active")
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.metadata.scenesSinceMention - left.metadata.scenesSinceMention;
    });
  return active[0]?.id ?? null;
}

export function applyNarrativeDirector(room: RoomState, scene: Scene, historyLength: number) {
  const nowTs = Date.now();
  const unresolved = room.narrativeThreads.filter((thread) => thread.status === "active").length;
  const band = pressureBand(room.chaosLevel, scene.tensionLevel ?? room.tensionLevel ?? 1, unresolved);
  const payoffThreadId = room.chaosLevel >= 55 && historyLength >= 4 ? choosePayoffThread(room) : null;
  const beat = beatFromContext({
    chaosLevel: room.chaosLevel,
    band,
    hasPayoff: Boolean(payoffThreadId),
    recent: room.directorTimeline ?? [],
  });
  const cue = motionCue({
    beat,
    band,
    chaosLevel: room.chaosLevel,
    tensionLevel: scene.tensionLevel ?? room.tensionLevel ?? 1,
  });

  const timelineEvents: WorldTimelineEvent[] = [];
  if (payoffThreadId) {
    room.narrativeThreads = room.narrativeThreads.map((thread) => {
      if (thread.id !== payoffThreadId) {
        return thread;
      }
      return {
        ...thread,
        status: "resolved" as NarrativeThreadStatus,
        payoff: {
          sceneId: scene.id,
          detail: `Resolved during ${scene.id}`,
          timestamp: nowTs,
        },
      };
    });
    timelineEvents.push({
      id: `evt-${room.code}-${historyLength}-thread-resolved-${payoffThreadId}`,
      type: "thread_resolved",
      title: "Thread payoff",
      detail: `Narrative thread ${payoffThreadId} reached payoff state.`,
      severity: band === "critical" ? "high" : "medium",
      createdAt: nowTs,
    });
  }

  room.activeThreadId = nextActiveThreadId(room);

  const directedScene: DirectedSceneView = {
    sceneId: scene.id,
    baseText: scene.text,
    renderedText: renderText({
      roomCode: room.code,
      scene,
      beat,
      activeThreadId: room.activeThreadId,
      payoffThreadId,
      historyLength,
    }),
    beatType: beat,
    pressureBand: band,
    intensity: cue.intensity,
    activeThreadId: room.activeThreadId,
    payoffThreadId,
    motionCue: cue,
    updatedAt: nowTs,
  };

  const beatRecord: DirectorBeatRecord = {
    id: `beat-${room.code}-${historyLength}-${stableHash(`${scene.id}:${beat}:${nowTs}`).toString(16)}`,
    sceneId: scene.id,
    beatType: beat,
    pressureBand: band,
    intensity: cue.intensity,
    effectProfile: cue.effectProfile,
    payoffThreadId,
    createdAt: nowTs,
  };

  const directorTimeline = [...(room.directorTimeline ?? []), beatRecord].slice(-MAX_DIRECTOR_TIMELINE);

  return {
    directedScene,
    directorTimeline,
    timelineEvents: timelineEvents.slice(-MAX_WORLD_TIMELINE),
  };
}

export function defaultMotionCue(): MotionCue {
  return {
    intensity: 20,
    beat: "setup",
    effectProfile: "rift_drift",
    transitionStyle: "drift",
    pressureBand: "calm",
  };
}
