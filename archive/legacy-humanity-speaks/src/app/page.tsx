import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import VerifyCard from "@/components/VerifyCard";

export default async function HomePage() {
  const session = await getSessionUser();
  if (session) {
    redirect("/app/confess");
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-6">
          <div className="badge w-fit">Humanity Speaks</div>
          <h1 className="text-4xl md:text-6xl">
            The verified human network for confessions, decisions, and questions.
          </h1>
          <p className="muted max-w-2xl text-lg">
            One app. Three modes. Every voice is a real human. Post anonymously, vote globally, and
            surface the questions the world wants answered.
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="glass card max-w-sm">
              <h3 className="text-xl">Confess</h3>
              <p className="muted text-sm">
                Drop one anonymous confession per day. The crowd decides what rises.
              </p>
            </div>
            <div className="glass card max-w-sm">
              <h3 className="text-xl">Decide</h3>
              <p className="muted text-sm">
                Answer the daily binary question and see the global split in real time.
              </p>
            </div>
            <div className="glass card max-w-sm">
              <h3 className="text-xl">Ask</h3>
              <p className="muted text-sm">
                Vote the best community questions into the spotlight and answer once per human.
              </p>
            </div>
          </div>
        </header>
        <VerifyCard />
      </div>
    </main>
  );
}
