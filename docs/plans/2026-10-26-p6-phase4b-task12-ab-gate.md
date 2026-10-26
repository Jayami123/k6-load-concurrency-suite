# P6 Phase 4b Task 12: A/B regression gate (`P6-X-LOAD-003`) and its self-test (`P6-X-LOAD-008`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 672 to 716 (Task 12), D5 (line 816), D17 (line 850), Note 2 and the Cal two-ref note in the task. Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `86dbbde` (merged into this branch at `fe09ba6`; re-checked 2026-10-26 against main 86dbbde). Probe date 2026-10-25 (UTC), cloud VM. **VM timings prove that a step works; none is a published number or a target.** The A/B arms themselves need a candidate ref: **UNPROBED** on this VM (§3.2).

## 1. Header

- **Task and roadmap line:** Phase 4b Task 12, roadmap lines 672 to 716.
- **Cases:** `P6-X-LOAD-003` (P1, noise-aware A/B gate), accepted extra `P6-X-LOAD-008` (gate self-test, D17).
- **Build branch pattern:** `feat/<build date>-p6-ab-gate`.
- **Unit-test delta:** **+11 against B 1173** (B0 1102, plus the bound PR's +1, Tasks 7 to 11 in index §2 order: +23, +14, +11, +12, +10). Expected after the last step: **1184**.
- **Stop for owner review: yes.** A new dispatch-and-path-triggered workflow `gate.yml` changes (shared CI), a required-check decision is the owner's (roadmap line 709), and the ref-bump detection edits a CI trigger.

## 2. What it proves

- A candidate is blocked only by a repeated regression above the measured noise: the ratio of medians is above the A/A tolerance in every candidate arm, not in one noisy arm.
- The gate can fail: the self-test fails on a deliberately slowed candidate and passes on an unchanged one (`P6-X-LOAD-008`). A gate that cannot fail is not accepted (roadmap rule, applied to the gate).
- Correctness is never traded: each arm still runs its audit; a failing audit is a PRODUCT or TEST BUG, not a gate result.
- Transfer: a dependency bump in a payments service or an EHR release is blocked by a repeated, measured slowdown, not by one noisy run.

## 3. Live probe evidence

### 3.1 What was probed (sizing only)

| #   | Roadmap probe item                                                              | Command or source                                                                                                                                                                                                  | Output (trimmed)                                                                                                                                                                                                                                              | Value it sets                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-1 | Job time for six arms per product, including stack switches                     | Medusa: `npm run up:medusa` start 28 to 100 s (Task 10 M10-1 and Task 11 A-2); one steady arm 139 s (Task 7 M-3)                                                                                                   | a six-arm Medusa job: 100 s start + 6 × 140 s = **17 min** of arms, plus up to 6 restarts at 30 to 100 s = **3 to 10 min**                                                                                                                                    | Medusa A/B fits one job of 60 min with margin                                                                                                                       |
| G-2 | Cal cold build time for the B ref and the cache hit for A                       | Cal `up:cal` cold: **421 s** on the cache-less VM (not a CI number; Task 11 A-3), `next build` 98 s                                                                                                                | A is restored from the cache (CI: 9 of 9 4a `knee.yml` runs restored it, 0–3 s); B is built cold once (≤ 255 s, PRE-2 worst case); later switches reuse the build. CI evidence: Start Cal 52–70 s (19 % of the 6-min cap); the 6-min cap stays (never raised) | the Cal A/B job: six switches, each start capped at 6 min (never more), plus six arms of 4 min = 97 of 120 min (§6.6); a cache-miss warning goes in the job summary |
| G-3 | Ref bump detection (diff of `*_REF`)                                            | `grep -n "_REF" .github/workflows/perf.yml scripts/bootstrap.sh`                                                                                                                                                   | `CAL_REF`, `MEDUSA_REF`, `DOCUMENSO_REF` appear in `perf.yml` env (lines near the top: `MEDUSA_REF`, `CAL_REF`, `DOCUMENSO_REF`) and in `scripts/bootstrap.sh` lines 9 to 13 (`MEDUSA_REF=…`, `DOCUMENSO_REF=…`, `CAL_REF=…`)                                 | the detection greps those exact names in `git diff base...head` (§6.4)                                                                                              |
| G-4 | The self-test on the stub: fail on a slowed candidate, pass on an unchanged one | **UNPROBED** here: the self-test is a new k6 script (`k6/selftest/gate-slowdown.js`); a stub run with `node src/load/stub-server.ts 18080 25 1500 10000` exists (README line 767), so the stub itself is available | —                                                                                                                                                                                                                                                             | the build runs the self-test on the stub in CI (product-free), like `load-knee-selftest`                                                                            |
| G-5 | Gate triggers: `paths` filters                                                  | `grep -n "paths:" .github/workflows/*.yml`                                                                                                                                                                         | no `paths:` filter on main for `k6/**`, `scripts/load/**`, `src/load/**` (perf.yml has `pull_request:` without paths; knee.yml has dispatch only)                                                                                                             | the gate's `paths:` filter is NEW                                                                                                                                   |

### 3.2 What the probe could not confirm

1. A real A/B arm pair (candidate ref B): **UNPROBED**. Two refs need two builds; the only ref this VM has is the pinned one, and the product forks are at their pinned refs (`/home/user/products/cal` at `c2b7ac4`, Medusa at `f677db4`). **Confirm in the first `gate.yml` trigger on a probe branch**, as the roadmap's "done when" asks.
2. The cache hit for A on the Cal build (G-2): UNPROBED.
3. The runner's A/B spread (Task 11 §3.1): UNPROBED.
4. The self-test on CI (G-4): UNPROBED until the first run.

## 4. Depends on

Main at `86dbbde` (re-checked 2026-10-26; verified):

- Task 11 (A/A): `k6/thresholds/tolerance.json` (**not on main**: written by the tolerance-file PR after the first A/A dispatch, Task 11 §12). This task cannot run its gate until that file exists (§5 row 1).
- `src/load/stub-server.ts` (`node src/load/stub-server.ts <port> <serviceMs> <stallMs> <periodMs>`, README line 767), `src/load/telemetry/*`, `src/load/medians.ts`, `src/load/smoke-baseline.ts`.
- `k6/lib/pure/options.js` (`openModelScenario`, `timeUnitSec`), `k6/lib/pure/sizing.js` (`preAllocatedVUs`, `maxVUs`).
- `perf.yml` env `MEDUSA_REF`, `CAL_REF`, `DOCUMENSO_REF` (lines near 33 to 39 of the workflow's `env:` block: the same SHAs as `scripts/bootstrap.sh` lines 9 to 13), `knee.yml` (the dispatch guard and the artefact pattern), `perf.yml` `load-knee-selftest` (line 2390, the product-free self-test job the gate self-test copies).
- `scripts/bootstrap.sh` (the product checkouts; a second ref is checked out into a separate directory for B).
- The Cal build cache keyed on ref: `cal-next-${CAL_REF}-h0.2.15` in `perf.yml` on main (`${{ runner.os }}-cal-next-${{ env.CAL_REF }}-h0.2.15`, lines 1114, 1293 and 1408; re-read at build) (roadmap D5, Phase 1).

**4a lessons applied** (each is checked by the build step it names):

- `DANGEROUS_BYPASS_RATE_LIMITS` defaults to true (`scripts/harness.mjs` line 33, `||=`); the A/B cases are Cal and Medusa, which do not use the limiter.
- Minute-boundary alignment with a 5 s guard applies to limiter windows only; the A/B arms have none.
- `no_reference` → INVALID, never PASS (a missing tolerance, §9).
- `low_sample_stop`: an arm whose verdict rests on too few requests is flagged and not counted as a VALID arm.
- Config-used tests for every new config field (the self-test's arm config, §6.5).
- k6 has no URL global: URLs are built by string concatenation.
- Cleanup never runs inside a limiter window under test.
- Per-intent audit with no slack (L9): each arm's audit is a FAIL (PRODUCT BUG) or TEST BUG, never a regression (§6.7).
- The F-M2 ghost flag (Medusa) is not read as a gate result.
- "knee range" wording, never "capacity" (R10).
- CI budget rules (§6.6, §9, X8): every step capped, the 80 % rule, retention 90.
- The owner dispatches in the UI and pastes the run ids.

## 5. Build-time recheck table

| #   | Check                                                                             | Exact command                                                                  | Expected                                                                           | If it differs                                                                               |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | The tolerance file exists with three arms per product (hard stop for the A/B job) | `jq '.products \| keys' k6/thresholds/tolerance.json` (path from Task 11 §6.1) | `["cal","medusa"]` with `n` ≥ 3                                                    | Stop. Build the classifier and the self-test (steps 1 to 3); the A/B job waits for the file |
| 2   | Ref bump names unchanged                                                          | `grep -n "_REF=\|_REF:" scripts/bootstrap.sh .github/workflows/perf.yml`       | the three names                                                                    | the detection of §6.4 follows the new names                                                 |
| 3   | `npm run check`                                                                   | `npm run check`                                                                | exit 0                                                                             | fix                                                                                         |
| 4   | The self-test passes on the stub locally before the workflow lands                | `node scripts/load/run-load.ts --case P6-X-LOAD-008 --profile pr`              | exit 0 with the expected classification: slowed → gate FAIL, unchanged → gate PASS | a wrong classification is a TEST BUG; fix the thresholds' derivation, never the expectation |

## 6. Design

### 6.1 File tree

```text
.github/workflows/gate.yml                        CHANGED  adds jobs ab-cal and ab-medusa (dispatch, and path or ref-bump triggers), and the self-test job gate-selftest
k6/selftest/gate-slowdown.js                      NEW  P6-X-LOAD-008: the stub arms, one slowed candidate and one unchanged candidate
src/load/gate/ab-gate.ts                          NEW  the A/B decision: repeated regression rule (§6.3)
src/load/gate/ratio.ts                            NEW  per-arm and median ratios against the tolerance
src/load/gate/triggers.ts                         NEW  changedRefs(diffText), touchesLoadCode(paths): the trigger decision (§6.4)
scripts/load/run-load.ts                          CHANGED  --case P6-X-LOAD-008 (the self-test case), --ab <refB> (candidate ref), out dirs per arm
tests/unit/gate-ab.test.ts                        NEW  4 tests
tests/unit/gate-ratio.test.ts                     NEW  3 tests
tests/unit/gate-triggers.test.ts                  NEW  3 tests
tests/unit/gate-selftest.test.ts                  NEW  1 test: the self-test's slowed and unchanged expectations are the ones the self-test checks
README.md                                         CHANGED  section "How the gate works"
```

### 6.2 Arms and order

Each product: arm order `A B A B A B` (A = `main` at its pinned ref, B = the candidate), each arm a steady run of the Task 11 profile (120 s), on the same runner and the same job. Product ref bumps: the B ref's product checkout is placed in `products-b/` (the same bootstrap, a second directory), so both refs are on disk. For P6 code changes (`k6/**`, `scripts/load/**`, `src/load/**`), A = `main` and B = the PR head, and the product ref is the same for both.

### 6.3 The decision (`src/load/gate/ab-gate.ts`)

```ts
// src/load/gate/ab-gate.ts
export interface GateInput {
  caseId: "P6-CAL-LOAD-003" | "P6-MED-LOAD-002" | "P6-X-LOAD-008";
  aMedians: number[]; // the A arms' run-level p95 (ms), VALID arms only
  bMedians: number[]; // the B arms' run-level p95 (ms), VALID arms only
  toleranceRel: number; // from tolerance.json for this product and metric (toleranceOf, Task 11)
  auditOk: boolean; // every arm's correctness audit passed
}
export interface GateVerdict {
  verdict: "PASS" | "FAIL (REGRESSION)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  ratios: number[]; // median(B arm) / median(A arms), one per B arm
  rule: "repeated regression: every B arm's ratio is above 1 + toleranceRel";
  reasons: string[];
}
/**
 * FAIL (REGRESSION) only when every B arm's ratio exceeds 1 + toleranceRel (repeated regression, §6.3). One noisy B arm
 * never fails the gate. A failing audit is FAIL (PRODUCT BUG) or TEST BUG, never a regression. Fewer than three VALID
 * arms of either side is INVALID. Zero or non-finite medians are TEST BUG (L7: no divide by zero).
 */
export function abGate(input: GateInput): GateVerdict;
```

Why "every arm" for three arms: the A/A set (Task 11) showed a range of arms whose medians differ by up to the tolerance; a candidate that is slower by more than that tolerance in all three arms is repeated, and the chance of three noisy arms all exceeding a tolerance set at twice the A/A range is small (the rule's rationale, stated in the README). The rule is the one of Task 11 Q-TOLRULE: if the owner picks option (b) there, `abGate` takes the same tolerance and this rule is unchanged.

### 6.4 Triggers (`src/load/gate/triggers.ts`, `.github/workflows/gate.yml` CHANGED)

```ts
// src/load/gate/triggers.ts
/** The `*_REF` names whose change is a product ref bump (perf.yml env and scripts/bootstrap.sh). */
export const REF_NAMES = ["CAL_REF", "MEDUSA_REF", "DOCUMENSO_REF"] as const;
/** The changed `*_REF` names in a unified diff of perf.yml or bootstrap.sh; empty when the diff only moves other lines. */
export function changedRefs(diffText: string): Array<(typeof REF_NAMES)[number]>;
/** True when any changed path is under k6/, scripts/load/ or src/load/ (the D5 path triggers). */
export function touchesLoadCode(paths: string[]): boolean;
```

Workflow triggers (`gate.yml`):

- `pull_request` with `paths: ['k6/**', 'scripts/load/**', 'src/load/**', '.github/workflows/perf.yml', 'scripts/bootstrap.sh']`. The last two paths are the ref-bump files: a PR that changes only `CAL_REF`, `MEDUSA_REF` or `DOCUMENSO_REF` has no P6 code change, so without them the gate never starts for a ref bump.
- `push` with `branches: [main]` and the same `paths` list, so a bump merged to `main` also starts the gate. The `push` run compares `main` with its parent, not with a PR base.
- A step that runs `git diff <base>...HEAD -- .github/workflows/perf.yml scripts/bootstrap.sh` (where `<base>` is `origin/main` on `pull_request`, and `HEAD~1` on `push`) through `changedRefs`. Only a changed ref name starts the gate for the bumped product; other edits to those two files do not. The `pull_request` A/B checkout uses `fetch-depth: 0`, so `git diff origin/main...HEAD` has the base commit.

**Not a required check** unless the owner sets it by hand (roadmap line 709).

### 6.5 The self-test (`P6-X-LOAD-008`, `k6/selftest/gate-slowdown.js`)

```js
// k6/selftest/gate-slowdown.js  (P6-X-LOAD-008: the gate fails on a slowed candidate and passes on an unchanged one)
// Arms: A = stub with serviceMs 25 (three arms), B-slow = stub with serviceMs 25 + 60 (three arms), B-same = stub with serviceMs 25 (three arms).
// Expected: abGate(A, B-slow) = FAIL (REGRESSION); abGate(A, B-same) = PASS. Both values are the expectation, not a tuning target.
```

The three stubs are the existing `src/load/stub-server.ts` (`node src/load/stub-server.ts <port> <serviceMs> <stallMs> <periodMs>`), one port per arm set (18080 A, 18081 B-slow, 18082 B-same), `stallMs` 0. The tolerance for the self-test is the **fixed** test tolerance 0.20 (a self-test tolerance, not a product tolerance, written in the script and labelled as such), so the expectation does not depend on the runner's noise.

### 6.6 CI (`gate.yml` CHANGED)

Jobs: `gate-selftest` (product-free, every `pull_request` and `push` to `main` that touches `k6/**`, `scripts/load/**`, `src/load/**`; 20-min job like `load-selftest`, steps: install, k6, the stub arms, the classifier), `ab-cal` and `ab-medusa` (the path or ref-bump trigger, and `workflow_dispatch`), each with six arms (A B A B A B).

Budgets (the new jobs set their own timeouts, under 6 h):

- `ab-medusa`: setup 21 (the `medusa-knee` setup sum, Task 7 §9) + six arm steps × 4 min (24) + stack restarts 6 (one per arm switch, 1 min each as an upper bound from the 28 to 100 s probes, UNPROBED) + summary 2 + scan 2 + upload 3 + stop 1 = **21 + 24 + 6 + 2 + 2 + 3 + 1 = 59**; job **75**, margin **16** ✓.
- `ab-cal` (Q-CALAB, decided: six interleaved switches): A from the cache; B cold once (≤ 255 s, PRE-2 worst case); later switches reuse the build. Every step is capped, and each switch's start is capped at 6 min (never more). Setup 29 + six arm steps × 4 (24) + six switch starts × 6 (36) + summary 2 + scan 2 + upload 3 + stop 1 = **97**; job **120**, margin **23** ✓. A cache-miss warning goes in the job summary. **Confirm in the first CI dispatch.**
- `gate-selftest`: stub arms of 30 s each (nine arms of 30 s = 4.5 min) + the classifier, step caps summing to 12; job **20**, margin **8** ✗ → the job is **25**, margin **13** ✓.

### 6.7 Oracles and assertions

- Each arm: its audit (as in Task 11 §7). A failed audit is FAIL (PRODUCT BUG SUSPECTED) for that arm and the gate verdict is `FAIL (PRODUCT BUG)`, never a regression.
- `P6-X-LOAD-008`: the verdict on the slowed candidate must be `FAIL (REGRESSION)`, and on the unchanged candidate `PASS`. The self-test job fails if either expectation is not met (a gate that cannot fail is caught).

## 8. Data isolation, cleanup and leak check

Each arm has its own prefix (`p6-qa-<run id>-<case>-<arm>`), its own cleanup and leak check (0 rows). The self-test uses the stub only (no product data).

## 9. CI, token scan and budget

Budgets in §6.6; every step has `timeout-minutes`. Uploads use `retention-days: 90`. Token scan before every upload; permissions `contents: read` for every job (the workflow needs nothing more: the B checkout is public-ref read only). A missing `k6/thresholds/tolerance.json` is a hard stop for the A/B job (§5 row 1); an A/B run that reaches the gate without its tolerance is INVALID (`no_reference`), never PASS.

## 10. Expected output

```text
P6-X-LOAD-003 A/B P6-CAL-LOAD-003: A medians <a1> <a2> <a3> ms, B medians <b1> <b2> <b3> ms, ratios <r1> <r2> <r3>, tolerance <t> → PASS | FAIL (REGRESSION)
P6-X-LOAD-008 self-test: slowed candidate → FAIL (REGRESSION) (expected); unchanged candidate → PASS (expected) → exit 0
```

Placeholders only.

## 11. Environment changes

None. The B ref's product build is a second checkout of the same bootstrap; no new secret; no Cursor Cloud or Claude Code cloud change. **Repo setting by hand (owner):** the gate is not a required check unless the owner sets it (roadmap line 709).

## 12. Build order

| Step | Commit                                                              | Files                                                                                                                       | Unit tests after the step (B 1173) |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1    | `feat(load): add the a/b gate decision and the ratios`              | `src/load/gate/ab-gate.ts`, `src/load/gate/ratio.ts`, `tests/unit/gate-ab.test.ts` (4), `tests/unit/gate-ratio.test.ts` (3) | 1180                               |
| 2    | `feat(load): add the trigger detection for load code and ref bumps` | `src/load/gate/triggers.ts`, `tests/unit/gate-triggers.test.ts` (3)                                                         | 1183                               |
| 3    | `feat(k6): add the gate self-test`                                  | `k6/selftest/gate-slowdown.js`, `scripts/load/run-load.ts` (`--case P6-X-LOAD-008`), `tests/unit/gate-selftest.test.ts` (1) | 1184                               |
| 4    | `ci(gate): add the a/b arms and the self-test job`                  | `.github/workflows/gate.yml`                                                                                                | 1184 (plus `lint:actions`)         |
| 5    | `docs(load): describe the gate in the readme`                       | `README.md`                                                                                                                 | 1184                               |

**Expected after the last step: 1184** (B 1173 + Task 12's 11).

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-REPEAT.** The "repeated" rule: every B arm above the tolerance (recommended: with three arms, the strictest reading that is still robust) versus a majority (two of three). Evidence: the A/A spread (Task 11 A-4: Cal 36 %, Medusa 3 %). Decided: **every B arm**, because a majority rule with a 36 % spread is too easy to trip.
- **Q-REQ.** The gate as a required check: owner, by hand (roadmap line 709). Decided: **not required** until three real triggers have run green; the owner decides later.
- **Q-CALAB.** The Cal A/B job's time: six stack switches cold can take 42 min; options: (a) keep six switches (the roadmap's interleaving, recommended); (b) run both refs' stacks side by side on the runner if memory allows (4 vCPU, 15 GB: UNPROBED; the roadmap allows one stack at a time on the VM). Decided: **(a)**, six interleaved switches.
- **Q-SELFTOL.** The self-test's fixed tolerance 0.20 is a test constant, not a product tolerance. Decided: fixed 0.20, a labelled test constant.

**Proposed extras:** none needed. `P6-X-LOAD-008` is the accepted extra (D17).

**Risks:**

- The B ref build is cold on a cache miss (G-2): the Cal job can reach its cold worst case (103 of 120 min).
- A slow runner can make all three B arms regress together without a product change (the same-runner design reduces this, not eliminates it). The Task 11 tolerance and the "every arm" rule are the defence; a false FAIL is re-run once only after the cause is recorded (rule 13: no blind re-runs).
- CI minutes: a `k6/**` path trigger runs `ab-cal` (about 97 min) on every load PR. Recommended: paths limited to `k6/journeys/**`, `k6/lib/**` and the `*_REF` lines, plus `workflow_dispatch`. The owner decides in the build PR.

## 14. Done when (roadmap, made measurable)

Roadmap: "The gate runs on one real trigger of each kind (a P6 k6 change, and a ref bump on a probe branch) and passes on an unchanged B; `P6-X-LOAD-008` fails on the deliberately slowed candidate and passes on the unchanged one, in CI; history stored for the dashboard; `npm run check` green."

Measured: (1) `npm run check` with 1184 tests, `# fail 0`; (2) one gate run from a P6 k6 change and one from a `*_REF` bump on a probe branch, each with its verdict; (3) the `gate-selftest` job green in CI with both expectations met; (4) the gate history stored as `gate-history.json` in the evidence (for the dashboard, Task 13).

## 15. Rule self-check

- **A1 to A5:** plan branch, Conventional Commits, explicit paths, no attribution, environment identity.
- **B7 (probe first):** §3 has G-1 to G-5 with the numbers that exist; G-4 and the A/B arms are UNPROBED with the reason.
- **B9:** §13 lists four open decisions with recommendations.
- **B10:** stop for review (§1).
- **C12:** the self-test tolerance is a labelled constant, and the expectations are fixed; no retry is added to hide a self-test failure.
- **L3:** the tolerance comes only from Task 11's steady arms (§4).
- **Industry practice:** interleaved A/B with a noise floor follows the practice of performance regression testing in the k6 docs and the Google SRE book's guidance on measuring variability before alerting; GitHub `paths` filters and `workflow_dispatch` are GitHub docs ("Workflow syntax").
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §4 (`src/load/stub-server.ts` line 7 to 9 fields, `perf.yml` `load-knee-selftest` line 2390, `scripts/bootstrap.sh` lines 9 to 13, the README line 767 command); (c) budgets in §6.6 with margins 16 (ab-medusa), 17 (ab-cal, cold worst case) and 13 (gate-selftest); (d) skeletons in §6; (e) no owner answer recorded as given.
