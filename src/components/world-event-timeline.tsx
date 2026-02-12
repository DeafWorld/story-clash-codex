import clsx from "clsx";
import type { WorldTimelineEvent } from "../types/game";

type WorldEventTimelineProps = {
  events: WorldTimelineEvent[];
  compact?: boolean;
};

function severityStyle(severity: WorldTimelineEvent["severity"]) {
  if (severity === "critical") {
    return "border-red-300/50 bg-red-500/10 text-red-100";
  }
  if (severity === "high") {
    return "border-orange-300/45 bg-orange-500/10 text-orange-100";
  }
  if (severity === "medium") {
    return "border-yellow-300/45 bg-yellow-500/10 text-yellow-100";
  }
  return "border-cyan-300/35 bg-cyan-500/10 text-cyan-100";
}

export default function WorldEventTimeline({ events, compact = false }: WorldEventTimelineProps) {
  const visible = [...events].slice(-8).reverse();

  return (
    <section className={clsx("panel", compact ? "p-4" : "p-5")}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className={clsx("font-semibold", compact ? "text-lg" : "text-xl")}>World Event Timeline</h2>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-zinc-300">{events.length} events</span>
      </header>

      {!visible.length ? (
        <p className="text-sm text-zinc-400">No major world events yet. Pressure is building.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((event) => (
            <article
              key={event.id}
              className={clsx("rounded-xl border px-3 py-2 text-sm", severityStyle(event.severity))}
            >
              <p className="text-[11px] uppercase tracking-[0.16em] opacity-85">{event.type.replaceAll("_", " ")}</p>
              <p className="font-semibold">{event.title}</p>
              <p className="text-xs opacity-90">{event.detail}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
