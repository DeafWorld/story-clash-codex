"use client";

import { useEffect, useState } from "react";
import AdSlot from "@/components/AdSlot";

interface AskQuestion {
  id: string;
  question_text: string;
  votes: number;
}

interface AskAnswer {
  id: string;
  answer_text: string;
  votes: number;
}

export default function AskPage() {
  const [active, setActive] = useState<AskQuestion | null>(null);
  const [answers, setAnswers] = useState<AskAnswer[]>([]);
  const [pending, setPending] = useState<AskQuestion[]>([]);
  const [premiumTrending, setPremiumTrending] = useState<AskQuestion[]>([]);
  const [premium, setPremium] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/ask/questions");
      const data = await res.json();
      setActive(data.active_question ?? null);
      setPending(data.pending_questions ?? []);
      setAnswers(data.answers ?? []);
      setPremium(Boolean(data.premium));
      setPremiumTrending(data.premium_trending ?? []);
    };
    load();
  }, []);

  async function submitQuestion() {
    if (!questionText.trim()) return;
    const res = await fetch("/api/ask/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_text: questionText }),
    });
    const data = await res.json();
    if (res.ok) {
      setPending((prev) => [data.question, ...prev]);
      setQuestionText("");
      setMessage("Question submitted.");
    } else {
      setMessage(data.error || "Unable to submit question.");
    }
  }

  async function voteQuestion(id: string) {
    const res = await fetch(`/api/ask/questions/${id}/vote`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setPending((prev) => prev.map((q) => (q.id === id ? { ...q, votes: data.votes } : q)));
  }

  async function submitAnswer() {
    if (!active || !answerText.trim()) return;
    const res = await fetch(`/api/ask/questions/${active.id}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer_text: answerText }),
    });
    const data = await res.json();
    if (res.ok) {
      setAnswers((prev) => [data.answer, ...prev]);
      setAnswerText("");
    } else {
      setMessage(data.error || "Unable to submit answer.");
    }
  }

  async function voteAnswer(id: string, value: number) {
    const res = await fetch(`/api/ask/answers/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote_value: value }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, votes: data.votes } : a)));
  }

  async function flagAnswer(id: string) {
    const res = await fetch(`/api/ask/answers/${id}/flag`, { method: "POST" });
    if (!res.ok) return;
    setAnswers((prev) => prev.filter((a) => a.id !== id));
  }

  async function flagQuestion(id: string) {
    const res = await fetch(`/api/ask/questions/${id}/flag`, { method: "POST" });
    if (!res.ok) return;
    setPending((prev) => prev.filter((q) => q.id !== id));
  }

  async function shareAnswer(id: string) {
    const url = `${window.location.origin}/share/answer/${id}`;
    await navigator.clipboard.writeText(url);
    setMessage("Share link copied.");
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
        <div className="section-title">Question of the week</div>
        <h2 className="mt-3 text-2xl">{active?.question_text ?? "No active question yet."}</h2>
        {active && (
          <div className="mt-4">
            <textarea
              className="input min-h-[100px]"
              placeholder="Answer once per human"
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
            />
            <button className="btn btn-primary mt-3" onClick={submitAnswer}>
              Submit answer
            </button>
          </div>
        )}
        {message && <p className="mt-2 text-sm text-red-300">{message}</p>}
      </div>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ASK ?? ""} />

      {answers.length > 0 && (
        <div className="grid gap-4">
          {answers.map((answer) => (
            <article key={answer.id} className="glass card">
              <p className="text-lg">{answer.answer_text}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className="btn" onClick={() => voteAnswer(answer.id, 1)}>
                  Upvote
                </button>
                <button className="btn" onClick={() => voteAnswer(answer.id, -1)}>
                  Downvote
                </button>
                <button className="btn" onClick={() => flagAnswer(answer.id)}>
                  Flag
                </button>
                <button className="btn" onClick={() => shareAnswer(answer.id)}>
                  Share
                </button>
                <span className="muted text-sm">Score {answer.votes}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {premium ? (
        premiumTrending.length > 0 && (
          <div className="glass card">
            <div className="section-title">Trending next (Premium)</div>
            <div className="mt-4 grid gap-3">
              {premiumTrending.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 p-4">
                  <p className="text-base">{item.question_text}</p>
                  <p className="muted mt-2 text-xs">Votes {item.votes}</p>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="glass card">
          <div className="section-title">Premium preview</div>
          <p className="mt-2 text-sm muted">Unlock early access to trending questions.</p>
          <button className="btn btn-primary mt-3" onClick={upgrade}>
            Upgrade to Premium
          </button>
        </div>
      )}

      <div className="glass card">
        <div className="section-title">Submit a new question</div>
        <textarea
          className="input mt-3 min-h-[100px]"
          placeholder="Ask the world"
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
        />
        <button className="btn btn-primary mt-3" onClick={submitQuestion}>
          Submit question
        </button>
      </div>

      <div className="grid gap-4">
        {pending.map((question) => (
          <article key={question.id} className="glass card">
            <p className="text-lg">{question.question_text}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn" onClick={() => voteQuestion(question.id)}>
                Vote to promote
              </button>
              <button className="btn" onClick={() => flagQuestion(question.id)}>
                Flag
              </button>
              <span className="muted text-sm">Votes {question.votes}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
