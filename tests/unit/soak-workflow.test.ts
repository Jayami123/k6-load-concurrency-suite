import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const TEXT = readFileSync(".github/workflows/soak.yml", "utf8");
const JOB_NAMES = ["cal-soak", "medusa-soak", "documenso-soak"];

/** The text of each job, keyed by its name (the lines under `jobs:` with two-space indentation). */
function jobsOf(text: string): Map<string, string> {
  const jobs = new Map<string, string>();
  const body = text.slice(text.indexOf("\njobs:\n") + "\njobs:\n".length);
  let name: string | null = null;
  let lines: string[] = [];
  for (const line of body.split("\n")) {
    const m = /^ {2}([a-z-]+):$/.exec(line);
    if (m) {
      if (name) jobs.set(name, lines.join("\n"));
      name = m[1]!;
      lines = [];
    } else if (name) {
      lines.push(line);
    }
  }
  if (name) jobs.set(name, lines.join("\n"));
  return jobs;
}

/** The largest number in a timeout value, so a `${{ ... && 165 || 45 }}` counts its 120-minute branch (the worst case). */
function worstMinutes(value: string): number {
  return Math.max(...[...value.matchAll(/\d+/g)].map((m) => Number(m[0])));
}

describe("soak workflow", () => {
  it("is dispatch-only from main, with the three product jobs and their if guards", () => {
    assert.match(TEXT, /^on:\n {2}workflow_dispatch:/m);
    assert.doesNotMatch(TEXT, /^ {2}schedule:/m);
    assert.match(TEXT, /must be dispatched from main/);
    const jobs = jobsOf(TEXT);
    assert.deepEqual([...jobs.keys()], JOB_NAMES);
    for (const [name, body] of jobs)
      assert.match(body, /^ {4}if: \$\{\{/m, `${name} has an if guard`);
  });

  it("gives every step a timeout, and each job's step caps leave at least 10 minutes", () => {
    for (const [name, body] of jobsOf(TEXT)) {
      const jobTimeout = worstMinutes(/^ {4}timeout-minutes: (.*)$/m.exec(body)![1]!);
      let stepSum = 0;
      for (const step of body.split(/^ {6}- /m).slice(1)) {
        const t = /^ {8}timeout-minutes: (.*)$/m.exec(step);
        assert.ok(t, `${name}: a step has no timeout-minutes: ${step.split("\n")[0]}`);
        stepSum += worstMinutes(t[1]!);
      }
      assert.ok(
        jobTimeout - stepSum >= 10,
        `${name}: step caps ${stepSum} leave less than 10 under ${jobTimeout}`,
      );
    }
  });

  it("pins every action by a full commit SHA, and keeps every upload for 90 days", () => {
    const uses = [...TEXT.matchAll(/uses: (\S+)/g)].map((m) => m[1]!);
    assert.ok(uses.length > 0);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} is not pinned by a full SHA`);
    const uploads = TEXT.split("uses: actions/upload-artifact@").slice(1);
    assert.equal(uploads.length, 3);
    for (const u of uploads) assert.match(u, /retention-days: 90/);
  });
});
