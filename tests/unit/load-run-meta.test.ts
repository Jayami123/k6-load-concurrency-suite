import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRunMeta,
  isPublishable,
  parseHarnessPin,
  validateRunMeta,
} from "../../src/load/run-meta.ts";
import type { LoadCase, RunMeta } from "../../src/load/types.ts";

const caseDef: LoadCase = {
  id: "P6-X-LOAD-001",
  title: "t",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 40, durationSec: 30, maxLatencyMs: 1600 },
    full: { rate: 40, durationSec: 60, maxLatencyMs: 1600 },
  },
  runs: () => [],
};
const profile = caseDef.profiles.pr;
const os = { nproc: 4, memTotalMb: 16000, platform: "linux", arch: "x64", node: "v22.23.3" };
const sha = "a".repeat(40);
const ciEnv = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "push",
  GITHUB_WORKFLOW: "perf",
  GITHUB_REF_NAME: "main",
  GITHUB_SHA: sha,
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "Jayami123/k6-load-concurrency-suite",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  ImageOS: "ubuntu24",
  ImageVersion: "20261012.334.1",
  RUNNER_OS: "Linux",
  RUNNER_ARCH: "X64",
};
const build = (env: NodeJS.ProcessEnv, extra: Partial<Parameters<typeof buildRunMeta>[0]> = {}) =>
  buildRunMeta({
    caseDef,
    profileName: "pr",
    profile,
    runId: "r1",
    startedAt: new Date("2026-10-24T01:02:03Z"),
    env,
    k6Version: "2.3.0",
    os,
    readHarnessPin: () => "v0.2.14",
    gitSha: () => undefined,
    ...extra,
  });

describe("run meta", () => {
  it("builds the GitHub Actions environment from the environment", () => {
    const m = build(ciEnv);
    assert.equal(m.environment.kind, "github-actions");
    assert.equal(m.environment.event, "push");
    assert.equal(
      m.environment.runUrl,
      "https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/123",
    );
    assert.equal(m.environment.attempt, 1);
    assert.equal(m.environment.runnerImage, "ubuntu24");
    assert.equal(m.environment.runnerOs, "Linux");
  });

  it("builds a local environment without a run URL", () => {
    const m = build({});
    assert.equal(m.environment.kind, "local");
    assert.equal(m.environment.runUrl, undefined);
    assert.equal(m.environment.runnerImage, "local");
  });

  it("a missing ImageVersion is recorded as unknown", () => {
    const { ImageVersion: _unused, ...env } = ciEnv;
    assert.equal(build(env).environment.imageVersion, "unknown");
  });

  it("product SHAs come from the *_REF variables, else from git", () => {
    const fromEnv = build({ ...ciEnv, MEDUSA_REF: sha });
    assert.equal(fromEnv.software.products.medusa, sha);
    const fromGit = build(
      {},
      { gitSha: (folder) => (folder === "cal" ? "b".repeat(40) : undefined) },
    );
    assert.equal(fromGit.software.products.cal, "b".repeat(40));
    assert.equal(fromGit.software.products.medusa, undefined);
  });

  it("the harness tag is parsed from the package.json pin", () => {
    const pkg = JSON.stringify({
      dependencies: { "qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.14" },
    });
    assert.equal(parseHarnessPin(pkg), "v0.2.14");
    assert.equal(parseHarnessPin("{}"), "unknown");
  });

  it("isPublishable is true for a main push with a known image", () => {
    const m = build({ ...ciEnv, MEDUSA_REF: sha });
    assert.deepEqual(isPublishable(m), { ok: true, reasons: [] });
  });

  it("isPublishable is false for a local run, a pull request and a feature branch", () => {
    assert.equal(isPublishable(build({})).ok, false);
    assert.equal(isPublishable(build({ ...ciEnv, GITHUB_EVENT_NAME: "pull_request" })).ok, false);
    assert.equal(isPublishable(build({ ...ciEnv, GITHUB_REF_NAME: "feat/x" })).ok, false);
  });

  it("validateRunMeta rejects a secret-shaped value", () => {
    const m = build(ciEnv) as RunMeta & { note?: string };
    m.note = "api_ABCDEFGH1234";
    assert.throws(() => validateRunMeta(m), /secret-shaped value/);
  });
});

describe("run meta label", () => {
  it("a knee case records its own label, not the functional one", () => {
    const knee = {
      ...caseDef,
      id: "P6-CAL-LOAD-005",
      label: "knee range, environment-bound" as const,
    };
    const meta = buildRunMeta({
      caseDef: knee,
      profileName: "pr",
      profile,
      runId: "r1",
      startedAt: new Date("2026-10-24T01:02:03Z"),
      env: {},
      k6Version: "2.3.0",
      os,
      readHarnessPin: () => "v0.2.14",
      gitSha: () => undefined,
    });
    assert.equal(meta.label, "knee range, environment-bound");
  });
});
