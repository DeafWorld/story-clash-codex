"use client";

type TutorialOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export default function TutorialOverlay({ open, onClose }: TutorialOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="panel w-full max-w-xl space-y-5 border-cyan-400/30 p-6 sm:p-7">
        <h2 className="text-3xl font-black text-cyan-200">How Story Clash Works</h2>
        <ol className="space-y-3 text-zinc-100">
          <li className="rounded-xl border border-white/15 bg-black/30 p-3">
            <span className="block text-xs uppercase tracking-[0.2em] text-cyan-300">Step 1</span>
            Play a quick minigame to decide order and vibe.
          </li>
          <li className="rounded-xl border border-white/15 bg-black/30 p-3">
            <span className="block text-xs uppercase tracking-[0.2em] text-cyan-300">Step 2</span>
            Take turns making choices or writing your own.
          </li>
          <li className="rounded-xl border border-white/15 bg-black/30 p-3">
            <span className="block text-xs uppercase tracking-[0.2em] text-cyan-300">Step 3</span>
            Survive the story and see how it all ends.
          </li>
        </ol>

        <button type="button" className="btn btn-primary w-full py-4 text-lg font-semibold" onClick={onClose}>
          Got it - Start Demo
        </button>
      </section>
    </div>
  );
}
