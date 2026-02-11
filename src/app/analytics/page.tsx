import { getAnalyticsSnapshot } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const snapshot = getAnalyticsSnapshot();
  const counters = Object.entries(snapshot.counters).sort(([a], [b]) => a.localeCompare(b));
  const recent = snapshot.recent.slice(0, 50);

  return (
    <main className="page-shell">
      <div className="content-wrap space-y-6 py-6">
        <section className="panel p-5">
          <h1 className="text-2xl font-semibold">Runtime Analytics</h1>
          <p className="text-sm text-zinc-400">In-memory counters for key gameplay and sharing events.</p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-xl font-semibold">Counters</h2>
          <div className="space-y-2">
            {counters.length ? (
              counters.map(([event, count]) => (
                <div key={event} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                  <span className="font-mono text-sm">{event}</span>
                  <span className="text-cyan-300">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No events yet.</p>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-xl font-semibold">Recent Events</h2>
          <div className="space-y-2">
            {recent.length ? (
              recent.map((event, index) => (
                <article
                  key={`${event.at}-${event.name}-${index}`}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200"
                >
                  <p className="font-mono text-xs text-zinc-400">{event.at}</p>
                  <p className="font-semibold text-cyan-200">{event.name}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-zinc-300">
                    {JSON.stringify(event.properties)}
                  </pre>
                </article>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No recent events.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
