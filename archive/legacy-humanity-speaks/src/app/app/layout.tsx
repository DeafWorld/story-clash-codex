import TabNav from "@/components/TabNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="badge w-fit">Humanity Speaks</div>
            <h1 className="mt-4 text-3xl md:text-4xl">One human, one voice.</h1>
            <p className="muted mt-2 max-w-xl text-sm">
              Confess, decide, and ask with the world’s verified human network.
            </p>
          </div>
          <div className="glass card">
            <div className="section-title">Mode</div>
            <p className="mt-2 text-lg">Global Pulse</p>
            <p className="muted text-xs">Verified-only access</p>
          </div>
        </div>
        <TabNav />
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-16">
        {children}
      </main>
    </div>
  );
}
