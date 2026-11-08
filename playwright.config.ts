import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { assertTestDatabase } from "./scripts/test-database.mjs";

config({ quiet: true });

const PORT = 3200;
const TEST_DATABASE_URL = assertTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  // Journeys share one seeded database, so files run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      testMatch: ["**/accessibility.spec.ts", "**/buyer.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.CI ? `npx next start --port ${PORT}` : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      STORAGE_DIR: ".data/test-uploads",
      APP_URL: `http://localhost:${PORT}`,
      DELIVERY_PROVIDER: "manual",
      GROUPBASKET_E2E: "1",
    },
  },
});
