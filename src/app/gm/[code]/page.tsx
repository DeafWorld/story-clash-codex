"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { apiFetch } from "../../../lib/api-client";
import { getSocketClient } from "../../../lib/socket-client";
import SceneShell from "../../../components/motion/scene-shell";
import SessionTopBar from "../../../components/session-top-bar";
import StoryEditor from "../../../components/gm/story-editor";
import ChoiceCreator from "../../../components/gm/choice-creator";
import LiveVotes from "../../../components/gm/live-votes";
import ConsequenceWriter from "../../../components/gm/consequence-writer";
import AICopilot from "../../../components/gm/ai-copilot";
import FormattedStoryBeat from "../../../components/player/formatted-story-beat";
import VoteReveal from "../../../components/player/vote-reveal";
import type { GMChoice, GMSessionState, RoomView, StoryBeat } from "../../../types/game";

type StateEnvelope = {
  roomCode: string;
  gmState: GMSessionState;
  snapshotVersion?: number;
  serverTimeMs?: number;
  tick?: number;
};

export default function GMPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";

  const [room, setRoom] = useState<RoomView | null>(null);
  const [gmState, setGmState] = useState<GMSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const playerNameById = useMemo(() => {
    const lookup: Record<string, string> = {};
    (room?.players ?? []).forEach((player) => {
      lookup[player.id] = player.name;
    });
    return lookup;
  }, [room?.players]);

  const gmPlayer = useMemo(() => room?.players.find((player) => player.id === gmState?.gmPlayerId) ?? null, [gmState?.gmPlayerId, room?.players]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2300);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!gmState || gmState.gmPlayerId === playerId) {
      return;
    }
    router.replace(`/play/${code}?player=${playerId}`);
  }, [code, gmState, playerId, router]);

  useEffect(() => {
    if (!room || room.sessionMode === "gm") {
      return;
    }
    router.replace(`/game/${code}?player=${playerId}`);
  }, [code, playerId, room, router]);

  useEffect(() => {
    let mounted = true;

    async function loadRoom() {
      try {
        const response = await apiFetch(`/api/game/${code}`);
        const data = (await response.json()) as RoomView | { error: string };
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Room unavailable");
        }
        if (!mounted) {
          return;
        }
        setRoom(data);
        setGmState(data.gmState);
        setLoading(false);
      } catch (nextError) {
        if (!mounted) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Unable to load GM room");
        setLoading(false);
      }
    }

    void loadRoom();
    return () => {
      mounted = false;
    };
  }, [code]);

  useEffect(() => {
    if (!gmState || gmState.phase !== "voting_open" || !gmState.voteState.deadlineAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil(((gmState.voteState.deadlineAt ?? 0) - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 300);
    return () => window.clearInterval(timer);
  }, [gmState?.phase, gmState?.voteState.deadlineAt]);

  useEffect(() => {
    if (!playerId) {
      return;
    }

    const socket = getSocketClient();
    socket.emit("join_room", { code, playerId });

    const onRoomUpdated = (payload: RoomView) => {
      setRoom(payload);
      if (payload.gmState) {
        setGmState(payload.gmState);
      }
    };

    const onStateUpdate = (payload: StateEnvelope) => {
      if (payload.roomCode !== code) {
        return;
      }
      setGmState(payload.gmState);
    };

    const onReconnectState = (payload: RoomView) => {
      setRoom(payload);
      if (payload.gmState) {
        setGmState(payload.gmState);
      }
      setReconnecting((wasReconnecting) => {
        if (wasReconnecting) {
          setToast("Session synced to live state.");
        }
        return false;
      });
    };

    const onServerError = (payload: { message?: string }) => {
      const message = payload.message ?? "Server error";
      if (/realtime|connect/i.test(message)) {
        setReconnecting(true);
        setToast("Reconnecting...");
        return;
      }
      setToast(message);
    };

    socket.on("room_updated", onRoomUpdated);
    socket.on("gm_state_update", onStateUpdate);
    socket.on("reconnect_state", onReconnectState);
    socket.on("server_error", onServerError);

    return () => {
      socket.emit("leave_room", { code, playerId });
      socket.off("room_updated", onRoomUpdated);
      socket.off("gm_state_update", onStateUpdate);
      socket.off("reconnect_state", onReconnectState);
      socket.off("server_error", onServerError);
    };
  }, [code, playerId]);

  function emit(event: string, payload: Record<string, unknown>) {
    getSocketClient().emit(event, {
      code,
      playerId,
      ...payload,
    });
  }

  function publishBeat(input: {
    title: string;
    location: string;
    icon: string;
    rawText: string;
    visualBeats: StoryBeat["visualBeats"];
    aiSource: "claude" | "local" | null;
  }) {
    emit("gm_publish_beat", input);
  }

  function publishChoices(choices: GMChoice[], timeLimitSec: number) {
    emit("gm_publish_choices", { choices, timeLimitSec });
  }

  function markReady() {
    emit("gm_mark_ready", {});
  }

  function publishConsequence(text: string) {
    emit("gm_publish_consequence", { text });
  }

  function nextBeat() {
    emit("gm_next_beat", {});
  }

  if (!playerId) {
    return (
      <SceneShell className="page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="GM" roomCode={code} />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel max-w-lg p-6">
            <p className="text-red-300">Missing player session. Rejoin the room.</p>
          </div>
        </div>
      </SceneShell>
    );
  }

  if (loading) {
    return (
      <SceneShell className="page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="GM" roomCode={code} playerId={playerId} />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading GM dashboard...</p>
        </div>
      </SceneShell>
    );
  }

  if (error || !room || !gmState) {
    return (
      <SceneShell className="page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="GM" roomCode={code} playerId={playerId} />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel max-w-lg p-6">
            <p className="text-red-300">{error ?? "GM state unavailable"}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => router.push(`/lobby/${code}?player=${playerId}`)}>
              Back to Lobby
            </button>
          </div>
        </div>
      </SceneShell>
    );
  }

  const isGMReady = gmState.readyState.readyGm;
  const requiredReadyIds = gmState.readyState.requiredReadyIds;
  const readyPlayerSet = new Set(gmState.readyState.readyPlayerIds);
  const lockedChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId) ?? null;
  const lockedVotes = lockedChoice ? gmState.voteState.countsByChoiceId[lockedChoice.id] ?? 0 : 0;

  return (
    <SceneShell className="page-with-top-bar">
      <SessionTopBar
        backHref={`/lobby/${code}?player=${playerId}`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="GM"
        playerName={gmPlayer?.name}
      />

      <div className="content-wrap space-y-4">
        <section className="panel p-4">
          <p className="badge w-fit">GM Session</p>
          <h1 className="mt-2 text-2xl font-black">Live Story Director</h1>
          <p className="mt-1 text-sm text-zinc-300">
            Phase: <span className="font-semibold text-cyan-200">{gmState.phase.replaceAll("_", " ")}</span> • Beat {gmState.beatIndex}
          </p>
          {reconnecting ? <p className="mt-2 text-xs text-amber-200">Reconnecting...</p> : null}
          {toast ? <p className="mt-2 text-xs text-cyan-200">{toast}</p> : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {gmState.currentBeat ? <FormattedStoryBeat beat={gmState.currentBeat} /> : null}

            {gmState.phase === "writing_beat" ? (
              <StoryEditor
                roomCode={code}
                beatIndex={gmState.beatIndex}
                recentBeats={gmState.beatHistory.map((entry) => entry.rawText)}
                onPublish={publishBeat}
              />
            ) : null}

            {(gmState.phase === "reading" || gmState.phase === "creating_choices") && gmState.currentBeat ? (
              <>
                <section className="panel space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Readiness gate</p>
                    <button type="button" className="btn btn-secondary" onClick={markReady} disabled={isGMReady}>
                      {isGMReady ? "GM Ready" : "Mark GM Ready"}
                    </button>
                  </div>
                  <p className="text-sm text-zinc-200">
                    Choices open only after GM + all connected players are ready.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {requiredReadyIds.map((readyId) => (
                      <div
                        key={readyId}
                        className={clsx(
                          "rounded-lg border px-3 py-2 text-xs",
                          readyPlayerSet.has(readyId)
                            ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                            : "border-white/15 bg-black/30 text-zinc-300"
                        )}
                      >
                        {playerNameById[readyId] ?? "Player"}: {readyPlayerSet.has(readyId) ? "Ready" : "Reading"}
                      </div>
                    ))}
                    <div
                      className={clsx(
                        "rounded-lg border px-3 py-2 text-xs",
                        isGMReady ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100" : "border-white/15 bg-black/30 text-zinc-300"
                      )}
                    >
                      GM: {isGMReady ? "Ready" : "Reading"}
                    </div>
                  </div>
                </section>

                <ChoiceCreator
                  roomCode={code}
                  beatIndex={gmState.beatIndex}
                  currentBeatText={gmState.currentBeat.rawText}
                  onPublish={publishChoices}
                />
              </>
            ) : null}

            {gmState.phase === "voting_open" ? (
              <section className="space-y-3">
                <section className="panel p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Voting timer</p>
                  <p className="mt-1 text-2xl font-black text-white">{secondsLeft}s</p>
                </section>
                <LiveVotes gmState={gmState} playerNameById={playerNameById} />
              </section>
            ) : null}

            {gmState.phase === "vote_locked" ? (
              <section className="space-y-3">
                <VoteReveal choice={lockedChoice} votes={lockedVotes} />
                <ConsequenceWriter roomCode={code} gmState={gmState} onPublish={publishConsequence} />
              </section>
            ) : null}

            {gmState.phase === "writing_consequence" ? (
              <section className="space-y-3">
                <section className="panel space-y-2 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Consequence published</p>
                  <p className="whitespace-pre-line text-sm text-zinc-100">{gmState.currentOutcomeText}</p>
                </section>
                <button type="button" className="btn btn-primary w-full" onClick={nextBeat}>
                  Start Next Beat
                </button>
                <button type="button" className="btn btn-secondary w-full" onClick={() => router.push(`/recap/${code}?player=${playerId}`)}>
                  Go To Recap
                </button>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4">
            <AICopilot gmState={gmState} />
            <section className="panel space-y-2 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Transcript</p>
              <p className="text-sm text-zinc-100">{gmState.transcript.length} entries</p>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {gmState.transcript.slice(-6).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-zinc-300">
                    <p className="font-semibold text-zinc-100">{entry.phase.replaceAll("_", " ")}</p>
                    {entry.winningChoiceLabel ? <p>Choice: {entry.winningChoiceLabel}</p> : null}
                    {entry.consequenceText ? <p className="line-clamp-3">{entry.consequenceText}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </SceneShell>
  );
}
