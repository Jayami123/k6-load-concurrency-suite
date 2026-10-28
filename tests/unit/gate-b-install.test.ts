import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The candidate (B) checkouts of ab-cal and ab-medusa get the same pin checks, install and build cache as the A side. The workflow
// has no YAML parser in this repo, so the jobs and steps are read as text: a job starts at a two-space key, a step at "      - ".
const WORKFLOW = readFileSync(".github/workflows/gate.yml", "utf8");

function jobOf(name: string): string {
  const start = WORKFLOW.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `${name} is a job`);
  const next = WORKFLOW.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return WORKFLOW.slice(start, next === -1 ? undefined : start + 1 + next);
}

function stepsOf(job: string): string[] {
  return job.split(/\n(?=      - )/).slice(1);
}

function stepNamed(job: string, fragment: string): string {
  const found = stepsOf(job).filter(
    (step) => step.includes(`- name: ${fragment}`) || step.includes(`- name: "${fragment}`),
  );
  assert.equal(found.length, 1, `exactly one step named ${fragment}`);
  return found[0]!;
}

function indexOfStep(job: string, fragment: string): number {
  return stepsOf(job).findIndex((step) => step.includes(fragment));
}

const MEDUSA_B = [
  "Verify the candidate Medusa fork HEAD and the pnpm pin (B",
  "Restore pnpm store cache (B",
  "Install Medusa dependencies (B",
  "Restore Medusa build cache (B",
];
const CAL_B = [
  "Verify the candidate Cal fork HEAD and the yarn pin (B",
  "Restore Cal Yarn cache (B",
  "Restore Cal node_modules cache (B",
  "Install Cal dependencies (B",
  "Generate Cal Prisma client (B",
  "Prepare the candidate Cal product .env (B",
  "Restore Cal build cache (B",
];

