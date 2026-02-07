"use client";

import { useEffect, useState } from "react";
import AdSlot from "@/components/AdSlot";

interface BinaryQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  votes_a: number;
  votes_b: number;
}

interface SponsoredOrder {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  tier: number;
  status: string;
  binary_questions?: { votes_a: number; votes_b: number } | null;
}

export default function DecidePage() {
  const [question, setQuestion] = useState<BinaryQuestion | null>(null);
  const [choice, setChoice] = useState<"a" | "b" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({ question_text: "", option_a: "", option_b: "" });
  const [sponsor, setSponsor] = useState({
    question_text: "",
    option_a: "",
    option_b: "",
    tier: 199,
  });
  const [orders, setOrders] = useState<SponsoredOrder[]>([]);

  useEffect(() => {
    fetch("/api/decide/today")
      .then((res) => res.json())
      .then((data) => setQuestion(data.question ?? null));
    fetch("/api/sponsor/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders ?? []));
  }, []);

  async function vote(selected: "a" | "b") {
    if (!question) return;
    const res = await fetch("/api/decide/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: question.id, choice: selected }),
    });
    const data = await res.json();
    if (res.ok) {
      setQuestion(data.question);
      setChoice(selected);
    } else {
      setMessage(data.error || "Unable to vote.");
    }
  }

  async function submitQuestion() {
    if (!draft.question_text || !draft.option_a || !draft.option_b) return;
    const res = await fetch("/api/decide/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (res.ok) {
      setDraft({ question_text: "", option_a: "", option_b: "" });
      setMessage("Question submitted for review.");
    } else {
      setMessage(data.error || "Unable to submit question.");
    }
  }

  async function share() {
    if (!question) return;
    const url = `${window.location.origin}/share/decide/${question.id}`;
    await navigator.clipboard.writeText(url);
    setMessage("Share link copied.");
  }

  async function flag() {
    if (!question) return;
    const res = await fetch(`/api/decide/questions/${question.id}/flag`, { method: "POST" });
    if (!res.ok) return;
    setMessage("Thanks for flagging.");
  }

  async function sponsorQuestion() {
    if (!sponsor.question_text || !sponsor.option_a || !sponsor.option_b) return;
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sponsored", ...sponsor }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  if (!question) {
    return (
      <div className="glass card">
        <p>Loading today’s decision…</p>
      </div>
    );
  }

  const total = question.votes_a + question.votes_b || 1;
  const percentA = Math.round((question.votes_a / total) * 100);
  const percentB = 100 - percentA;

  return (
    <section className="flex flex-col gap-6">
      <div className="glass card">
        <div className="section-title">Today’s decision</div>
        <h2 className="mt-3 text-3xl">{question.question_text}</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn btn-primary" onClick={() => vote("a")}>
            {question.option_a}
          </button>
          <button className="btn" onClick={() => vote("b")}>
            {question.option_b}
          </button>
          <button className="btn" onClick={share}>
            Share results
          </button>
          <button className="btn" onClick={flag}>
            Flag
          </button>
        </div>
        {choice && (
          <p className="muted mt-3 text-sm">You chose option {choice.toUpperCase()}.</p>
        )}
        {message && <p className="mt-2 text-sm text-red-300">{message}</p>}
      </div>

      <div className="glass card">
        <div className="section-title">Global split</div>
        <div className="mt-4 grid gap-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>{question.option_a}</span>
              <span>{percentA}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[var(--aqua)]" style={{ width: `${percentA}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>{question.option_b}</span>
              <span>{percentB}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[var(--pulse-2)]" style={{ width: `${percentB}%` }} />
            </div>
          </div>
        </div>
      </div>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DECIDE ?? ""} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass card">
          <div className="section-title">Submit a question</div>
          <input
            className="input mt-3"
            placeholder="Question"
            value={draft.question_text}
            onChange={(event) => setDraft({ ...draft, question_text: event.target.value })}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="Option A"
              value={draft.option_a}
              onChange={(event) => setDraft({ ...draft, option_a: event.target.value })}
            />
            <input
              className="input"
              placeholder="Option B"
              value={draft.option_b}
              onChange={(event) => setDraft({ ...draft, option_b: event.target.value })}
            />
          </div>
          <button className="btn btn-primary mt-4" onClick={submitQuestion}>
            Submit for queue
          </button>
        </div>

        <div className="glass card">
          <div className="section-title">Sponsor a question</div>
          <p className="muted mt-2 text-sm">
            Self-serve brand placement with 24h featured slot.
          </p>
          <input
            className="input mt-3"
            placeholder="Question"
            value={sponsor.question_text}
            onChange={(event) => setSponsor({ ...sponsor, question_text: event.target.value })}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="input"
              placeholder="Option A"
              value={sponsor.option_a}
              onChange={(event) => setSponsor({ ...sponsor, option_a: event.target.value })}
            />
            <input
              className="input"
              placeholder="Option B"
              value={sponsor.option_b}
              onChange={(event) => setSponsor({ ...sponsor, option_b: event.target.value })}
            />
          </div>
          <select
            className="input mt-3"
            value={sponsor.tier}
            onChange={(event) => setSponsor({ ...sponsor, tier: Number(event.target.value) })}
          >
            <option value={99}>Starter $99</option>
            <option value={199}>Growth $199</option>
            <option value={499}>Global $499</option>
          </select>
          <button className="btn btn-primary mt-4" onClick={sponsorQuestion}>
            Checkout sponsorship
          </button>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="glass card">
          <div className="section-title">Your sponsored questions</div>
          <div className="mt-4 grid gap-3 text-sm">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-white/10 p-4">
                <div className="text-base">{order.question_text}</div>
                <div className="muted mt-2">
                  {order.option_a} / {order.option_b} · Tier ${order.tier} · {order.status}
                </div>
                {order.binary_questions && (
                  <div className="muted text-xs">
                    Votes {order.binary_questions.votes_a} / {order.binary_questions.votes_b}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
