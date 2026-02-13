import clsx from "clsx";
import type { DirectorBeatRecord } from "../types/game";

type DirectorBeatTimelineProps = {
  beats: DirectorBeatRecord[];
};

function beatStyle(beat: DirectorBeatRecord["beatType"]) {
  if (beat === "payoff") {
    return "border-cyan-300/45 bg-cyan-500/10 text-cyan-100";
  }
  if (beat === "fracture") {
    return "border-red-300/55 bg-red-500/12 text-red-100";
  }
  if (beat === "escalation") {
    return "border-orange-300/45 bg-orange-500/10 text-orange-100";
  }
  if (beat === "cooldown") {
    return "border-blue-300/35 bg-blue-500/10 text-blue-100";
  }
  return "border-white/20 bg-black/25 text-zinc-100";
}

export default function DirectorBeatTimeline({ beats }: DirectorBeatTimelineProps) {
  const visible = [...beats].slice(-10).reverse();

  return (
    <section className="panel space-y-3 p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Director Beat Timeline</h2>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-zinc-300">{beats.length} beats</span>
      </header>
      {!visible.length ? (
        <p className="text-sm text-zinc-400">No director beats captured yet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((beat) => (
            <article key={beat.id} className={clsx("rounded-xl border px-3 py-2 text-sm", beatStyle(beat.beatType))}>
              <p className="text-[11px] uppercase tracking-[0.16em] opacity-90">{beat.beatType}</p>
              <p className="text-xs opacity-85">
                Intensity {beat.intensity}% • {beat.pressureBand.replaceAll("_", " ")} • {beat.effectProfile.replaceAll("_", " ")}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
