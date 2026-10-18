import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1480, height: 960 },
    launchOptions: {
      executablePath:
        process.env.CANOPY_BROWSER ||
        (existsSync("/opt/brave.com/brave/brave")
          ? "/opt/brave.com/brave/brave"
          : undefined),
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:web",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
