import { defineConfig } from "@playwright/test";
import { documensoBaseUrlFromEnv } from "./src/documenso/env.ts";
import { calBaseUrlFromEnv, medusaBaseUrlFromEnv } from "./src/races/env.ts";
import { twentyBaseUrlFromEnv } from "./src/twenty/env.ts";

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
    {
      // Reads the audit of the P6-DOC-LOAD-007 run written by the LOAD step (no server needed).
      name: "documenso-load-known",
      testDir: "tests/documenso/load",
      retries: 0,
    },
    {
      name: "documenso-api",
      testDir: "tests/documenso/api",
      retries: 0,
      use: { baseURL: documensoBaseUrlFromEnv() },
    },
    {
      name: "twenty-race",
      testDir: "tests/twenty/races",
      retries: 0,
      use: { baseURL: twentyBaseUrlFromEnv() },
    },
    {
      name: "twenty-tw-races",
      testDir: "tests/twenty/tw-races",
      retries: 0,
      use: { baseURL: twentyBaseUrlFromEnv() },
    },
    {
      name: "twenty-tw-obs",
      testDir: "tests/twenty/tw-obs",
      retries: 0,
      use: { baseURL: twentyBaseUrlFromEnv() },
    },
  ],
});
