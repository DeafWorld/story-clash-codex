import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_WLD_APP_ID: "app_test",
      NEXT_PUBLIC_WLD_ACTION: "action_test",
      WORLD_ID_APP_ID: "app_test",
      WORLD_ID_ACTION: "action_test",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test",
      AUTH_SECRET: "test-secret",
    },
  },
});
