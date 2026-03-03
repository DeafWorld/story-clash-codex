import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "cloudflare/tests/**/*.test.ts"],
    // macOS 26 + Node 20 has intermittent child-process stalls with forked workers.
    // Threads keep test execution deterministic and unblock local/CI gates.
    pool: "threads",
    minWorkers: 1,
  },
});
