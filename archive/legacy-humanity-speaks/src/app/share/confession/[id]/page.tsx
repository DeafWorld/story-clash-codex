import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

async function getConfession(id: string) {
  const { data } = await supabaseAdmin
    .from("confessions")
    .select("content")
    .eq("id", id)
    .eq("hidden", false)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const confession = await getConfession(params.id);
  const text = confession?.content ?? "A verified human shared a confession.";
  const encoded = encodeURIComponent(text);
  return {
    title: "Humanity Speaks | Confession",
    openGraph: {
      images: [`/api/og/confession?text=${encoded}`],
    },
  };
}

export default async function ShareConfessionPage({ params }: { params: { id: string } }) {
  const confession = await getConfession(params.id);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="badge">Humanity Speaks</div>
      <h1 className="text-3xl">Verified confession</h1>
      <p className="glass card text-lg">{confession?.content ?? "Confession not found."}</p>
    </main>
  );
}
