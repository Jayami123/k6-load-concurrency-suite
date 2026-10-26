# P6 Phase 4b Task 11: A/A noise and tolerance (`P6-RULE-004`, the A/A half of `P6-X-LOAD-003`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 646 to 671 (Task 11), D5 (line 816), D13 (line 835), D16 (line 846), Note 2 (line 260). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `e27ad5a`. Probe date 2026-10-25 (UTC), cloud VM (4 vCPU, 15 GB). **VM timings prove that a step works; none is a published number or a target.**

## 1. Header

- **Task and roadmap line:** Phase 4b Task 11, roadmap lines 646 to 671.
- **Cases:** `P6-RULE-004` (no A/B configuration without a cited A/A set), the A/A half of `P6-X-LOAD-003`. Priority: none in the roadmap.
- **Build branch pattern:** `feat/<build date>-p6-aa-noise`.
- **Unit-test delta:** **+10 against B0 1025** (`main` at `e27ad5a`). With Task 6 merged first (+36): B = 1061, expected **1071**.
- **Stop for owner review: yes.** A new dispatch workflow `gate.yml` (shared CI, rule B10), the tolerance file (a threshold, D13), and the decision on the tolerance rule (Q-TOLRULE, §13).

## 2. What it proves

- A regression is called only above the noise measured on the same runner, with the same code: an A/A set of at least three interleaved arms per product.
- The tolerance is derived by a written rule from data, and every tolerance cites the run IDs it came from (`P6-RULE-004`).
- Only the steady profile (50 % of the knee lower bound) sets the tolerance (L3): knee or near-knee noise is not noise, it is the product's own saturation.
- Transfer: a change-control board in a bank or a validated-system release in healthcare compares a candidate with its own measured variation, not with one number.

## 3. Live probe evidence

Probes were run with the harness scripts only; one stack at a time; no workflow dispatched.

| #   | Roadmap probe item                                                | Command or source                                                                                                                                               | Output (trimmed)                                                                                                                                                                            | Value it sets                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | Arm duration and count that fit one job; the spread of short arms | `npm run up:medusa` then three runs of `node scripts/load/run-load.ts --case P6-MED-LOAD-001 --profile full` (30 s, rate 1 per second), one stack, fresh volume | three arms, each `VALID PASS`, **46 s wall each**; iterations 30, 31, 30; dropped 0; p95 **902.4**, **609.0**, **764.9 ms**                                                                 | a 30-s arm has about 30 iterations and a run-to-run p95 spread of **(902 − 609) / 765 = 38 %** of the median: too noisy to set a tolerance. The arms must be the 120-s steady profile (Q-ARMLEN, §13)                                                                                                                                       |
| A-2 | Stack restart time (between arms)                                 | `npm run down:medusa && npm run up:medusa` (run M-3 of Task 7 and the later restarts of this session)                                                           | Medusa up in **28 s** (cached images and build), **43 s** with two backends and Redis (Task 10 M10-1), **100 s** cold on the first start                                                    | a restart between A/A arms costs 30 to 100 s; the A/A set can run on one stack (arms interleaved on the same stack, the cheaper choice)                                                                                                                                                                                                     |
| A-3 | Cal next build time, cold (no cache on the VM) and with a cache   | `npm run up:cal` (background, `UP_EXIT` in the log)                                                                                                             | exit 0 in **421 s** total; the `next build` compiled in **98 s** (the Turbo `@calcom/trpc` and `db-seed` steps dominate the rest); **cache: none available on the VM**                      | the cold Cal start is 7.0 min; with the Phase 1 build cache (`cal-next-${CAL_REF}-h…` in `perf.yml`, the `Restore Cal build cache` step of `knee.yml`) the start is expected faster: **confirm in the first CI dispatch**                                                                                                                   |
| A-4 | Steady-profile spread on the runner (the source of the tolerance) | `k6/thresholds/baseline-band.json` (Task 5, three VALID runs per product)                                                                                       | Cal p95 run-level **54.1 / 79.8 / 82.6 ms** (min / median / max): spread **(82.6 − 54.1) / 79.8 = 36 %**. Medusa p95 **214.5 / 220.6 / 220.8 ms**: spread **(220.8 − 214.5) / 220.6 = 3 %** | the two products differ by a factor of about twelve in run-to-run spread; a single tolerance rule must handle both (§6.2)                                                                                                                                                                                                                   |
| A-5 | Cal steady run as one A arm                                       | `node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady` (Task 8 row C8-3)                                                                       | VALID, 147 s; run-level p50 **88.3 ms**, p95 **115.3 ms**, p99 209.0 ms (`k6-main-summary.json`), 480 iterations, dropped 0                                                                 | one Cal arm costs 147 s; a 3-arm A/A set is 7.4 min plus the start. **The p95 is above the Task 5 band (54.1 to 82.6 ms)**: this arm ran straight after a cold stack start (A-3), so the first arm of a stack is a warm-up outlier. **Rule: the A/A set starts with one discarded warm-up arm** (§6.3), recorded in the set and not counted |
| A-6 | The `P6-RULE-004` check can be a unit test                        | `grep -n "tolerance" package.json` (none) and `tests/unit/` (no tolerance test on main)                                                                         | nothing on main yet                                                                                                                                                                         | the check is NEW (§6.5)                                                                                                                                                                                                                                                                                                                     |

