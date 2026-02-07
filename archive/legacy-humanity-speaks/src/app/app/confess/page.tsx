"use client";

import { useEffect, useMemo, useState } from "react";
import { usePremium } from "@/lib/use-premium";
import AdSlot from "@/components/AdSlot";

interface Confession {
  id: string;
  content: string;
  created_at: string;
  vote_score: number;
  boosted_until: string | null;
}

export default function ConfessPage() {
  const [prompt, setPrompt] = useState("What’s weighing on you today?");
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [archive, setArchive] = useState<Confession[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const premium = usePremium();

  useEffect(() => {
    fetch("/api/confessions")
      .then((res) => res.json())
      .then((data) => setConfessions(data.confessions ?? []));
    fetch("/api/confessions/prompt")
      .then((res) => res.json())
      .then((data) => setPrompt(data.prompt ?? "What’s weighing on you today?"));
  }, []);

  useEffect(() => {
    if (!premium) return;
    fetch("/api/confessions/archive")
      .then((res) => res.json())
      .then((data) => setArchive(data.confessions ?? []));
  }, [premium]);

  const sorted = useMemo(() => {
    return [...confessions].sort((a, b) => {
      const boostedA = a.boosted_until ? new Date(a.boosted_until).getTime() : 0;
      const boostedB = b.boosted_until ? new Date(b.boosted_until).getTime() : 0;
      if (boostedA !== boostedB) return boostedB - boostedA;
      return b.vote_score - a.vote_score;
    });
  }, [confessions]);

  async function submitConfession() {
    if (!content.trim()) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/confessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (res.ok) {
      setConfessions((prev) => [data.confession, ...prev]);
      setContent("");
      setMessage("Confession posted.");
    } else {
      setMessage(data.error || "Unable to post confession.");
    }
    setLoading(false);
  }

  async function vote(id: string, value: number) {
    const res = await fetch(`/api/confessions/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote_value: value }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setConfessions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, vote_score: data.vote_score } : item))
    );
  }

  async function flag(id: string) {
    const res = await fetch(`/api/confessions/${id}/flag`, { method: "POST" });
    if (!res.ok) return;
    setConfessions((prev) => prev.filter((item) => item.id !== id));
  }

  async function share(id: string) {
    const url = `${window.location.origin}/share/confession/${id}`;
    await navigator.clipboard.writeText(url);
    setMessage("Share link copied.");
  }

  async function boost(id: string) {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "boost", confession_id: id }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  async function upgrade() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "premium" }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="glass card">
        <div className="section-title">Premium</div>
        <p className="mt-2 text-lg">Go ad-free, submit extra confessions, and unlock archives.</p>
        <button className="btn btn-primary mt-4" onClick={upgrade}>
          Upgrade to Premium
        </button>
      </div>

      <div className="glass card">
        <div className="section-title">Today’s prompt</div>
        <h2 className="mt-3 text-2xl">{prompt}</h2>
        <textarea
          className="input mt-4 min-h-[120px]"
          placeholder="Write a confession (anonymous)"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={submitConfession} disabled={loading}>
            {loading ? "Posting…" : "Post confession"}
          </button>
          {message && <span className="muted text-sm">{message}</span>}
        </div>
      </div>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CONFESS ?? ""} />

      <div className="grid gap-4">
        {sorted.map((confession) => (
          <article key={confession.id} className="glass card fade-in">
            <div className="flex items-center justify-between">
              <span className="badge">Verified Human</span>
              {confession.boosted_until && (
                <span className="text-xs text-amber-200">Boosted</span>
              )}
            </div>
            <p className="mt-4 text-lg">{confession.content}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button className="btn" onClick={() => vote(confession.id, 1)}>
                Upvote
              </button>
              <button className="btn" onClick={() => vote(confession.id, -1)}>
                Downvote
              </button>
              <button className="btn" onClick={() => flag(confession.id)}>
                Flag
              </button>
              <button className="btn" onClick={() => share(confession.id)}>
                Share
              </button>
              <button className="btn" onClick={() => boost(confession.id)}>
                Boost
              </button>
              <span className="muted text-sm">Score {confession.vote_score}</span>
            </div>
          </article>
        ))}
      </div>

      {premium && archive.length > 0 && (
        <div className="glass card">
          <div className="section-title">All-time confessions</div>
          <div className="mt-4 grid gap-3 text-sm">
            {archive.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 p-4">
                <p className="text-base">{item.content}</p>
                <p className="muted mt-2 text-xs">Score {item.vote_score}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
