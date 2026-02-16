"use client";

import clsx from "clsx";
import type { Choice } from "../types/game";

type ChoicePersonality = NonNullable<Choice["personality"]>;

function inferPersonality(label: string): ChoicePersonality {
  const source = label.toLowerCase();
  if (/(scan|check|inspect|decode|trace|study|investigate|signal)/i.test(source)) {
    return "analytical";
  }
  if (/(barricade|wait|hide|seal|defend|secure|hold)/i.test(source)) {
    return "defensive";
  }
  if (/(forgive|rescue|help|protect|save|trust)/i.test(source)) {
    return "empathetic";
  }
  if (/(hijack|steal|betray|rush|charge|ignite|leap)/i.test(source)) {
    return "chaotic";
  }
  if (/(deal|bargain|trade|offer|use)/i.test(source)) {
    return "opportunistic";
  }
  return "brave";
}

function personalityTheme(personality: ChoicePersonality) {
  if (personality === "analytical") {
    return { icon: "◇", tint: "text-cyan-200", border: "border-cyan-300/40", fill: "bg-cyan-500/10" };
  }
  if (personality === "defensive") {
    return { icon: "▣", tint: "text-emerald-200", border: "border-emerald-300/40", fill: "bg-emerald-500/10" };
  }
  if (personality === "empathetic") {
    return { icon: "◍", tint: "text-violet-200", border: "border-violet-300/40", fill: "bg-violet-500/10" };
  }
  if (personality === "chaotic") {
    return { icon: "✶", tint: "text-rose-200", border: "border-rose-300/45", fill: "bg-rose-500/12" };
  }
  if (personality === "opportunistic") {
    return { icon: "◈", tint: "text-amber-200", border: "border-amber-300/45", fill: "bg-amber-500/12" };
  }
  return { icon: "◆", tint: "text-cyan-100", border: "border-white/20", fill: "bg-black/25" };
}

function personalityLabel(personality: ChoicePersonality): string {
  if (personality === "analytical") return "Analytical";
  if (personality === "defensive") return "Defensive";
  if (personality === "empathetic") return "Empathetic";
  if (personality === "chaotic") return "Chaotic";
  if (personality === "opportunistic") return "Opportunistic";
  return "Brave";
}

function inferStakes(label: string, personality: ChoicePersonality): string {
  if (personality === "analytical") {
    return "Reveals hidden truth, but costs time.";
  }
  if (personality === "defensive") {
    return "Safer now, riskier later.";
  }
  if (personality === "empathetic") {
    return "Builds trust, may invite danger.";
  }
  if (personality === "chaotic") {
    return "Fast momentum, high fallout.";
  }
  if (personality === "opportunistic") {
    return "Potential edge with moral cost.";
  }
  if (/(run|sprint|leap|jump|charge|rush)/i.test(label)) {
    return "High speed decision, high exposure.";
  }
  return "Commits the crew to a hard path.";
}

export type MobileChoiceCardProps = {
  choice: Choice;
  onSelect: () => void;
  disabled?: boolean;
  locked?: boolean;
};

export default function MobileChoiceCard({ choice, onSelect, disabled = false, locked = false }: MobileChoiceCardProps) {
  const label = choice.label ?? choice.text ?? "Continue";
  const personality = choice.personality ?? inferPersonality(label);
  const theme = personalityTheme(personality);
  const persona = personalityLabel(personality);
  const stakes = choice.stakes ?? inferStakes(label, personality);
  const detail = choice.fullText ?? label;

  return (
    <button
      type="button"
      className={clsx(
        "w-full rounded-2xl border px-4 py-4 text-left transition active:scale-[0.985] md:py-5",
        "min-h-[92px] sm:min-h-[100px]",
        theme.border,
        theme.fill,
        disabled ? "cursor-not-allowed opacity-55" : "hover:border-cyan-300/60 hover:bg-cyan-500/10"
      )}
      onClick={onSelect}
      disabled={disabled}
      aria-label={`Choose ${label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-white sm:text-lg">{label}</p>
        <span className={clsx("text-xs font-semibold uppercase tracking-[0.16em]", theme.tint)}>
          {theme.icon}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-300">{detail}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-400">Stakes: {stakes}</span>
        <span className={clsx("font-semibold uppercase tracking-[0.14em]", theme.tint)}>
          {locked ? "Choice locked" : "Tap to lock"}
        </span>
      </div>
      <p className={clsx("mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]", theme.tint)}>
        Persona signal: {persona}
      </p>
    </button>
  );
}