### 3.1 What the probe could not confirm

1. The A/A set on the runner: **UNPROBED; confirm in the first `gate.yml` dispatch** (three VALID arms per product, interleaved).
2. Runner-to-runner difference (the gate is same-runner only, roadmap probe item): **UNPROBED**; the gate never compares two runners.
3. The steady arms at 120 s on the VM for both products in one job: partly probed (A-5 for Cal; the Medusa 120-s steady run is M-3 of Task 7, 139 s). **Confirm in the first dispatch.**

## 4. Depends on

Main at `e27ad5a`, verified:

- Task 5 (merged): `k6/thresholds/baseline-band.json` (`P6-CAL-LOAD-003`, `P6-MED-LOAD-002`, the run IDs and the spread), `src/load/baseline-band.ts`, `src/load/knee/bounds.ts` (`steadyRateFor`), `k6/thresholds/knee-bounds.json` (Cal 8, Medusa 1.5).
- `src/load/medians.ts` (`selectPublishable`, `medianOf`, `runIdOf`), `src/load/smoke-baseline.ts` (`selectSmokeRuns`): the run-selection rules (dispatch or schedule on `main`, GitHub run id, VALID, PASS).
- `src/load/stub-server.ts` (the stub for the gate self-test, Task 12).
- `k6/cases/cal-load-003.js` and `k6/cases/med-load-002.js` (the steady cases, the rate input), `scripts/write-baseline-band.ts` (the band writer, copied for the tolerance writer).
- `perf.yml` (dispatch group `perf-${{ schedule && 'nightly' || dispatch && run_id || ref }}`, PR #63), `knee.yml` (the dispatch guard and the artefact pattern), `evidence-release.yml` line 39 (`EVIDENCE_WORKFLOW_IDS`, perf.yml and knee.yml only; **gate.yml is added by a `ci(evidence)` PR right after this task merges, L4**).
- `tests/unit/evidence-release-ids.test.ts` line 8 (two ids; changed by the `ci(evidence)` PR, not here).

**Not on main:** Task 6 (`products.documenso` in the knee file) is not needed here: the A/A set is for Cal and Medusa only in this task; Documenso's A/A is added when its steady rate exists (§13 Q-DOCAA).

## 5. Build-time recheck table

| #   | Check                                        | Exact command                                                                                                                                | Expected                                    | If it differs                                                             |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Steady band still matches                    | `jq '.products["P6-CAL-LOAD-003"].metrics.p95Ms.median, .products["P6-MED-LOAD-002"].metrics.p95Ms.median' k6/thresholds/baseline-band.json` | 79.7687208 and 220.63347279999996           | the tolerance is recomputed from the file, never from this plan's numbers |
| 2   | The A/A arms are steady profile at 50 % (L3) | `grep -n "profile" k6/cases/cal-load-003.js k6/cases/med-load-002.js` and the steady rate                                                    | `steady` profile, rate from `steadyRateFor` | a non-steady arm is rejected by the build test (§6.4)                     |
| 3   | No `gate.yml` and no tolerance file on main  | `ls .github/workflows/gate.yml k6/thresholds/tolerance.json 2>&1`                                                                            | no such file                                | another session started the work: stop and report                         |
| 4   | `npm run check`                              | `npm run check`                                                                                                                              | exit 0                                      | fix                                                                       |

## 6. Design

### 6.1 File tree

```text
.github/workflows/gate.yml                        NEW  dispatch only in this task; jobs aa-cal and aa-medusa (A/A sets)
k6/thresholds/tolerance.json                      NEW  the A/A tolerance per product and metric, with its run IDs (D13); written by scripts/write-tolerance.ts from the A/A runs
scripts/write-tolerance.ts                        NEW  reads the A/A verdict.json and run-meta.json folders, prints the table, writes the file, exits 2 below three VALID arms
src/load/gate/aa-noise.ts                         NEW  the A/A statistics: per metric the arm medians, the relative spread
src/load/gate/tolerance.ts                        NEW  the tolerance rule (§6.2) and the parse and write checks of tolerance.json
tests/unit/gate-aa-noise.test.ts                  NEW  4 tests
tests/unit/gate-tolerance.test.ts                 NEW  4 tests
tests/unit/gate-rule-004.test.ts                  NEW  2 tests: P6-RULE-004 (a gate config must cite an A/A set; the steady profile only)
README.md                                         CHANGED  section "A/A noise and the tolerance"
```

### 6.2 The tolerance rule (Q-TOLRULE)

Per product and metric (`p95Ms`, `p50Ms`, `requestsPerSec`), with the medians `m_1, m_2, m_3` of the three A/A arms (each arm's run-level value, excluding the first 10 s):

- The **relative spread** `S = (max(m) − min(m)) / median(m)`.
- The **tolerance** `T = max(FLOOR, K × S)` with `K = 2` and `FLOOR = 0.10` (10 %).

Why `K = 2`: a three-arm set gives one range; a regression claim needs the candidate to exceed the noise by more than the largest difference seen between two A arms, with a factor of two for the sampling error of a range of three. Why `FLOOR = 0.10`: a range from three arms can be near zero by chance, and a 10 % floor keeps a lucky A/A set from making the gate hair-trigger. Both are stated in the file and in the README; both are changeable only by a PR that cites new A/A runs (never by tuning to a result, rule C12).

With the Task 5 evidence (A-4): Cal `S` = 36 %, so `T` = 72 %: the gate would detect only a large regression for Cal; Medusa `S` = 3 %, so `T` = 10 % (the floor). **This is the honest result of the rule, and it is the reason for Q-TOLRULE** (§13): the owner may prefer a per-arm median of more arms (five) rather than a wider tolerance.

```ts
// src/load/gate/tolerance.ts
export interface ArmMedian {
  runId: string;
  value: number;
} // the run-level value of one A/A arm
export interface Tolerance {
  metric: "p95Ms" | "p50Ms" | "requestsPerSec";
  spread: number; // (max - min) / median of the arms; 0 when the median is 0 (never a divide by zero, L7)
  tolerance: number; // max(FLOOR, K * spread)
  runIds: string[]; // the arm run IDs, ascending, unique, digits only (D13)
  arms: number; // >= 3
}
export const K = 2;
export const FLOOR = 0.1;
/** The tolerance of one metric from its A/A arms. Throws when fewer than three arms or any value is not finite and > 0. */
export function toleranceOf(metric: Tolerance["metric"], arms: ArmMedian[]): Tolerance;
/**
 * Parses k6/thresholds/tolerance.json. The root shape is the one of knee-bounds.json: `{ schema: 1, metric, unit, release,
 * products: { cal: { "p95Ms": Tolerance, ... }, medusa: { ... } } }`. Every consumer (write-tolerance.ts, the gate, the
 * jq preflight of Task 12 §5, which reads `.products`) uses this root. Checks: ids digits-only and ascending, n >= 3.
 */
export function parseTolerance(value: unknown): {
  schema: 1;
  products: Record<string, Record<string, Tolerance>>;
};
```

```ts
// src/load/gate/aa-noise.ts
export interface AaArm {
  runId: string;
  caseId: "P6-CAL-LOAD-003" | "P6-MED-LOAD-002";
  profile: "steady";
  rate: number;
  medians: Record<string, number>;
}
/** Groups the arms of one case, checks profile "steady" and that the rate equals steadyRateFor (L3), and returns the arms for toleranceOf. Throws on a non-steady or wrong-rate arm (TEST BUG). */
export function aaArmsFor(caseId: string, arms: AaArm[], expectedRate: number): ArmMedian[];
```

### 6.3 The A/A workflow (`gate.yml`, NEW, dispatch only)

Two jobs, `aa-cal` and `aa-medusa`, each the same pattern as `knee.yml` (the dispatch ref guard; the product checkout and HEAD verify; `npm run up:<product>`; **one discarded warm-up arm, then three interleaved arms** (the warm-up arm is the first arm of the stack, run and recorded but not counted, A-5): arm 1, arm 2, arm 3 of the steady case, each `run-load.ts --profile steady` on the same stack; token scan; upload with `retention-days: 90`; stop with `if: always()`).

Timeouts (the new jobs set their own timeouts, under the 6 h cap; the existing jobs are not touched). `aa-cal`: setup 29 (the `cal-knee` setup sum, Task 7 §9, which includes the Cal start) + 4 arm steps × 4 min (the warm-up arm and arms 1 to 3, §9) + summary 2 + scan 2 + upload 3 + stop 1 = **29 + 16 + 8 = 53**; job **75**, margin **22 ≥ 10** ✓. `aa-medusa`: setup 21 + 4 arm steps × 4 + 8 = **45**; job **60**, margin **15** ✓. The job timeouts are set by these new jobs only (a new job may set its own timeout, rule of §9 of Task 7 and PRE-2).

```yaml
name: gate

on:
  workflow_dispatch:
    inputs:
      product:
        description: "A/A sets to run: cal, medusa or all"
        type: choice
        options: [cal, medusa, all]
        default: all

permissions:
  contents: read

concurrency:
  group: gate-${{ github.run_id }}
  cancel-in-progress: false

defaults:
  run:
    shell: bash
```

The `aa-cal` and `aa-medusa` jobs follow Task 7 §6.6 (the same setup steps, copied from `knee.yml`), with the arm steps:

```yaml
- name: A/A arm 1 (P6-CAL-LOAD-003, steady, 120 s)
  timeout-minutes: 4
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: node scripts/load/run-load.ts --case P6-CAL-LOAD-003 --profile steady --out results/load/aa-1
# arms 2 and 3: identical steps with --out results/load/aa-2 and aa-3
```

### 6.4 CLI and the arm folders

`scripts/write-tolerance.ts --release <tag> --out k6/thresholds/tolerance.json cal=<dir>,<dir>,<dir> medusa=<dir>,<dir>,<dir>` reads `verdict.json`, `run-meta.json` and the telemetry of each arm through the existing `validateRunMeta` and `selectPublishable`, prints the excluded arms, and **exits 2 when a product has fewer than three VALID arms**. It refuses to write when the token scan finds a secret-like string (`findHits` in `scripts/evidence-token-scan.mjs`).

### 6.5 P6-RULE-004 check (in `npm run check` through `test:unit`)

`tests/unit/gate-rule-004.test.ts` asserts, from the repo files, in two tiers so that step 2 is green without the tolerance file:

- **Tier 1 (always, no file needed):** no gate configuration references a tolerance. The rule is "no A/B config without a cited A/A set", so a gate config that names `tolerance.json` or a `--tolerance` flag while the file is absent fails. The A/A workflow of step 3 names neither, so the test passes with the file absent ("no A/A set yet").
- **Tier 2 (only when `k6/thresholds/tolerance.json` exists):** (a) it parses; (b) every product in it cites at least three run IDs; (c) every gate config (`.github/workflows/gate.yml`, `src/load/gate/ab-gate.ts` once Task 12 lands, and any file that names `--gate`) cites a product present in the tolerance file; (d) its case IDs are the steady cases (L3).

Tier 2 starts to bind when the tolerance-file PR (§12) adds the file.

## 7. Oracles and assertions

- Each arm: its own correctness audit (`audit.json` of the steady case: `CAL_INTENT_ROWS_SQL` and `HOST_OVERLAP_SQL` for Cal, `RESERVATION_QTY_SQL` and `readMedusaSnapshot` for Medusa). An arm whose audit fails is a FAIL (PRODUCT BUG SUSPECTED), not a noise sample; it is excluded from the tolerance and listed.
- The A/A verdict per arm: VALID and PASS (the arm is a valid noise sample) only. An INVALID arm (dropped iterations, telemetry gap) is excluded. Fewer than three VALID arms: the set is incomplete, the tolerance is not written (exit 2).

## 8. Data isolation, cleanup and leak check

Each arm has its own run prefix (`p6-qa-<run id>-P6-CAL-LOAD-003`), its own cleanup (`calCleanupWith`, `medusaCleanupWith`), and the leak check of the steady case (0 rows). Arms share a stack but not data.

## 9. CI, token scan and budget

Job timeouts: `aa-cal` **75** and `aa-medusa` **60** (§6.3). Arm steps: 147 s measured for Cal (A-5) and 139 s for Medusa at 120 s (Task 7 M-3). The arm step caps are **4 min** (240 s): Cal's arm needs 147 s, Medusa's 139 s, both with room. An arm is a fixed-duration k6 run with no stop rule, so the 80 % stop rule of §9 does not apply to its duration. With the warm-up arm (§6.3), the step-cap sums are `aa-cal` **53** against a job of **75** (margin 22) and `aa-medusa` **45** against a job of **60** (margin 15). **Confirm in the first CI dispatch** (runner durations of the cold and cached starts).

The token scan runs before every upload (`token_scan`, upload guarded by its success). Permissions `contents: read`.

## 10. Expected output

```text
P6-RULE-004 A/A P6-CAL-LOAD-003: arms 3 VALID, p95 medians <m1> <m2> <m3> ms, spread <S> %, tolerance <T> % (K 2, floor 10 %)
P6-RULE-004 A/A P6-MED-LOAD-002: arms 3 VALID, p95 medians <m1> <m2> <m3> ms, spread <S> %, tolerance <T> %
tolerance.json written, runIds <ids> → exit 0
```

Placeholders only.

## 11. Environment changes

None in the repo or in Cursor Cloud and Claude Code cloud. The Cal arms use the session's `NODE_OPTIONS` as before. Repo settings: none.

## 12. Build order

| Step | Commit                                                               | Files                                                                                                                                      | Unit tests after the step (B0 1025) |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1    | `feat(load): add the a/a noise statistics and the tolerance rule`    | `src/load/gate/aa-noise.ts`, `src/load/gate/tolerance.ts`, `tests/unit/gate-aa-noise.test.ts` (4), `tests/unit/gate-tolerance.test.ts` (4) | 1033                                |
| 2    | `feat(load): add the p95 rule check and the tolerance writer`        | `tests/unit/gate-rule-004.test.ts` (2), `scripts/write-tolerance.ts`                                                                       | 1035                                |
| 3    | `ci(gate): add the dispatch-only a/a workflow`                       | `.github/workflows/gate.yml`, `src/load/cases.ts` (no change needed beyond steady)                                                         | 1035 (plus `lint:actions`)          |
| 4    | `docs(load): describe the a/a noise and the tolerance in the readme` | `README.md`                                                                                                                                | 1035                                |

The tolerance file itself is **not** committed in this task: it is written by the first A/A dispatch and committed in its own `docs(load)` PR (the "tolerance-file PR", index run order 11), with its run IDs. Until that PR the file is absent. The A/A workflow of step 3 references no tolerance, so the test passes with "no A/A set yet" and CI stays green. The test fails only when a gate config references `tolerance.json` (or a tolerance flag) while the file is absent, so a gate can never run without its data. **Q-TOLFILE (§13).**

**Expected after the last step: 1035** (B0 1025 + 10). With Task 6 merged first: 1071.

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-TOLRULE.** The tolerance rule: (a) `T = max(10 %, 2 × S)` over three arms (recommended, §6.2; gives Cal 72 % and Medusa 10 %); (b) five arms and `T = max(10 %, 1.5 × S)`, more runtime (Cal five arms ≈ 12.5 min, job 60 still fits); (c) a fixed tolerance per product set by the owner (rejected: not from data). Recommended: **(a) now, (b) when the first dispatches show the spread**.
- **Q-ARMLEN.** The arm length: 120 s steady (recommended; A-5, M-3) versus 30 s (A-1: 38 % spread, not usable). Recommended: **120 s**.
- **Q-TOLFILE.** The tolerance file in its own PR after the first A/A dispatch (recommended, index run order 11) or in this PR (rejected: no data exists yet).
- **Q-DOCAA.** Documenso's A/A set: added when Task 6's steady rate exists and its band is measured (Documenso has no steady case on main). Recommended: **later**, as the roadmap's "Cal and Medusa first" evidence allows.

**Proposed extras:** none needed. Grep before any new ID: `P6-X-LOAD-024` is proposed by Task 7 (DB growth as its own figure) and is not reused here.

**Risks:**

- One noisy runner inflates the tolerance (roadmap risk): the three-arm set on one runner can be noisy by chance; the floor and the factor limit the damage but cannot remove it. The first dispatches show it.
- INVALID arms reduce the set below three: the job then fails with exit 2, and the first dispatch is repeated (not a pass).
- A 120-s arm costs about 2.5 min; three arms per product is about 7.5 min of k6 plus the start.

## 14. Done when (roadmap, made measurable)

Roadmap: "≥ 1 A/A set per product with ≥ 3 VALID arms; tolerance file committed with its run IDs; `P6-RULE-004` check (no A/B config without a cited A/A set) in `npm run check` or CI; `npm run check` green."

Measured: (1) `npm run check` with 1035 tests (1071 with Task 6), `# fail 0`; (2) one `gate.yml` dispatch per product, each with three VALID arms (run IDs in the tolerance-file PR); (3) `k6/thresholds/tolerance.json` committed in its own PR with its run IDs; (4) `gate-rule-004.test.ts` green on that PR.

## 15. Rule self-check

- **A1 to A5:** plan branch, Conventional Commits, explicit paths, no attribution, environment identity.
- **B7 (probe first):** §3 has A-1 to A-6 with the numbers from this session (three 30-s arms, restarts, the cold Cal start, the steady spread).
- **B9:** §13 lists four open decisions with recommendations; the contradiction found is that a 30-s arm spread (A-1, 38 %) is far above the 120-s band spread for Medusa (A-4, 3 %), so arm length is decided first (Q-ARMLEN).
- **B10:** stop for review (§1).
- **C12:** the tolerance floor and factor are stated, not tuned; a short arm is not used for a tolerance.
- **L3:** only the steady profile sets the tolerance; enforced by `aaArmsFor` (§6.2) and the test (§6.5).
- **Industry practice:** A/A tests before A/B gating and the noise floor follow the k6 docs on repeatable test design and the Google SRE book's guidance on measuring variance before alerting; GitHub `workflow_dispatch` and job caps are GitHub docs ("Workflow syntax").
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §4 (`k6/thresholds/baseline-band.json`, `src/load/medians.ts`, `src/load/smoke-baseline.ts`, `src/load/stub-server.ts`, `scripts/write-baseline-band.ts`, `perf.yml` dispatch group, `evidence-release.yml` line 39); (c) budget in §9 (46 and 38 under 60); (d) skeletons in §6; (e) no owner answer recorded as given.
