"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="page-shell">
          <div className="content-wrap grid min-h-dvh place-items-center">
            <section className="panel w-full max-w-lg space-y-4 p-6 text-center">
              <h1 className="text-2xl font-semibold text-red-300">Unexpected error</h1>
              <p className="text-sm text-zinc-300">The issue has been recorded. Try refreshing this page.</p>
              <button type="button" className="btn btn-primary" onClick={() => reset()}>
                Retry
              </button>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}
