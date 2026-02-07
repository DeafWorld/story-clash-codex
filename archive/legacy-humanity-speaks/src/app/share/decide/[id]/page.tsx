import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

async function getQuestion(id: string) {
  const { data } = await supabaseAdmin
    .from("binary_questions")
    .select("question_text, option_a, option_b, votes_a, votes_b")
    .eq("id", id)
    .eq("hidden", false)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const question = await getQuestion(params.id);
  if (!question) return { title: "Humanity Speaks | Decide" };
  const total = question.votes_a + question.votes_b || 1;
  const pa = Math.round((question.votes_a / total) * 100);
  const pb = 100 - pa;
  const encoded = new URLSearchParams({
    question: question.question_text,
    a: question.option_a,
    b: question.option_b,
    pa: String(pa),
    pb: String(pb),
  }).toString();

  return {
    title: "Humanity Speaks | Decide",
    openGraph: {
      images: [`/api/og/decide?${encoded}`],
    },
  };
}

export default async function ShareDecidePage({ params }: { params: { id: string } }) {
  const question = await getQuestion(params.id);
  if (!question) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <div className="glass card">Decision not found.</div>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="badge">Humanity Speaks</div>
      <h1 className="text-3xl">{question.question_text}</h1>
      <div className="glass card">
        <p>{question.option_a} vs {question.option_b}</p>
      </div>
    </main>
  );
}
