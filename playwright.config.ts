import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${process.env.PORT ?? 3100}`,
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: "retain-on-failure",
  },
  reporter: "list",
});
