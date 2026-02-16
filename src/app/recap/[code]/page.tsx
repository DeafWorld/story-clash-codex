"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSocketClient } from "../../../lib/socket-client";
import { apiFetch } from "../../../lib/api-client";
import { trackEvent } from "../../../lib/analytics";
import Typewriter from "../../../components/typewriter";
import NarratorBanner from "../../../components/narrator-banner";
import RiftStatusCard from "../../../components/rift-status-card";
import RiftEventTimeline from "../../../components/rift-event-timeline";
import WorldEventTimeline from "../../../components/world-event-timeline";
import DirectorBeatTimeline from "../../../components/director-beat-timeline";
import SceneShell from "../../../components/motion/scene-shell";
import LottieStinger from "../../../components/motion/lottie-stinger";
import { getDemoEndingText, getDemoSession, getDemoStoryTree, initDemoRoom } from "../../../lib/demo-session";
import SessionTopBar from "../../../components/session-top-bar";
import type { EndingType, RecapPayload } from "../../../types/game";

function endingLabel(type: EndingType) {
  if (type === "triumph") {
    return "Victory";
  }
  if (type === "survival") {
    return "Narrowly Escaped";
  }
  return "Game Over";
}

type DemoRecapProps = {
  code: string;
};

function DemoRecap({ code }: DemoRecapProps) {
  const router = useRouter();
  const session = getDemoSession();
  const story = getDemoStoryTree();

  return (
    <SceneShell cue={session.directedScene?.motionCue ?? null} className="page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref="/"
        backLabel="Back Home"
        roomCode={code}
        playerId="demo-host"
        showInvite
        isDemo
        phaseLabel="Recap"
        playerName="Host"
      />
      <div className="content-wrap space-y-6">
        <section className="panel space-y-2 p-5">
          <p className="badge w-fit">Recap Phase</p>
          <h1 className="text-2xl font-black sm:text-3xl">Session Debrief</h1>
          <p className="text-sm text-zinc-300">Review every major call, every Rift spike, and who delivered under pressure.</p>
        </section>
        <NarratorBanner line={session.latestNarration ?? null} />
        <section className="panel space-y-4 p-6 text-center">
          <p className="badge mx-auto">Demo Complete</p>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{story.title} (Demo)</p>
          <Typewriter text={getDemoEndingText()} charsPerSecond={20} />
          <p className="mx-auto w-fit rounded-full border border-cyan-300/60 px-4 py-2 text-lg font-bold text-cyan-300">
            Demo Complete
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-2xl font-semibold">How your story unfolded</h2>
          <p className="mb-4 text-sm text-zinc-400">Each step shows the scene and the action you took.</p>
          <div className="max-h-[48dvh] space-y-3 overflow-y-auto pr-2 [scroll-snap-type:y_mandatory]">
            {session.history.map((entry, index) => (
              <motion.article
                key={`${entry.sceneId}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-xl border border-white/15 bg-black/30 p-4 [scroll-snap-align:start]"
                aria-label={`Scene ${index + 1}, ${entry.playerName} chose ${entry.choiceLabel}`}
              >
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Scene {index + 1}</p>
                <p className="mt-1 text-sm text-zinc-300">{entry.sceneText.slice(0, 120)}...</p>
                <p className="mt-2 text-sm">
                  <strong>{entry.playerName}</strong> chose: <span className="text-cyan-300">{entry.choiceLabel}</span>
                </p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <RiftStatusCard
            genrePower={session.genrePower}
            chaosLevel={session.chaosLevel}
            activeEvent={session.activeRiftEvent}
          />
          <DirectorBeatTimeline beats={session.directorTimeline ?? []} />
          <RiftEventTimeline events={session.riftHistory} />
          <WorldEventTimeline events={session.worldState.timeline} />
          {session.latestWorldEvent ? (
            <div className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-100">
              Latest shift: <strong>{session.latestWorldEvent.title}</strong> - {session.latestWorldEvent.detail}
            </div>
          ) : null}
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="text-xl font-semibold">Living Rift Snapshot</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(session.worldState.resources).map(([resource, state]) => (
              <div key={resource} className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm">
                <p className="uppercase tracking-[0.16em] text-zinc-400">{resource}</p>
                <p className="font-semibold">{state.amount}</p>
                <p className="text-xs text-zinc-400">Trend: {state.trend}</p>
              </div>
            ))}
          </div>
          {session.activeThreadId ? (
            <p className="text-sm text-cyan-300">Active narrative thread: {session.activeThreadId}</p>
          ) : null}
        </section>

        <section className="panel space-y-3 p-5">
          <h2 className="text-xl font-semibold">Player Archetypes</h2>
          <div className="space-y-2">
            {Object.entries(session.playerProfiles).map(([profileId, profile]) => {
              const displayName = session.players.find((player) => player.id === profileId)?.name ?? profileId;
              return (
                <div key={profileId} className="rounded-xl border border-white/15 bg-black/20 p-3 text-sm">
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-zinc-300">{profile.archetypes.primary}</p>
                  <p className="text-xs text-zinc-500">
                    Risk {Math.round(profile.traits.riskTaking)} | Coop {Math.round(profile.traits.cooperation)} | Morality{" "}
                    {Math.round(profile.traits.morality)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-5">
          <div className="mb-3 h-14 w-full">
            <LottieStinger assetId="share_success" className="mx-auto h-14 w-14" loop={false} autoplay />
          </div>
          <button
            type="button"
            className="btn btn-primary w-full py-4 text-lg font-semibold sm:text-xl"
            onClick={() => {
              initDemoRoom();
              router.push("/");
            }}
          >
            Back to Home
          </button>
          <p className="mt-2 text-center text-xs text-zinc-500">Room: {code}</p>
        </section>
      </div>
    </SceneShell>
  );
}

type RealtimeRecapProps = {
  code: string;
  playerId: string;
};

function RealtimeRecap({ code, playerId }: RealtimeRecapProps) {
  const router = useRouter();
  const socialCardEnabled = process.env.NEXT_PUBLIC_ENABLE_SOCIAL_CARD !== "0";

  const [recap, setRecap] = useState<RecapPayload | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [shareImageUrl, setShareImageUrl] = useState<string>("");
  const [narrationText, setNarrationText] = useState<string>("");

  const safeWorldState = recap?.worldState ?? {
    resources: {
      food: { amount: 0, trend: "stable" },
      medicine: { amount: 0, trend: "stable" },
      ammunition: { amount: 0, trend: "stable" },
      fuel: { amount: 0, trend: "stable" },
    },
    tensions: {
      food_shortage: 0,
      faction_conflict: 0,
      external_threat: 0,
      morale_crisis: 0,
      disease_outbreak: 0,
    },
  };
  const safeProfiles = recap?.playerProfiles ?? {};
  const safeActiveThreadId = recap?.activeThreadId ?? null;

  useEffect(() => {
    let mounted = true;

    async function loadRecap() {
      try {
        const response = await apiFetch(`/api/recap/${code}`);
        const data = (await response.json()) as RecapPayload | { error: string };
        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "Recap unavailable");
        }

        if (mounted) {
          setRecap(data);
          setNarrationText(data.latestNarration?.text ?? "");
          window.setTimeout(() => setShowTimeline(true), 5000);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Could not load recap");
        }
      }
    }

    void loadRecap();

    return () => {
      mounted = false;
    };
  }, [code]);

  useEffect(() => {
    const socket = getSocketClient();
    socket.emit("join_room", { code, playerId });

    const onNarratorUpdate = (payload: { line?: { text?: string } }) => {
      if (payload?.line?.text) {
        setNarrationText(payload.line.text);
      }
    };

    const onSessionRestarted = () => {
      router.push(`/lobby/${code}?player=${playerId}`);
    };

    socket.on("narrator_update", onNarratorUpdate);
    socket.on("session_restarted", onSessionRestarted);
    return () => {
      socket.off("narrator_update", onNarratorUpdate);
      socket.off("session_restarted", onSessionRestarted);
    };
  }, [code, playerId, router]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const shareText = useMemo(() => {
    if (!recap) {
      return "";
    }
    const narratorOneLiner = narrationText || recap.latestNarration?.text || "The story kept escalating.";
    return `We just played Story Clash!\nStory: ${recap.storyTitle ?? "Unknown Story"}\nEnding: ${endingLabel(recap.endingType)}\n${narratorOneLiner}\nMVP: ${recap.mvp.player}`;
  }, [narrationText, recap]);

  useEffect(() => {
    if (!recap || !socialCardEnabled) {
      return;
    }
    let mounted = true;

    async function loadShareUrl() {
      try {
        const response = await apiFetch(`/api/share/recap/${code}`);
        const data = (await response.json()) as { shareUrl?: string; imageUrl?: string };
        if (!response.ok || !data.shareUrl) {
          return;
        }
        if (mounted) {
          setShareUrl(data.shareUrl);
          setShareImageUrl(data.imageUrl ?? "");
        }
      } catch {
        // Share URL can fail safely; button falls back to local URL.
      }
    }

    void loadShareUrl();
    return () => {
      mounted = false;
    };
  }, [code, recap, socialCardEnabled]);

  const shareToXUrl = useMemo(() => {
    const u = shareUrl || (typeof window !== "undefined" ? window.location.href : "");
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(u)}`;
  }, [shareText, shareUrl]);
  const shareToWhatsAppUrl = useMemo(() => {
    const u = shareUrl || (typeof window !== "undefined" ? window.location.href : "");
    return `https://wa.me/?text=${encodeURIComponent(shareText + "\n" + u)}`;
  }, [shareText, shareUrl]);

  async function copyShare() {
    const url = shareUrl || window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Story Clash Recap",
          text: shareText,
          url,
        });
        trackEvent("recap_shared", { code, method: "native" });
        setToast("Shared");
        return;
      } catch {
        // Fall back to clipboard.
      }
    }
    await navigator.clipboard.writeText(`${shareText}\n${url}`);
    trackEvent("recap_shared", { code, method: "clipboard" });
    setToast("Copied! Share with friends");
  }

  async function copyLinkOnly() {
    const url = shareUrl || window.location.href;
    await navigator.clipboard.writeText(url);
    trackEvent("recap_shared", { code, method: "copy_link" });
    setToast("Link copied");
  }

  async function shareCardImage() {
    if (!shareImageUrl) {
      setToast("Card still loading");
      return;
    }

    try {
      const response = await fetch(shareImageUrl);
      if (!response.ok) {
        throw new Error("Card download failed");
      }
      const blob = await response.blob();
      const file = new File([blob], `story-clash-${code}.png`, { type: "image/png" });
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Story Clash Card",
          text: shareText,
          files: [file],
        });
        trackEvent("recap_shared", { code, method: "native_image" });
        setToast("Card shared");
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `story-clash-${code}.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      trackEvent("recap_shared", { code, method: "image_download" });
      setToast("Card downloaded");
    } catch {
      window.open(shareImageUrl, "_blank", "noopener,noreferrer");
      trackEvent("recap_shared", { code, method: "image_open" });
      setToast("Opened share card");
    }
  }

  function playAgain() {
    trackEvent("play_again_clicked", { code, playerId });
    getSocketClient().emit("restart_session", { code, playerId });
  }

  if (error) {
    return (
      <SceneShell cue={null} className="page-with-top-bar">
        <SessionTopBar
          backHref="/"
          backLabel="Back Home"
          phaseLabel="Recap"
          playerId={playerId}
          playerName={playerId || undefined}
        />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <div className="panel p-6">
            <p className="text-red-300">{error}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => router.push("/")}>
              Home
            </button>
          </div>
        </div>
      </SceneShell>
    );
  }

  if (!recap) {
    return (
      <SceneShell cue={null} className="page-with-top-bar">
        <SessionTopBar
          backHref="/"
          backLabel="Back Home"
          phaseLabel="Recap"
          playerId={playerId}
          playerName={playerId || undefined}
        />
        <div className="content-wrap grid min-h-dvh place-items-center">
          <p>Loading recap...</p>
        </div>
      </SceneShell>
    );
  }

  return (
    <SceneShell cue={recap.directedScene?.motionCue ?? null} className="page-with-top-bar">
      <div className="suspense-wash" aria-hidden />
      <SessionTopBar
        backHref="/"
        backLabel="Back Home"
        roomCode={code}
        playerId={playerId}
        showInvite
        phaseLabel="Recap"
        playerName={playerId || undefined}
      />
      <div className="content-wrap space-y-6">
        <section className="panel space-y-2 p-5">
          <p className="badge w-fit">Recap Phase</p>
          <h1 className="text-2xl font-black sm:text-3xl">How The Night Ended</h1>
          <p className="text-sm text-zinc-300">Share the timeline, compare outcomes, then run it back with the same room.</p>
        </section>
        <NarratorBanner line={recap.latestNarration} />
        <section className="panel space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{recap.storyTitle ?? "Unknown Story"}</p>
          <Typewriter text={recap.endingScene.text} charsPerSecond={20} />
          <p className="mx-auto w-fit rounded-full border border-cyan-300/60 px-4 py-2 text-lg font-bold text-cyan-300">
            {endingLabel(recap.endingType)}
          </p>
        </section>

        {showTimeline ? (
          <section className="space-y-4">
            <section className="panel p-5">
            <h2 className="mb-3 text-2xl font-semibold">How your story unfolded</h2>
            <div className="max-h-[48dvh] space-y-3 overflow-y-auto pr-2 [scroll-snap-type:y_mandatory]">
              {recap.history.map((entry, index) => (
                <motion.article
                  key={`${entry.sceneId}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl border border-white/15 bg-black/30 p-4 [scroll-snap-align:start]"
                  aria-label={`Scene ${index + 1}, ${entry.player} chose ${entry.choice}`}
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Scene {index + 1}</p>
                  <p className="mt-1 text-sm text-zinc-300">{entry.sceneText.slice(0, 120)}...</p>
                  <p className="mt-2 text-sm">
                    <strong>{entry.player}</strong> chose:{" "}
                    <span className="text-cyan-300">{entry.choice}</span>
                  </p>
                </motion.article>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-yellow-300/50 bg-yellow-300/10 p-4">
              <p className="font-semibold">{recap.mvp.player} was MVP</p>
              <p className="text-sm text-zinc-200">{recap.mvp.reason}</p>
            </div>
            </section>

            <RiftStatusCard
              genrePower={recap.genrePower}
              chaosLevel={recap.chaosLevel}
              activeEvent={recap.riftHistory.at(-1) ?? null}
            />
            <DirectorBeatTimeline beats={recap.directorTimeline ?? []} />
            <RiftEventTimeline events={recap.riftHistory} />
            <WorldEventTimeline events={recap.worldState?.timeline ?? []} />
            {recap.latestWorldEvent ? (
              <div className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-100">
                Latest shift: <strong>{recap.latestWorldEvent.title}</strong> - {recap.latestWorldEvent.detail}
              </div>
            ) : null}

            <section className="panel space-y-4 p-5">
              <h2 className="text-xl font-semibold">Living Rift Snapshot</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(safeWorldState.resources).map(([resource, state]) => (
                  <div key={resource} className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm">
                    <p className="uppercase tracking-[0.16em] text-zinc-400">{resource}</p>
                    <p className="font-semibold">{state.amount}</p>
                    <p className="text-xs text-zinc-400">Trend: {state.trend}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(safeWorldState.tensions).map(([tension, value]) => (
                  <div key={tension} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-zinc-300">
                    {tension.replaceAll("_", " ")}: <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {safeActiveThreadId ? (
                <p className="text-sm text-cyan-300">Active narrative thread: {safeActiveThreadId}</p>
              ) : null}
            </section>

            <section className="panel space-y-3 p-5">
              <h2 className="text-xl font-semibold">Player Archetypes</h2>
              <div className="space-y-2">
                {Object.entries(safeProfiles).map(([playerEntryId, profile]) => {
                  const displayName =
                    recap.history.find((entry) => entry.playerId === playerEntryId)?.playerName ??
                    recap.history.find((entry) => entry.playerId === playerEntryId)?.player ??
                    playerEntryId;
                  return (
                    <div key={playerEntryId} className="rounded-xl border border-white/15 bg-black/20 p-3 text-sm">
                      <p className="font-semibold">{displayName}</p>
                      <p className="text-zinc-300">{profile.archetypes.primary}</p>
                      <p className="text-xs text-zinc-500">
                        Risk {Math.round(profile.traits.riskTaking)} | Coop {Math.round(profile.traits.cooperation)} | Morality{" "}
                        {Math.round(profile.traits.morality)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>
        ) : null}

        <section className="panel flex flex-col gap-4 p-5">
          <p className="text-center text-sm font-medium text-cyan-200">
            You survived (or didn’t). Share the story.
          </p>
          <div className="mx-auto h-14 w-14">
            <LottieStinger assetId="share_success" className="h-14 w-14" loop={false} autoplay />
          </div>
          <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary flex-1 min-w-[140px] py-3 text-lg" onClick={copyShare}>
            Share Story
          </button>
          <button type="button" className="btn btn-secondary min-w-[120px] py-3" onClick={copyLinkOnly}>
            Copy link
          </button>
          {socialCardEnabled ? (
            <button
              type="button"
              className="btn btn-secondary min-w-[130px] py-3"
              onClick={shareCardImage}
              disabled={!shareImageUrl}
            >
              Share Card Image
            </button>
          ) : null}
          <a
            href={shareToXUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary min-w-[120px] py-3 text-center"
            onClick={() => trackEvent("recap_shared", { code, method: "twitter" })}
          >
            Share to X
          </a>
          <a
            href={shareToWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary min-w-[120px] py-3 text-center"
            onClick={() => trackEvent("recap_shared", { code, method: "whatsapp" })}
          >
            WhatsApp
          </a>
          </div>
          <button type="button" className="btn btn-secondary w-full py-3" onClick={playAgain}>
            Play Again with Same Crew
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push("/")}>
            Exit
          </button>
        </section>

        {toast ? <p className="text-sm text-cyan-300">{toast}</p> : null}
      </div>
    </SceneShell>
  );
}

export default function RecapPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code.toUpperCase();
  const playerId = searchParams.get("player") ?? "";

  if (code === "DEMO1") {
    return <DemoRecap code={code} />;
  }

  return <RealtimeRecap code={code} playerId={playerId} />;
}
