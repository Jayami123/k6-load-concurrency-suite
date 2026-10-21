import { defineConfig } from "@playwright/test";
import { documensoBaseUrlFromEnv } from "./src/documenso/env.ts";
import { calBaseUrlFromEnv, medusaBaseUrlFromEnv } from "./src/races/env.ts";

export default defineConfig({
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  // "list" stays on stdout. The JSON file feeds the CI job summary (scripts/write-ci-job-summary.ts).
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.P6_PLAYWRIGHT_JSON ?? "results/playwright/local.json" }],
  ],
  timeout: 60_000,
  projects: [
    {
      name: "medusa-race",
      testDir: "tests/medusa/races",
      retries: 0,
      use: { baseURL: medusaBaseUrlFromEnv() },
    },
    {
      name: "cal-race",
      testDir: "tests/cal/races",
      retries: 0,
      use: { baseURL: calBaseUrlFromEnv() },
    },
    {
      name: "documenso-race",
      testDir: "tests/documenso/races",
      retries: 0,
      use: { baseURL: documensoBaseUrlFromEnv() },
    },
  ],
});
