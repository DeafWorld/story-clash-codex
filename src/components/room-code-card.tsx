import type { ReactNode } from "react";

type PlayerCard = {
  id: string;
  name: string;
};

type RoomCodeCardProps = {
  code: string;
  players: PlayerCard[];
  title?: string;
  actions?: ReactNode;
};

export default function RoomCodeCard({ code, players, title = "Room", actions }: RoomCodeCardProps) {
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">{title}</p>
          <p className="text-4xl font-black tracking-[0.2em] text-cyan-300">{code}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => (
          <span
            key={player.id}
            className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-semibold text-zinc-100"
          >
            {player.name}
          </span>
        ))}
      </div>
    </section>
  );
}
