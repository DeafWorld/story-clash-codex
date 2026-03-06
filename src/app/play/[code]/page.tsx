"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { apiFetch } from "../../../lib/api-client";
import { getSocketClient } from "../../../lib/socket-client";
import SceneShell from "../../../components/motion/scene-shell";
import SessionTopBar from "../../../components/session-top-bar";
import FormattedStoryBeat from "../../../components/player/formatted-story-beat";
import VoteInterface from "../../../components/player/vote-interface";
import FreeformInput from "../../../components/player/freeform-input";
import VoteReveal from "../../../components/player/vote-reveal";
import RealityRemembers from "../../../components/player/reality-remembers";
import type { GMSessionState, RoomView } from "../../../types/game";

type StateEnvelope = {
  roomCode: string;
  gmState: GMSessionState;
  snapshotVersion?: number;
  serverTimeMs?: number;
  tick?: number;
};

function votedStorageKey(roomCode: string, playerId: string, beatIndex: number) {
  return `story-clash:vote:${roomCode}:${playerId}:${beatIndex}`;
}

export default function PlayerPage() {
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

  const selfPlayer = useMemo(() => room?.players.find((player) => player.id === playerId) ?? null, [playerId, room?.players]);
  const playerNameById = useMemo(() => {
    const lookup: Record<string, string> = {};
    (room?.players ?? []).forEach((player) => {
      lookup[player.id] = player.name;
    });
    return lookup;
  }, [room?.players]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!gmState || gmState.gmPlayerId !== playerId) {
      return;
    }
    router.replace(`/gm/${code}?player=${playerId}`);
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
        setError(nextError instanceof Error ? nextError.message : "Unable to load room");
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
    if (!gmState) {
      return;
    }
    const selected = gmState.voteState.votesByPlayerId[playerId];
    const key = votedStorageKey(code, playerId, gmState.beatIndex);
    if (selected) {
      window.localStorage.setItem(key, selected);
      return;
    }
    window.localStorage.removeItem(key);
  }, [code, gmState, playerId]);

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
        const serverVote = payload.gmState.voteState.votesByPlayerId[playerId] ?? null;
        const cacheVote = window.localStorage.getItem(votedStorageKey(code, playerId, payload.gmState.beatIndex));
        if ((cacheVote ?? null) !== (serverVote ?? null)) {
          setToast("Session synced to live state.");
        }
      }
      setReconnecting(false);
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

  useEffect(() => {
    if (!reconnecting) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/game/${code}`);
        const data = (await response.json()) as RoomView | { error: string };
        if (!active || !response.ok || "error" in data) {
          return;
        }
        setRoom(data);
        setGmState(data.gmState);
        setReconnecting(false);
        setToast("Session synced to live state.");
      } catch {
        // keep polling until realtime reconnects
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1800);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [code, reconnecting]);

  function emit(event: string, payload: Record<string, unknown>) {
    getSocketClient().emit(event, {
      code,
      playerId,
      ...payload,
    });
  }

  function markReady() {
    emit("player_mark_ready", {});
  }

  function vote(choiceId: string) {
    emit("player_vote", { choiceId });
  }

  function submitFreeform(text: string) {
    emit("player_freeform", { text });
    setToast("Suggestion sent to GM");
  }

  if (!playerId) {
    return (
      <SceneShell className="page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Play" roomCode={code} />
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
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Play" roomCode={code} playerId={playerId} />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Joining session...</p>
        </div>
      </SceneShell>
    );
  }

  if (error || !room || !gmState) {
    return (
      <SceneShell className="page-with-top-bar">
        <SessionTopBar backHref="/" backLabel="Back Home" phaseLabel="Play" roomCode={code} playerId={playerId} />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel max-w-lg p-6">
            <p className="text-red-300">{error ?? "Session unavailable"}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => router.push(`/lobby/${code}?player=${playerId}`)}>
              Back to Lobby
            </button>
          </div>
        </div>
      </SceneShell>
    );
  }

  const readySet = new Set(gmState.readyState.readyPlayerIds);
  const isSelfReady = readySet.has(playerId);
  const selectedChoice = gmState.voteState.votesByPlayerId[playerId] ?? null;
  const lockedChoice = gmState.currentChoices.find((choice) => choice.id === gmState.voteState.lockedChoiceId) ?? null;
  const lockedVotes = lockedChoice ? gmState.voteState.countsByChoiceId[lockedChoice.id] ?? 0 : 0;
  const maxVoteSeconds =
    gmState.voteState.openedAt && gmState.voteState.deadlineAt
      ? Math.max(10, Math.round((gmState.voteState.deadlineAt - gmState.voteState.openedAt) / 1000))
      : 30;

  return (
    <SceneShell className="page-with-top-bar">
      <SessionTopBar
        backHref={`/lobby/${code}?player=${playerId}`}
        backLabel="Back to Lobby"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="Play"
        playerName={selfPlayer?.name}
      />

      <div className="content-wrap space-y-4">
        <section className="panel p-4">
          <p className="badge w-fit">Live Session</p>
          <h1 className="mt-2 text-2xl font-black">Story Clash</h1>
          <p className="mt-1 text-sm text-zinc-300">
            Beat {gmState.beatIndex} • Phase <span className="font-semibold text-cyan-200">{gmState.phase.replaceAll("_", " ")}</span>
          </p>
          {toast ? <p className="mt-2 text-xs text-cyan-200">{toast}</p> : null}
        </section>

        {reconnecting ? (
          <section className="panel p-4">
            <p className="text-sm font-semibold text-amber-200">Reconnecting...</p>
          </section>
        ) : null}

        <RealityRemembers line={room.realityRemembersLine ?? null} />

        {gmState.currentBeat ? <FormattedStoryBeat beat={gmState.currentBeat} /> : null}

        {(gmState.phase === "reading" || gmState.phase === "creating_choices") ? (
          <section className="panel space-y-3 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Reading phase</p>
            <p className="text-sm text-zinc-100">Read at your pace, then mark ready. Timer starts only after everyone is ready and choices open.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {gmState.readyState.requiredReadyIds.map((readyId) => (
                <div
                  key={readyId}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-xs",
                    readySet.has(readyId)
                      ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                      : "border-white/15 bg-black/30 text-zinc-300"
                  )}
                >
                  {playerNameById[readyId] ?? "Player"}: {readySet.has(readyId) ? "Ready" : "Reading"}
                </div>
              ))}
              <div
                className={clsx(
                  "rounded-lg border px-3 py-2 text-xs",
                  gmState.readyState.readyGm
                    ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                    : "border-white/15 bg-black/30 text-zinc-300"
                )}
              >
                GM: {gmState.readyState.readyGm ? "Ready" : "Reading"}
              </div>
            </div>
            <button type="button" className="btn btn-primary w-full" onClick={markReady} disabled={isSelfReady}>
              {isSelfReady ? "Waiting for Others..." : "Ready for Choices"}
            </button>
          </section>
        ) : null}

        {gmState.phase === "voting_open" ? (
          <section className="space-y-3">
            <VoteInterface
              choices={gmState.currentChoices}
              voteState={gmState.voteState}
              selfPlayerId={playerId}
              playerNameById={playerNameById}
              secondsLeft={secondsLeft}
              maxSeconds={maxVoteSeconds}
              onVote={vote}
            />
            <FreeformInput onSubmit={submitFreeform} />
          </section>
        ) : null}

        {gmState.phase === "vote_locked" ? (
          <section className="space-y-3">
            <VoteReveal choice={lockedChoice} votes={lockedVotes} />
            <section className="panel p-4 text-sm text-zinc-300">Vote locked. Waiting for GM consequence...</section>
          </section>
        ) : null}

        {gmState.phase === "writing_consequence" ? (
          <section className="panel space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Consequence</p>
            {gmState.currentOutcomeText ? (
              <p className="whitespace-pre-line text-sm text-zinc-100">{gmState.currentOutcomeText}</p>
            ) : (
              <p className="text-sm text-zinc-300">Waiting for GM to publish consequence...</p>
            )}
          </section>
        ) : null}

        {gmState.phase === "recap" ? (
          <button type="button" className="btn btn-primary w-full" onClick={() => router.push(`/recap/${code}?player=${playerId}`)}>
            Open Recap
          </button>
        ) : null}

        {selectedChoice ? (
          <p className="text-xs text-cyan-200">
            You voted for: <strong>{gmState.currentChoices.find((choice) => choice.id === selectedChoice)?.label ?? "choice"}</strong>
          </p>
        ) : null}
      </div>
    </SceneShell>
  );
}