describe("a/b candidate install: no ref bump", () => {
  it("runs no candidate install or cache step on a Medusa ref bump only", () => {
    const job = jobOf("ab-medusa");
    for (const name of MEDUSA_B) {
      assert.match(
        stepNamed(job, name),
        /if: \$\{\{ needs\.detect\.outputs\.medusa_bump == 'true' &&/,
        `${name} is gated on the Medusa ref bump`,
      );
    }
  });

  it("runs no candidate install or cache step on a Cal ref bump only", () => {
    const job = jobOf("ab-cal");
    for (const name of CAL_B) {
      assert.match(
        stepNamed(job, name),
        /if: \$\{\{ needs\.detect\.outputs\.cal_bump == 'true' &&/,
        `${name} is gated on the Cal ref bump`,
      );
    }
  });

  it("keeps the B arms on the base products root when there is no bump", () => {
    const medusa = jobOf("ab-medusa");
    const cal = jobOf("ab-cal");
    const medusaRoot =
      "PRODUCTS_ROOT: ${{ needs.detect.outputs.medusa_bump == 'true' && format('{0}/products-b', github.workspace) || format('{0}/products', github.workspace) }}";
    const calRoot =
      "PRODUCTS_ROOT: ${{ needs.detect.outputs.cal_bump == 'true' && format('{0}/products-b', github.workspace) || format('{0}/products', github.workspace) }}";
    assert.equal(
      medusa.split(medusaRoot).length - 1,
      3,
      "three B arms of medusa fall back to products",
    );
    assert.equal(cal.split(calRoot).length - 1, 3, "three B arms of cal fall back to products");
  });
});

describe("a/b candidate install: ref bump", () => {
  it("installs the Medusa candidate in products-b with the lockfile, before the first B start", () => {
    const job = jobOf("ab-medusa");
    const install = stepNamed(job, "Install Medusa dependencies (B");
    assert.match(install, /working-directory: products-b\/medusa-dtc-starter/);
    assert.match(install, /pnpm install --frozen-lockfile/);
    assert.ok(
      indexOfStep(job, "Install Medusa dependencies (B") <
        indexOfStep(job, "A/B switch 2 (B, medusa"),
      "the install runs before the first B start",
    );
    assert.ok(
      indexOfStep(job, "Check out the candidate Medusa ref") <
        indexOfStep(job, "Install Medusa dependencies (B"),
      "the candidate checkout runs before the install",
    );
  });

  it("installs the Cal candidate in products-b with yarn --immutable, before the first B start", () => {
    const job = jobOf("ab-cal");
    const install = stepNamed(job, "Install Cal dependencies (B");
    assert.match(install, /working-directory: products-b\/cal/);
    assert.match(install, /yarn install --immutable/);
    assert.ok(
      indexOfStep(job, "Install Cal dependencies (B") < indexOfStep(job, "A/B switch 2 (B, cal"),
      "the install runs before the first B start",
    );
    assert.ok(
      indexOfStep(job, "Check out the candidate Cal ref") <
        indexOfStep(job, "Install Cal dependencies (B"),
      "the candidate checkout runs before the install",
    );
  });

  it("checks the pinned package managers and the candidate HEAD before installing", () => {
    const medusa = stepNamed(jobOf("ab-medusa"), "Verify the candidate Medusa fork HEAD");
    assert.match(medusa, /10\.11\.1/);
    assert.match(medusa, /MEDUSA_REF_B_EXPECTED: \$\{\{ needs\.detect\.outputs\.medusa_ref_b \}\}/);
    const cal = stepNamed(jobOf("ab-cal"), "Verify the candidate Cal fork HEAD");
    assert.match(cal, /4\.12\.0/);
    assert.match(cal, /CAL_REF_B_EXPECTED: \$\{\{ needs\.detect\.outputs\.cal_ref_b \}\}/);
  });

  it("keys the candidate pnpm store and build caches on the B ref", () => {
    const job = jobOf("ab-medusa");
    assert.match(
      stepNamed(job, "Restore pnpm store cache (B"),
      /key: \$\{\{ runner\.os \}\}-medusa-pnpm-\$\{\{ needs\.detect\.outputs\.medusa_ref_b \}\}-/,
    );
    assert.match(
      stepNamed(job, "Restore Medusa build cache (B"),
      /key: \$\{\{ runner\.os \}\}-medusa-build-\$\{\{ needs\.detect\.outputs\.medusa_ref_b \}\}-h0\.2\.15/,
    );
    const cal = jobOf("ab-cal");
    assert.match(
      stepNamed(cal, "Restore Cal build cache (B"),
      /key: \$\{\{ runner\.os \}\}-cal-next-\$\{\{ needs\.detect\.outputs\.cal_ref_b \}\}-h0\.2\.15/,
    );
    assert.match(
      stepNamed(cal, "Restore Cal node_modules cache (B"),
      /cal-nm-\$\{\{ needs\.detect\.outputs\.cal_ref_b \}\}/,
    );
  });

  it("gives the first B start a timeout that covers a cold build", () => {
    const medusa = stepNamed(jobOf("ab-medusa"), "A/B switch 2 (B, medusa");
    assert.match(medusa, /timeout-minutes: 12\n/);
    const cal = stepNamed(jobOf("ab-cal"), "A/B switch 2 (B, cal");
    assert.match(cal, /timeout-minutes: 60\n/);
  });

  it("gives every new candidate step its own timeout", () => {
    for (const [job, names] of [
      [jobOf("ab-medusa"), MEDUSA_B],
      [jobOf("ab-cal"), CAL_B],
    ] as const) {
      for (const name of names) {
        assert.match(
          stepNamed(job, name),
          /\n {8}timeout-minutes: \d+\n/,
          `${name} has timeout-minutes`,
        );
      }
    }
  });
});

describe("a/b job budgets", () => {
  it("leaves the ab-medusa and ab-cal job timeouts at 75 and 120 minutes", () => {
    assert.match(jobOf("ab-medusa"), /\n {4}timeout-minutes: 75\n/);
    assert.match(jobOf("ab-cal"), /\n {4}timeout-minutes: 120\n/);
  });
});
