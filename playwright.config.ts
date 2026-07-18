import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:client -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    env: {
      VITE_SUPABASE_URL: "https://auth.example.test",
      VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
    },
    reuseExistingServer: !process.env.CI,
  },
});
