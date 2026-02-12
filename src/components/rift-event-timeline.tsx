"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import type { RiftEventRecord } from "../types/game";

type RiftEventTimelineProps = {
  events: RiftEventRecord[];
  title?: string;
};

export default function RiftEventTimeline({
  events,
  title = "Rift Events This Session",
}: RiftEventTimelineProps) {
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-2xl font-semibold">{title}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No Rift spikes this run. Keep pushing chaos to trigger surges and twists.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => (
            <motion.article
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.3) }}
              className={clsx(
                "rounded-xl border p-4",
                event.type === "scene_twist"
                  ? "border-red-300/45 bg-red-500/10"
                  : "border-cyan-300/45 bg-cyan-500/10"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{event.title}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">
                  Chaos {event.chaosLevel}%
                </p>
              </div>
              <p className="mt-2 text-sm text-zinc-100">{event.description}</p>
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}
