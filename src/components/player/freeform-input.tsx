"use client";

import { FormEvent, useState } from "react";

type FreeformInputProps = {
  disabled?: boolean;
  onSubmit: (text: string) => void;
};

export default function FreeformInput({ disabled, onSubmit }: FreeformInputProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <form className="panel space-y-2 p-4" onSubmit={handleSubmit}>
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-300">Custom suggestion</p>
      <textarea
        className="field min-h-[88px]"
        maxLength={200}
        placeholder="Pitch your own action (max 200 chars)"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">{text.length}/200</p>
        <button type="submit" className="btn btn-secondary" disabled={disabled || text.trim().length === 0}>
          Send Suggestion
        </button>
      </div>
    </form>
  );
}
