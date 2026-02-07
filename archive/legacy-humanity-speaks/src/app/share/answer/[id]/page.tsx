import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

async function getAnswer(id: string) {
  const { data } = await supabaseAdmin
    .from("ask_answers")
    .select("answer_text, ask_questions(question_text)")
    .eq("id", id)
    .eq("hidden", false)
    .maybeSingle();
  return data as { answer_text: string; ask_questions?: { question_text: string } } | null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const answer = await getAnswer(params.id);
  if (!answer) return { title: "Humanity Speaks | Answer" };
  const question = answer.ask_questions?.question_text ?? "Ask";
  const encoded = new URLSearchParams({
    question,
    answer: answer.answer_text,
  }).toString();

  return {
    title: "Humanity Speaks | Answer",
    openGraph: {
      images: [`/api/og/answer?${encoded}`],
    },
  };
}

export default async function ShareAnswerPage({ params }: { params: { id: string } }) {
  const answer = await getAnswer(params.id);
  if (!answer) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <div className="glass card">Answer not found.</div>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="badge">Humanity Speaks</div>
      <h1 className="text-3xl">{answer.ask_questions?.question_text ?? "Question"}</h1>
      <div className="glass card">
        <p>{answer.answer_text}</p>
      </div>
    </main>
  );
}
