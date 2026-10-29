import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const WORKFLOW = readFileSync(".github/workflows/soak-release.yml", "utf8");

/** The job blocks of a workflow, keyed by job id (text lines between one job key and the next). */
function jobsOf(text: string): Map<string, string> {
  const jobs = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  let inJobs = false;
  for (const line of text.split("\n")) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const key = /^ {2}([a-z][a-z-]*):\s*$/.exec(line);
    if (key) {
      if (current !== null) jobs.set(current, buf.join("\n"));
      current = key[1] ?? "";
      buf = [];
      continue;
    }
    if (current !== null) buf.push(line);
  }
  if (current !== null) jobs.set(current, buf.join("\n"));
  return jobs;
}

/** The step blocks of one job: each starts at a line "      - ". */
function stepsOf(job: string): string[] {
  const at = job.indexOf("\n    steps:");
  if (at === -1) return [];
  return job
    .slice(at)
    .split(/\n(?= {6}- )/)
    .slice(1);
}

/** A job's timeout-minutes (at four spaces) and the sum of its step caps (at eight spaces). */
function budgetOf(job: string): { timeout: number; caps: number } {
  const timeout = Number(/\n {4}timeout-minutes: (\d+)/.exec(job)?.[1]);
  const caps = stepsOf(job).reduce((sum, step) => {
    const cap = /\n {8}timeout-minutes: (\d+)/.exec(step)?.[1];
    return sum + Number(cap ?? 0);
  }, 0);
  return { timeout, caps };
}

const JOBS = jobsOf(WORKFLOW);

describe("soak-release.yml: permissions, timeouts, triggers, concurrency and the upload order", () => {
  it("top-level permissions are contents: read; only publish has contents: write", () => {
    assert.match(WORKFLOW, /\npermissions:\n {2}contents: read\n/);
    for (const [id, job] of JOBS) {
      if (id === "publish") assert.match(job, / {6}contents: write/);
      else assert.doesNotMatch(job, /contents: write/, `${id} must not write contents`);
    }
    assert.match(JOBS.get("publish") ?? "", / {6}contents: write\n {6}actions: read/);
  });

  it("every step of soak-release.yml has timeout-minutes", () => {
    let steps = 0;
    for (const [id, job] of JOBS) {
      for (const step of stepsOf(job)) {
        steps += 1;
        assert.match(step, /\n {8}timeout-minutes: \d+/, `a step of ${id} has no timeout-minutes`);
      }
    }
    assert.ok(steps >= 15, `the workflow has ${steps} steps`);
  });

  it("C3: decide has margin 10 (15 minus 5), capture 11 (30 minus 19), publish 10 (25 minus 15)", () => {
    const expected: Record<string, { timeout: number; caps: number }> = {
      decide: { timeout: 15, caps: 5 },
      capture: { timeout: 30, caps: 19 },
      publish: { timeout: 25, caps: 15 },
    };
    for (const [id, want] of Object.entries(expected)) {
      const got = budgetOf(JOBS.get(id) ?? "");
      assert.deepEqual(got, want, `${id} budget`);
      assert.ok(got.timeout - got.caps >= 10, `${id} keeps a 10 min margin`);
    }
  });

  it("soak-release triggers on workflow_run of soak with branches [main]; no workflow-level concurrency; per-tag groups", () => {
    assert.match(
      WORKFLOW,
      /workflow_run:\n {4}workflows: \["soak"\]\n {4}types: \[completed\]\n {4}branches: \[main\]/,
    );
    assert.doesNotMatch(WORKFLOW, /^concurrency:/m);
    for (const id of ["capture", "publish"]) {
      const job = JOBS.get(id) ?? "";
      assert.match(
        job,
        /\n {4}concurrency:\n {6}group: soak-release-\$\{\{ needs\.decide\.outputs\.tag \}\}\n {6}cancel-in-progress: false/,
        `${id} concurrency`,
      );
    }
    assert.doesNotMatch(JOBS.get("decide") ?? "", /concurrency:/);
  });

  it("no --exit-code 0; the token scan and gitleaks run before the first upload; the release flags are set", () => {
    assert.doesNotMatch(WORKFLOW, /--exit-code 0/);
    const capture = JOBS.get("capture") ?? "";
    const publish = JOBS.get("publish") ?? "";
    const upload = capture.indexOf("name: Upload the summaries");
    assert.notEqual(upload, -1, "capture uploads the summaries");
    const scanAt = capture.indexOf('node scripts/evidence-token-scan.mjs "$RUNNER_TEMP/summaries"');
    const gitleaksAt = capture.indexOf('"$RUNNER_TEMP/gitleaks" dir "$RUNNER_TEMP/summaries"');
    assert.notEqual(scanAt, -1, "capture token-scans the summaries");
    assert.notEqual(gitleaksAt, -1, "capture runs gitleaks on the summaries");
    assert.ok(
      scanAt < upload && gitleaksAt < upload,
      "capture scans the summaries before it uploads them",
    );
    const create = publish.indexOf("gh release create");
    const handoffScan = publish.indexOf(
      'node scripts/evidence-token-scan.mjs "$RUNNER_TEMP/handoff"',
    );
    const handoffGitleaks = publish.indexOf('"$RUNNER_TEMP/gitleaks" dir "$RUNNER_TEMP/handoff"');
    assert.notEqual(handoffScan, -1, "publish token-scans the handoff");
    assert.notEqual(handoffGitleaks, -1, "publish runs gitleaks on the handoff");
    assert.ok(
      handoffScan < create && handoffGitleaks < create,
      "publish scans before it creates the release",
    );
    assert.match(publish, /gh release create "\$TAG" --draft --latest=false/);
    assert.match(publish, /gh release edit "\$TAG" --draft=false --latest=false/);
  });
});

describe("pages.yml reads the weekly soak releases", () => {
  const PAGES = readFileSync(".github/workflows/pages.yml", "utf8");
  const PAGES_JOBS = jobsOf(PAGES);

  it("workflow_run lists soak-release; build needs soak-summaries; build (margin 10) and soak-summaries (margin 11) keep C3; the deploy job is not asserted here", () => {
    assert.match(PAGES, /workflows: \["evidence-release", "soak-release"\]/);
    assert.match(PAGES_JOBS.get("build") ?? "", /\n {4}needs: soak-summaries\n/);
    assert.deepEqual(budgetOf(PAGES_JOBS.get("build") ?? ""), { timeout: 20, caps: 10 });
    assert.deepEqual(budgetOf(PAGES_JOBS.get("soak-summaries") ?? ""), { timeout: 20, caps: 9 });
    assert.ok(
      20 - budgetOf(PAGES_JOBS.get("build") ?? "").caps >= 10,
      "build keeps a 10 min margin",
    );
    assert.ok(
      20 - budgetOf(PAGES_JOBS.get("soak-summaries") ?? "").caps >= 10,
      "soak-summaries keeps a 10 min margin",
    );
  });
});
