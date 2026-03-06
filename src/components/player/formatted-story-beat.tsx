"use client";

import { motion } from "framer-motion";
import { formatIntoBeats, getIconForSpeaker } from "../../lib/beat-format";
import type { StoryBeat } from "../../types/game";

type FormattedStoryBeatProps = {
  beat: StoryBeat;
};

export default function FormattedStoryBeat({ beat }: FormattedStoryBeatProps) {
  const visualBeats = beat.visualBeats.length ? beat.visualBeats : formatIntoBeats(beat.rawText);

  return (
    <section className="gm-story-beat panel space-y-3 p-4 sm:p-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          {beat.icon} {beat.title}
        </p>
        <p className="text-sm text-zinc-300">{beat.location}</p>
      </header>

      <div className="space-y-2">
        {visualBeats.map((entry, index) => {
          if (entry.type === "separator") {
            return (
              <div key={`${entry.type}-${index}`} className="text-center text-zinc-500">
                ━━━
              </div>
            );
          }

          if (entry.type === "dialogue") {
            return (
              <motion.div
                key={`${entry.type}-${index}`}
                className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-50"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                <span className="font-semibold">
                  {entry.icon ?? getIconForSpeaker(entry.speaker)} {entry.speaker ? `${entry.speaker}:` : "Voice:"}
                </span>{" "}
                <span>{entry.content}</span>
              </motion.div>
            );
          }

          if (entry.type === "action") {
            return (
              <motion.p
                key={`${entry.type}-${index}`}
                className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-2 text-sm italic text-fuchsia-100"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                {entry.content}
              </motion.p>
            );
          }

          return (
            <motion.p
              key={`${entry.type}-${index}`}
              className="text-[1.02rem] leading-relaxed text-zinc-100"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
            >
              {entry.content}
            </motion.p>
          );
        })}
      </div>
    </section>
  );
}
