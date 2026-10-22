# P6 Phase 2 Task 1: Framework rerun-on-spread (plan only)

This is the implementation plan a weaker model will build from. Do not write code until the maintainer approves this
document.

Structure and depth follow [2026-10-21-p6-phase1-task7-doc-races.md](2026-10-21-p6-phase1-task7-doc-races.md). The
source of this task is [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), section "Task 1: Framework
carry-over, rerun-on-spread", decisions D2, D3, D4 and D6, "Notes on the agreed order" items 1 to 3, and Phase 1
closeout decision D35 in [2026-10-21-p6-phase1-task8-closeout.md](2026-10-21-p6-phase1-task8-closeout.md). P1 UI
rules do not apply: P6 asserts through HTTP and a read-only database oracle.

## Context

- Repo: `k6-load-concurrency-suite` (P6). Written
  from `main` at `ac563ab`. Build branch: **`feat/2026-10-22-p6-rerun-on-spread`**, cut from it. This plan is its
  first commit. No PR yet.
- Harness `qa-portfolio-harness#v0.2.11`. Never edit product forks or `node_modules/qa-portfolio-harness`;
  `scripts/harness.mjs` starts and stops products (`npm run up:medusa`, `npm run down:medusa`).
- Cases in this task: **none new.** Every existing case (`P6-MED-RACE-001` and its four extras, `P6-CAL-RACE-001` and
  `-003` and their extras, `P6-DOC-RACE-001` and `-002` and the sequential control, the three self-tests: 18
  Playwright tests in 8 files) runs under the new rule.
- Owner decisions agreed on 2026-10-22 and applied here: **D2, D3, D4, D6** of the roadmap, and the module, the cap,
  the rerun rule, the Documenso baseline and the CI change listed in section 3. The roadmap still labels D2 to D4
  "proposed, confirmed by the task's probe"; this plan is that probe, and it marks them agreed. Syncing those labels
  in the roadmap is open question Q4 (the instruction for this task is to commit the plan file only).
- Probe status: **done once on 2026-10-22** (section 2), in a Claude Code cloud session. Scratch scripts lived in the
  session scratchpad (Appendix A) and imported the real `src/*`. Nothing was written to the repo, the harness or a
  fork. Medusa was stopped with `npm run down:medusa` after every use (exit 0, `:9000` closed).

## 1. Header

- Probe date 2026-10-22 (UTC). VM: 4 vCPU, 15 GB RAM, Docker 29.9.1, Node 22.23.3 in `/usr/local/bin` (first on
  `PATH`, as AGENTS.md requires). `PRODUCTS_ROOT=/home/user/products`.
- Baseline on `main` at `ac563ab`, `npm run check`: Prettier clean, `actionlint` clean, typecheck clean,
  `k6 inspect: 4 script(s) ok.`, `# tests 299`, `# pass 299`, `# fail 0`.
- Evidence sources, all read-only: the `p6-phase1` release (8 zips, `SHA256SUMS.txt` verified, all 8 `OK`), the
  `race-histograms-*` artefacts of six later `main` pushes, the log and artefacts of run 39417270875.
- `gh release download` does not work in this cloud session (it uses the GraphQL API, which the session blocks). The
  same files were fetched with the REST asset endpoint; the checksums match, so the bytes are the release's:

  ```bash
  gh api -H "Accept: application/octet-stream" repos/<repo>/releases/assets/<id> > <asset name>
  sha256sum -c SHA256SUMS.txt          # 8 x OK
  ```

- Timings below prove that a flow works. They are never published (AGENTS.md). Published numbers come only from
  GitHub Actions (median of at least 3 runs). The spread values from CI histograms are CI data; the three Medusa runs
  on this VM are proof only.
- Secrets: the Medusa admin password used for the probe runs was a throwaway random value generated in the shell and
  kept in a mode-600 scratch file. It is not in this plan, the logs or any histogram.

## 2. Probe findings (required; no guessed values)

### 2.1 Summary

| #   | Question                       | Observed                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Spread distribution per case   | 14 `main` runs, 3 774 recorded bursts (3 676 through `fireTogether`, 98 from the two sequential cases). Only two cases ever exceeded 5 ms: `P6-CAL-RACE-001` (13 of 650, max 7.63 ms) and `P6-MED-RACE-001` (1 of 418, max 5.56 ms). No burst measured exactly 5.000 ms, so `>=` and `>` give the same counts on this data (§2.2). |
| P2  | Where the slow bursts are      | **9 of the 13** slow `P6-CAL-RACE-001` bursts are trial 1, the first burst of the run. Trial 1 is slow in 9 of 13 runs (69%); every other trial is slow in 4 of 637 (0.63%). The run-39417270875 failure is also a trial 1 (§2.3).                                                                                                 |
| P3  | Origin of the 20 ms stopgap    | Run 39417270875, job `medusa-smoke`, step "Race self-test (medusa-race, 3 trials)": `P6-MED-RACE-001` trial 1 had `dispatchSpreadMs` 7.33 ms against the default limit 5 → `TEST BUG: dispatchSpreadMs 7.332228999999643 >= 5`. Commit `09d04fe` then set 20 ms (§2.4).                                                            |
| P4  | Today's failure shape at 1 ms  | Medusa, 3 trials, `RACE_MAX_SPREAD_MS=1`: trials 1 and 2 fail with the spread TEST BUG, trial 3 passes; the product oracle was correct in all three (5 orders, stock 5); the case verdict is `fail`; the top-level `invariantViolations` is empty. Leak check clean (§2.5).                                                        |
| P5  | Setup repeatable in one trial? | Medusa: yes, live (a new product handle per attempt is required: the same handle fails with HTTP 400 while the old product exists). Cal: yes, the allocator consumes a slot per call (code + existing unit tests). Documenso: yes, a new envelope per call; the `DocumentData` baseline must be re-read per attempt (§2.6).        |
| P6  | Who reads spread today         | 3 invariants files, 3 run-case files, 5 files in `src/races`, 3 self-test specs, 8 unit-test files, README (5 places), `perf.yml` (5 places), `.env.example`. The roadmap's file list misses the three self-test specs and five other files (§2.10).                                                                               |
| P7  | Cap defaults from the data     | `RACE_MAX_SPREAD_RERUNS=3`, `RACE_MAX_INVALID_SHARE_PCT=20` with a floor of 2 invalid attempts (§2.8).                                                                                                                                                                                                                             |
| P8  | Dry run of this plan's code    | In a scratch copy (outside the repo): typecheck clean, 323 unit tests pass, all 7 planned commits green one by one, `npm run check` green, all 6 Medusa race tests pass (3 trials), forced-noise runs at 1 ms and 2 ms behave as designed (§2.9).                                                                                  |
| P9  | `RACE_MAX_SPREAD_MS` default   | Stays 5. The data gives no reason to raise it: the only slow-burst cause found (cold first burst) is exactly what a rerun absorbs (§2.8, D21).                                                                                                                                                                                     |

### 2.2 Spread distribution per case (`main` runs)

Sources: the 8 runs of the `p6-phase1` release (`39429276298`, `39434721131`, `39449102426`, `39484324139`,
`39561220290`, `39563393657`, `39577832657`, `39580025937`) and 6 later `main` pushes whose artefacts are still
available (`39589357885`, `39593434144`, `39603287522`, `39611231805`, `39615686300`, `39736390454`). Every one of them
ran with the stopgap `RACE_MAX_SPREAD_MS=20`, so the limit did not change what was measured. Run `39589518902`
(dispatch) has no unexpired race artefact. One row per histogram trial; a "trial" here is one burst. Percentiles are
nearest-rank. Script: Appendix A.1.

| Case                        | N     | Runs | Bursts | > 2 ms | ≥ 5 ms | **> 5 ms** | Max (ms) | p95 (ms) |
| --------------------------- | ----- | ---- | ------ | ------ | ------ | ---------- | -------- | -------- |
| `P6-CAL-RACE-001`           | 20    | 13   | 650    | 301    | 13     | **13**     | 7.63     | 4.07     |
| `P6-CAL-RACE-003`           | 2     | 12   | 360    | 2      | 0      | 0          | 2.45     | 0.47     |
| `P6-DOC-RACE-001`           | 2     | 10   | 500    | 0      | 0      | 0          | 0.46     | 0.25     |
| `P6-DOC-RACE-002`           | 10    | 10   | 500    | 0      | 0      | 0          | 1.36     | 0.83     |
| `P6-MED-RACE-001`           | 20    | 14   | 418    | 5      | 1      | **1**      | 5.56     | 1.42     |
| `framework-self-test`       | 20    | 14   | 418    | 16     | 0      | 0          | 3.97     | 1.72     |
| `cal-self-test`             | 20    | 14   | 42     | 1      | 0      | 0          | 4.82     | 1.69     |
| `documenso-self-test`       | 20    | 11   | 503    | 2      | 0      | 0          | 4.50     | 0.73     |
| Medusa extras (4 cases)     | 2-10  | 14   | 168    | 0      | 0      | 0          | 0.65     | n/a      |
| Cal extras (3 racing cases) | 20-21 | 13   | 117    | 50     | 0      | 0          | 3.35     | n/a      |

- The two sequential cases (`extra-overlap-sequential`, `extra-doc-sequential-control`) record `dispatchSpreadMs` 0
  by construction (the requests are sent one after another, not through `fireTogether`). They never go invalid.
- Per `P6-CAL-RACE-001` run (50 bursts): 4 runs had no burst above 5 ms, 5 runs had 1, 4 runs had 2. The worst run is
  2 of 50 (4%).
- Exactly 5.000 ms never occurred: 13 bursts are `≥ 5` and the same 13 are `> 5`. Moving to D2's `<=` changes no
  past verdict.

### 2.3 The slow bursts are mostly the first burst of a run

Split of the same data by trial index (script: Appendix A.2):

| Case              | Trial 1: bursts / mean / max (ms) | Trials 2+: bursts / mean / max (ms) | Trial index of every burst > 5 ms |
| ----------------- | --------------------------------- | ----------------------------------- | --------------------------------- |
| `P6-CAL-RACE-001` | 13 / 5.63 / 7.63                  | 637 / 2.02 / 6.00                   | 1 (nine times), 12, 16, 29, 36    |
| `P6-MED-RACE-001` | 14 / 1.26 / 1.74                  | 404 / 0.70 / 5.56                   | 49                                |
| `P6-CAL-RACE-003` | 12 / 1.56 / 2.45                  | 348 / 0.21 / 0.59                   | none                              |
| `P6-DOC-RACE-002` | 10 / 0.61 / 0.86                  | 490 / 0.51 / 1.36                   | none                              |

The failure that created the stopgap (run 39417270875, §2.4) is also trial 1 (7.33 ms). In every case the first burst
is slower than the later ones. The likely cause is a cold server path (first `POST` to the booking route, first use of
a new connection pool) that the `warm` hook (a `GET` per request) does not touch; this plan does not prove the cause
(see proposed extra X1). What it does show: **a rerun of trial 1 is a warm burst**, which is exactly the case a rerun
rule is for.

### 2.4 Run 39417270875: the failing step behind the 20 ms stopgap

- Run: `39417270875`, event `pull_request`, branch `feat/2026-10-20-p6-cal-stack`, head `e483137`, conclusion
  `failure`, created 2026-10-20T11:45:46Z. Job `medusa-smoke` failed; `cal-smoke` was green.
- Failing step: **"Race self-test (medusa-race, 3 trials)"**. In the log (the job log does not name the violation):

  ```text
  ✘  2 [medusa-race] › tests/medusa/races/med-race-001-oversell.spec.ts:25:3 › P6-MED-RACE-001 Medusa oversell › P6-MED-RACE-001 N carts vs stock S → orders≤S (44.1s)
      Error: expect(received).toBe(expected) // Object.is equality
      Expected: "pass"
      Received: "fail"
    1 failed
    5 passed (1.5m)
  ```

- The violation is in the run's `race-histograms-medusa` artefact (id `12261019690`, not expired):

  | Trial | `ok`  | `dispatchSpreadMs` | Error                                               |
  | ----- | ----- | ------------------ | --------------------------------------------------- |
  | 1     | false | 7.332228999999643  | `TEST BUG: dispatchSpreadMs 7.332228999999643 >= 5` |
  | 2     | true  | 0.9928970000000845 |                                                     |
  | 3     | true  | 2.4554859999989276 |                                                     |

  `RACE_MAX_SPREAD_MS` was unset (default 5). The product oracle was fine in all three trials.

- Label: **TEST BUG** (precondition of the harness), not a product bug. Commit `09d04fe` ("ci(races): allow 20 ms
  dispatch spread on shared runners") added `RACE_MAX_SPREAD_MS: "20"` to the Medusa race step and the Cal
  self-test step. Today the value appears in five steps of `perf.yml`.
- The 20 ms was not derived from data: the only value seen then was 7.33 ms. The largest spread in the 14 runs of §2.2
  is 7.63 ms, so the stopgap hides nothing real today, but it also stops the spread check from meaning anything.

### 2.5 Today's behaviour at a forced low limit (live, cloud VM, proof only)

Medusa brought up with `npm run up:medusa` (exit 0, `/health` 200), `npm run smoke:medusa` green (5 of 5 k6 iterations complete), then
on current `main` code: `RACE_TRIALS=3 RACE_MAX_SPREAD_MS=1 npx playwright test --project=medusa-race -g "P6-MED-RACE-001 N carts"`
(`PRODUCTS_ROOT` and the admin variables set in the shell; the first attempt without `PRODUCTS_ROOT` failed with
`Cal product root does not exist`, which is an ENV gap of this VM, not a test problem).

```text
verdict fail | trials 3 | statusCounts {"200":15,"400":45} | spread min 0.998 max 1.899 mean 1.337
invariantViolations []
trial 1 ok false spread 1.90 {"200":5,"400":15} orderCount 5  ["TEST BUG: dispatchSpreadMs 1.8994730000013078 >= 1"]
trial 2 ok false spread 1.11 {"200":5,"400":15} orderCount 5  ["TEST BUG: dispatchSpreadMs 1.114835000000312 >= 1"]
trial 3 ok true  spread 1.00 {"200":5,"400":15} orderCount 5  []
```

- The Playwright test failed (53.2 s) on `expect(histogram.verdict).toBe("pass")`.
- The oracle was right in every trial: 5 orders for stock 5. Today a perfectly good product result is thrown away
  because of the spread, and **the top-level `invariantViolations` is empty**: the reason is only in `perTrial`. The new
  code writes the "runner too noisy" line to the top level.
- `statusCounts` (15 and 45) include all three bursts, valid or not. The leak check found nothing.

### 2.6 Can each product's setup be repeated inside one trial index?

| Product       | Answer | How, exactly                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Medusa**    | Yes    | An attempt calls `createStockedVariant` (new product, handle `<case prefix>-<tag>-product`, new SKU and inventory item, stock `S` set with `location-levels`) and `prepareReadyCarts` (new carts through `POST /store/carts`). Cart emails may repeat. A **product handle may not repeat while the earlier product still exists** (HTTP 400), so every name uses `attemptTag(trial, attempt)`.                                                     | Live, this VM (Appendix A.4). Output below.                                                                                                                             |
| **Cal**       | Yes    | `createSlotAllocator(...).next()` adds every candidate it returns to a `used` set (`src/cal/api.ts` lines 98 to 119), so a second call in the same trial index returns a different slot. The attendee emails and the `LIKE` patterns of `readWindowAccepted` and `readOverlapPairs` carry `attemptTag`, so an earlier attempt's bookings can never be counted in a later one. Slots are plentiful (28-day windows, up to 6).                       | Code, and `tests/unit/cal-allocator.test.ts` ("keeps the candidate when the overlap read fails once", "never offers a skipped slot again"). Not run live in this probe. |
| **Documenso** | Yes    | `prepareDocument` creates a new envelope, recipients, fields, distribution and signatures on every call. Title and recipient mailboxes now carry `attemptTag`. `envelope/delete` hard-deletes DRAFT and PENDING and soft-deletes COMPLETED, and **`DocumentData` rows survive every delete**, so the delta baseline `docDataCount()` is read at the start of **every attempt** (after the previous attempt's cleanup), never once per trial index. | Task 7 plan §2.11 (live on 2026-10-21) and the code. Not re-run here (Documenso needs Node 24 and a 270 s cold start).                                                  |

Live Medusa output (Appendix A.4, one run, cleanup of everything it created at the end):

```text
attempt 1 product created: yes
attempt 1 cart ready: line-item HTTP 200
same leaf, previous product still present: TEST BUG: POST /admin/products HTTP 400
attempt-specific leaf t1a2, previous product present: created
second cart, same email, new variant: line-item HTTP 200, cartIds differ: true
same leaf after deleteProduct: created
```

### 2.7 Everything that reads spread today

`rg` over the repo (without `docs/plans/`, `node_modules/`), plus `.github/` (hidden, so `rg` skips it unless asked):

| Kind              | Place                                                                                                                                                                                                                     | Reads                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Producer          | `src/races/fire-together.ts:10,63` (`dispatchSpreadMs()`), `trial-record.ts:12,21`                                                                                                                                        | computes and copies the spread                              |
| Env               | `src/races/env.ts:25` `raceMaxSpreadMsFromEnv`                                                                                                                                                                            | `RACE_MAX_SPREAD_MS`, default 5                             |
| Comparison (`>=`) | `src/medusa/invariants.ts:30`, `src/cal/invariants.ts:99` and `:181`, `src/documenso/invariants.ts:104`                                                                                                                   | **removed by this task**                                    |
| Comparison (`>=`) | `tests/medusa/races/framework-self-test.spec.ts:94`, `tests/cal/races/cal-self-test.spec.ts:83`, `tests/documenso/races/documenso-self-test.spec.ts:142`                                                                  | **missed by the roadmap**, migrated to the runner           |
| Run cases         | `src/medusa/run-case.ts`, `src/cal/run-case.ts` (two functions), `src/documenso/run-case.ts`                                                                                                                              | pass `spreadLimit` and collect `spreads`                    |
| Histogram         | `src/races/types.ts:20,39`, `src/races/histogram.ts:38`, `aggregateDispatchSpread`                                                                                                                                        | per-trial value and aggregate                               |
| Unit tests        | `medusa-invariants.test.ts`, `cal-invariants.test.ts` (2 tests and 4 fixtures), `documenso-invariants.test.ts`, `env.test.ts`, `race-table.test.ts`, `histogram.test.ts`, `trial-record.test.ts`, `fire-together.test.ts` | spread cases move to `rerun-on-spread.test.ts`              |
| Docs              | `README.md` lines 45 to 52, 69, 91, 176 (and 221, "spread" in the label list)                                                                                                                                             | wording changes (§17)                                       |
| CI                | `.github/workflows/perf.yml` lines 171, 368, 382, 396, 599: `RACE_MAX_SPREAD_MS: "20"` (5 places)                                                                                                                         | removed (§11)                                               |
| Config            | `.env.example:25`                                                                                                                                                                                                         | two names added                                             |
| Not touched       | `src/ci/playwright-json-summary.ts`, `scripts/write-ci-job-summary.ts`, `tests/unit/documenso-run-case.test.ts`                                                                                                           | no spread access (the roadmap lists the first and the last) |

### 2.8 Cap defaults and the numbers behind them

Model (only the counts of §2.3 go in): for `P6-CAL-RACE-001`, trial 1 is invalid with probability 9/13 = 0.692; every
other burst is invalid with probability p = 4/637 = 0.0063 (95% Wilson upper bound 0.0160). A rerun is a warm burst, so
it is modelled with p. Bursts are treated as independent, which is an assumption (a runner that is noisy for a minute
stays noisy); the budget below is the guard for that. No other case ever exceeded 5 ms often enough to matter. Script:
Appendix A.3.

**Per-trial cap `RACE_MAX_SPREAD_RERUNS` = R (so at most R + 1 bursts for one index):**

| R     | P(trial 1 uses all R reruns), observed p | same, upper-bound p | P(any of 50 indexes exhausts), observed p | same, upper-bound p |
| ----- | ---------------------------------------- | ------------------- | ----------------------------------------- | ------------------- |
| 1     | 4.4e-3                                   | 1.1e-2              | 6.3e-3                                    | 2.4e-2              |
| 2     | 2.7e-5                                   | 1.8e-4              | 3.9e-5                                    | 3.8e-4              |
| **3** | **1.7e-7**                               | **2.9e-6**          | **2.5e-7**                                | **6.1e-6**          |
| 4     | 1.1e-9                                   | 4.6e-8              | 1.6e-9                                    | 9.8e-8              |

Default **3**: the first value where even the upper-bound false-alarm chance per 50-trial run is below one in 100 000,
and a fourth burst for one index still costs only about 1.2 s on Cal (and 16 s on Medusa, where the chance is far lower).
More reruns would only help a runner that is already unusable, and the budget stops that sooner.

**Per-case budget `RACE_MAX_INVALID_SHARE_PCT` = P, budget = max(2, ceil(trials × P / 100)):**

| trials (valid, asked for) | P = 10: budget | chance a healthy runner exceeds it (observed p / upper p) | P = 20: budget | chance (observed p / upper p) |
| ------------------------- | -------------- | --------------------------------------------------------- | -------------- | ----------------------------- |
| 3 (Medusa PR)             | 2              | 1.6e-4 / 1.1e-3                                           | 2              | 1.6e-4 / 1.1e-3               |
| 5 (Cal, Documenso PR)     | 2              | 4.0e-4 / 2.6e-3                                           | 2              | 4.0e-4 / 2.6e-3               |
| 30 (Cal 003 full)         | 3              | 7.6e-4 / 1.1e-2                                           | 6              | 6.0e-8 / 1.3e-5               |
| 50 (full)                 | 5              | 1.7e-5 / 1.3e-3                                           | **10**         | **3.2e-12 / 2.5e-8**          |

Default **20** (observed worst real run: 2 invalid bursts of 50, that is 4%; a budget of 10 is 5 times that). A runner
that wastes 20% of its bursts is not measuring a race. 10% would fail a healthy 30-trial run about once in 100 under the
upper-bound assumption. The **floor of 2** exists because 20% of 3 or 5 trials rounds to 1, and one cold first burst
(69% of Cal runs) must not be able to fail a pull request by itself: with a floor of 1 a single bad second burst would
fail it. Both numbers are open to the owner (Q1).

`RACE_MAX_SPREAD_MS` stays **5**: the data gives no reason (D21). A limit of 5 ms is 1.2 times the Cal p95 (4.07 ms)
and flags 2% of Cal bursts, nearly all of them trial 1, which one rerun fixes.

CI time: an invalid Cal burst costs about 1.2 s (the step comment in `perf.yml`: "~1.2 s per trial"), a Medusa burst up to 16.5 s (Phase 1 D42).
The budget bounds the extra work: at 50 trials at most 10 extra Cal bursts (about 12 s) and 10 extra Medusa bursts
(about 165 s inside a per-test timeout of 1 560 s and a job timeout of 45 min). No timeout changes (D24).

### 2.9 Dry run of this plan's code (scratch copy, not the repo)

The code in §8 and the tests in §13 were built in a scratch copy of the repo (`/tmp` scratchpad, `node_modules`
shared, no git remote), applied in the commit order of §16, with typecheck, Prettier and the unit tests run after each
commit:

| After commit         | `npm run typecheck` | `npm run test:unit`                     |
| -------------------- | ------------------- | --------------------------------------- |
| baseline (`ac563ab`) | 0 errors            | `# tests 299`, `# pass 299`, `# fail 0` |
| 1 framework          | 0 errors            | `# tests 322`, `# pass 322`, `# fail 0` |
| 2 medusa             | 0 errors            | `# tests 321`, `# fail 0`               |
| 3 cal                | 0 errors            | `# tests 319`, `# fail 0`               |
| 4 documenso          | 0 errors            | `# tests 319`, `# fail 0`               |
| 5 self-tests         | 0 errors            | `# tests 319`, `# fail 0`               |
| 6 race table         | 0 errors            | `# tests 323`, `# fail 0`               |
| 7 ci and docs        | 0 errors            | `# tests 323`, `# fail 0`               |

`npm run check` was green on the final state (Prettier, `actionlint`, both typechecks, `4 script(s) ok.`, 323 tests).
`npx playwright test --list` shows `Total: 18 tests in 8 files`, the same as `main`.

Live, Medusa (same VM, same session, `npm run down:medusa` after each, exit 0):

1. All 6 `medusa-race` tests at `RACE_TRIALS=3`, default limits: `6 passed (1.8m)`. Every histogram: `verdict pass`,
   `trials 3`, `invalidTrials 0`, `reruns 0`, 0 violations (zero is a valid result).
2. `RACE_MAX_SPREAD_MS=1`, defaults for the rest (budget 2): the case stopped at trial 1 after three invalid bursts, and
   all three were kept.

   ```text
   verdict fail | trials 3 | invalidTrials 3 | reruns 2 | policy {"limitMs":1,"maxReruns":3,"maxInvalidSharePct":20,"invalidBudget":2}
   statusCounts {} | spread valid {"max":0} invalid {"max":4.12}
   invariantViolations ["TEST BUG: runner too noisy: 3 invalid attempts exceed the budget of 2 (RACE_MAX_INVALID_SHARE_PCT=20 of 3 trials, minimum 2); case stopped at trial 1"]
    trial 1 attempt 1 valid false ok true spread 1.03 {"200":5,"400":15} orderCount 5
    trial 1 attempt 2 valid false ok true spread 1.28 {"200":5,"400":15} orderCount 5
    trial 1 attempt 3 valid false ok true spread 4.12 {"200":5,"400":15} orderCount 5
   ```

3. `RACE_MAX_SPREAD_MS=2`: invalid, rerun, valid, pass.

   ```text
   verdict pass | trials 3 | invalidTrials 1 | reruns 1 | policy {"limitMs":2,"maxReruns":3,"maxInvalidSharePct":20,"invalidBudget":2}
   statusCounts {"200":15,"400":45} | spread valid {"max":1.06} invalid {"max":2.07}
   invariantViolations []
    trial 1 attempt 1 valid true  ok true spread 1.06 {"200":5,"400":15} orderCount 5
    trial 2 attempt 1 valid false ok true spread 2.07 {"200":5,"400":15} orderCount 5
    trial 2 attempt 2 valid true  ok true spread 1.00 {"200":5,"400":15} orderCount 5
    trial 3 attempt 1 valid true  ok true spread 0.76 {"200":5,"400":15} orderCount 5
   ```

   `statusCounts` is 60 = 3 valid trials × 20; the discarded burst keeps its own counts in `perTrial`. The job-summary
   script (`GITHUB_STEP_SUMMARY=<file> node scripts/write-ci-job-summary.ts`) produced this row:

   ```text
   | Case | Trials | Verdict | Key counts | Per-trial time | Invalid / reruns | Outcome |
   | P6-MED-RACE-001 | 3 | pass | accepted per trial 5; oversold trials 0 | 24.01 s | 1 / 1 | No oversell in 4 attempts |
   ```

Cal and Documenso were not run live in the dry run (the task asked for a live Medusa proof only); they are
covered by the unit tests, the typecheck, and the CI jobs on the PR (§15).

### 2.10 Things in the roadmap that this plan changes or corrects

1. **File list.** The roadmap's "Files likely touched" omits `tests/medusa/races/framework-self-test.spec.ts`,
   `tests/cal/races/cal-self-test.spec.ts` and `tests/documenso/races/documenso-self-test.spec.ts` (each has its own
   spread check and its own trial loop), `tests/cal/races/cal-race-001-identical-slot.spec.ts` (asserts
   `perTrial` has `trials` entries), `tests/cal/races/cal-race-003-overlap.spec.ts` and
   `tests/documenso/races/doc-race-001-last-recipients.spec.ts` (annotation text counts "trials"),
   `src/documenso/payloads.ts` (names need the attempt) and `.env.example`. It lists two files that need no change: `src/ci/playwright-json-summary.ts` and `tests/unit/documenso-run-case.test.ts`.
2. **D35 reopen condition.** Phase 1 D35 said the item reopens "if the 50-trial Medusa spread exceeds about 10 ms".
   Medusa's maximum over 418 bursts is 5.56 ms. The condition is **not met**; the item is reopened by the owner's
   decision (roadmap Notes item 1), and the data says the real source of invalid bursts is `P6-CAL-RACE-001`, mostly
   its first burst.
3. **Cap "per trial and per case".** The roadmap says "Cap: per trial and per case (env `RACE_MAX_SPREAD_RERUNS`)", a
   single variable. The agreed design is two limits; this plan names the second `RACE_MAX_INVALID_SHARE_PCT` (D15).
4. **`runTrials` and `perTrial`.** `runTrials` stays unchanged as agreed. `perTrial` now holds attempts, which is not
   what the name says (flagged in §20, D20, with the standard alternative).
5. **PR-size runs will usually contain one rerun for Cal.** Trial 1 is slow in 69% of Cal runs, so a green PR run of
   `P6-CAL-RACE-001` will often show `Invalid / reruns` of `1 / 1`. That is the expected, correct result, not a defect.

## 3. Goal and scope

**Goal.** A race verdict counts only bursts whose requests really left together. When a burst's `dispatchSpreadMs` is
above `RACE_MAX_SPREAD_MS`, the burst is **invalid**: it is kept in the histogram, its data is cleaned and
leak-checked, its product oracle still runs, and the trial index is run again from fresh setup. Two limits stop a
runner that is too noisy. CI stops overriding the limit.

**Agreed decisions applied (all 2026-10-22):**

- **D2 (agreed 2026-10-22).** Valid when `dispatchSpreadMs <= RACE_MAX_SPREAD_MS`, invalid when `>`. One shared
  function decides. The per-product `>=` checks are removed (`src/medusa/invariants.ts`, `src/cal/invariants.ts` both
  places, `src/documenso/invariants.ts`). README is updated.
- **D3 (agreed 2026-10-22).** Only the spread precondition makes a trial invalid. The product oracle still runs on
  invalid attempts. Any product invariant violation in any attempt, valid or invalid, is recorded and fails the case (or
  counts toward an existing `test.fail()` proof). Data is still cleaned up and leak-checked. This answers Phase 1 D35.
- **D4 (agreed 2026-10-22).** Top-level `statusCounts` count valid attempts only. Invalid attempts keep their own record
  in `perTrial` with `attempt` and `valid: false`. `invalidTrials` and `reruns` totals are added. `trials` is the number
  of valid trials asked for.
- **D6 (agreed 2026-10-22, Phase 1 D2).** Trial counts do not change: small on PRs (Medusa 3, others 5), full on `main`,
  nightly and dispatch.
- **Module (agreed 2026-10-22).** New `src/races/rerun-on-spread.ts`. `runTrials` is unchanged.
- **Cap (agreed 2026-10-22).** Two limits, both env-configurable with strict parsing like `positiveIntFromEnv`:
  `RACE_MAX_SPREAD_RERUNS` (reruns per trial index) and a per-case invalid-share budget (named
  `RACE_MAX_INVALID_SHARE_PCT` here). Defaults come from the probe (§2.8). Hitting either limit fails the case as
  `TEST BUG: runner too noisy`, with every attempt kept.
- **Default `RACE_MAX_SPREAD_MS` (agreed 2026-10-22).** Stays 5 unless the probe shows a reason. It does not (D21).
- **Rerun (agreed 2026-10-22).** Full fresh setup (new cart, slot or document) and a new `fireTogether` burst under the
  same trial index.
- **Documenso (agreed 2026-10-22).** The per-trial `DocumentData` delta baseline is re-read at the start of every
  attempt.
- **CI (agreed 2026-10-22).** Remove every `RACE_MAX_SPREAD_MS: "20"` from `.github/workflows/perf.yml`; nothing else in
  CI changes. The job summary and the race table show invalid and rerun counts.

**In:** `src/races/{env,types,histogram,trial-record,rerun-on-spread}.ts`; the three `invariants.ts`; the three
`run-case.ts`; `src/documenso/payloads.ts`; `src/ci/race-table.ts`; the three self-test specs and the three race specs
named in §2.10; unit tests (§13); `perf.yml`; README; `.env.example`.

**Out:** any change to `runTrials`, `fireTogether`, `dispatchSpreadMs()`, `src/oracles/pg.ts`, the harness, a product
fork; new cases; a warm-up burst (proposed extra X1); server-side arrival timestamps (X2); trial-count changes; job
timeouts; Playwright `retries` (stay 0); `test.fail()` outside the existing three proofs.

## 4. Test-case mapping

No new case IDs. Every existing test runs under the new rule; none changes its title, its case ID or its meaning.

| Project          | Tests (18 in 8 files, unchanged count)                                                                                   | What changes in the test                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `medusa-race`    | `framework-self-test`, `P6-MED-RACE-001`, four extras                                                                    | self-test uses the runner; the rest only through `runOversellCase`                                                                                                       |
| `cal-race`       | `cal-self-test`, `P6-CAL-RACE-001` (+ `-002` artefact test), three extras, `P6-CAL-RACE-003`, `extra-overlap-sequential` | self-test uses the runner; `perTrial` length assertion becomes "valid trials = `trials`, total = `trials` + `invalidTrials`"; annotation text for `-003` counts attempts |
| `documenso-race` | `documenso-self-test`, `P6-DOC-RACE-001` (`test.fail()`), the sequential control, `P6-DOC-RACE-002`                      | self-test uses the runner; the `-001` annotation and message count attempts                                                                                              |

`npx playwright test --list` before and after: `Total: 18 tests in 8 files`.

## 5. Extra risky cases (proposed extras; not in scope until the maintainer accepts them)

| #   | Proposed extra                                                                                                                                                                                                                       | Reason (from this probe)                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | **Untimed warm-up burst** of the same shape before trial 1 of each case (not counted, not recorded as a trial).                                                                                                                      | 9 of 13 slow Cal bursts and the run-39417270875 failure are trial 1 (§2.3). A warm-up would remove most reruns; reruns alone handle it correctly but pay one extra setup. Needs the owner's call because it changes the burst count seen by the product (a warm-up booking on Cal consumes a slot).             |
| X2  | **Server-side arrival evidence**, reported not asserted: per trial, the spread of server timestamps already in the oracle (Medusa `order.created_at`, Cal `Booking.createdAt`, Documenso audit-log `createdAt`) as `serverSpreadMs`. | `dispatchSpreadMs` is the Node start spread; README says it is not the time the server received the requests. A valid burst can still be serialised on the way (connection set-up, event-loop stall). Winners only, so it is evidence, not a gate; needs a probe on whether the columns have enough resolution. |
| X3  | **Record the Node event-loop delay during each burst** (`perf_hooks.monitorEventLoopDelay`) in the attempt record.                                                                                                                   | Separates "the runner stalled Node" from "the server was slow" when a burst is invalid. Cheap, local, no product contact.                                                                                                                                                                                       |
| X4  | **Print the invalid/rerun totals per case in the README results table** and in the release evidence at Phase 2 closeout.                                                                                                             | Zero is a valid result, but a creeping rate (e.g. Cal-001 going from 2% to 10%) should be visible before the budget fails a run.                                                                                                                                                                                |
| X5  | **Clock source.** `performance.now()` is monotonic and process-local, so spread has no NTP or wall-clock risk. No action; recorded so nobody "fixes" it with `Date.now()`.                                                           | The spread is a difference of stamps taken in one process. A GC pause or event-loop stall between the stamps makes the spread larger, never smaller, so the failure mode is extra invalid bursts (safe), not hidden serialisation.                                                                              |

## 6. Architecture (every file touched, one responsibility each)

| File                                                                                                                                                | Change  | Responsibility                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/races/rerun-on-spread.ts`                                                                                                                      | **new** | The one spread decision (`isSpreadValid`), the budget, the attempt name (`attemptTag`), the runner (`createRerunRunner`), `validAttempts`, `sumOracle`. |
| `src/races/env.ts`                                                                                                                                  | edit    | `raceMaxSpreadRerunsFromEnv`, `raceMaxInvalidSharePctFromEnv`; `positiveIntFromEnv` gets an optional `max`.                                             |
| `src/races/types.ts`                                                                                                                                | edit    | `SpreadPolicy`; `attempt` and `valid` on `RaceTrialResult`; `invalidTrials`, `reruns`, `invalidDispatchSpreadMs`, `spreadPolicy` on `RaceHistogram`.    |
| `src/races/histogram.ts`, `src/races/trial-record.ts`                                                                                               | edit    | Defaults for the new fields.                                                                                                                            |
| `src/medusa/invariants.ts`, `src/cal/invariants.ts`, `src/documenso/invariants.ts`                                                                  | edit    | Spread inputs and `>=` checks removed.                                                                                                                  |
| `src/medusa/run-case.ts`, `src/cal/run-case.ts`, `src/documenso/run-case.ts`                                                                        | edit    | The trial body becomes an attempt function; the runner owns records, counts and spread aggregates.                                                      |
| `src/documenso/payloads.ts`                                                                                                                         | edit    | `attempt` parameter (default 1) on `recipientEmail`, `recipientBodies`, `documentTitle`.                                                                |
| `src/ci/race-table.ts`                                                                                                                              | edit    | `Invalid / reruns` column; valid-only rates, all-attempt bug counts, "attempts" wording.                                                                |
| `tests/{medusa,cal,documenso}/races/*self-test.spec.ts`                                                                                             | edit    | Use the runner (no own spread check, no own stubs).                                                                                                     |
| `tests/cal/races/cal-race-001-identical-slot.spec.ts`, `cal-race-003-overlap.spec.ts`, `tests/documenso/races/doc-race-001-last-recipients.spec.ts` | edit    | `perTrial` length; annotation and message wording.                                                                                                      |
| `tests/unit/rerun-on-spread.test.ts`                                                                                                                | **new** | 19 tests (§13.1).                                                                                                                                       |
| `tests/unit/{env,histogram,trial-record,race-table,medusa-invariants,cal-invariants,documenso-invariants,documenso-payloads}.test.ts`               | edit    | §13.2.                                                                                                                                                  |
| `.github/workflows/perf.yml`                                                                                                                        | edit    | Remove 5 lines.                                                                                                                                         |
| `README.md`, `.env.example`                                                                                                                         | edit    | §17.                                                                                                                                                    |

Unchanged: `src/races/run-trials.ts`, `fire-together.ts`, `prefix.ts`, `src/oracles/pg.ts`, `src/medusa/{admin,store,oracle,payloads}.ts`,
`src/cal/{api,oracle,payloads}.ts`, `src/documenso/{account,api,env,inbucket,oracle,webhook-receiver}.ts`,
`scripts/*`, `package.json`, `playwright.config.ts`, the harness, the forks, the k6 files.

## 7. Histogram fields

New or changed (every other field is as today):

| Field                     | Where           | Meaning                                                                                                                                  |
| ------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `trials`                  | histogram       | **Valid trials asked for** (`RACE_TRIALS` or the case's cap). Never includes invalid attempts.                                           |
| `perTrial[]`              | histogram       | **One record per attempt**, ordered by `trial` then `attempt` (valid and invalid), plus a stub for an attempt that threw before a burst. |
| `perTrial[].attempt`      | record          | 1 for the first burst of a trial index, 2 for the first rerun.                                                                           |
| `perTrial[].valid`        | record          | `true` when `dispatchSpreadMs <= limit`. A stub has `false` and empty `statuses`.                                                        |
| `statusCounts`            | histogram       | Valid attempts only (D4). Each record keeps its own `statusCounts`.                                                                      |
| `dispatchSpreadMs`        | histogram       | `{min,max,mean}` over valid attempts only.                                                                                               |
| `invalidDispatchSpreadMs` | histogram (new) | `{min,max,mean}` over invalid attempts; all zeros when there are none.                                                                   |
| `invalidTrials`           | histogram (new) | Attempts rejected for spread. A stub is **not** counted.                                                                                 |
| `reruns`                  | histogram (new) | Attempts whose `attempt` is above 1.                                                                                                     |
| `spreadPolicy`            | histogram (new) | `{limitMs, maxReruns, maxInvalidSharePct, invalidBudget}`: the numbers the run used, so the evidence says which limit applied.           |
| `invariantViolations`     | histogram       | Gains the `TEST BUG: runner too noisy ...` line(s) when a limit is hit.                                                                  |

Old histograms (the release zips) lack the new fields; `src/ci/race-table.ts` treats a missing `valid` as valid and
shows `n/a` for the new column.

The invariant `invalidTrials + (valid attempts) = attempts fired` always holds; `reruns <= invalidTrials` holds, and
`reruns = invalidTrials` unless a trial index hit the per-trial cap or the budget (its last invalid attempt had no
rerun).

## 8. Code

All code below was built in the scratch copy of §2.9 and checked; the diffs are against `main` at `ac563ab`. Apply them
in the order of §14. Run `npx prettier --write <file>` after each edit; the diffs are already Prettier-formatted.

### 8.1 `src/races/env.ts`

Two getters, and `positiveIntFromEnv` takes an optional upper bound (default: none, so `RACE_TRIALS` and
`RACE_MAX_SPREAD_MS` behave exactly as before, same error text).

```diff
--- a/src/races/env.ts
+++ b/src/races/env.ts
@@ -7,5 +7,10 @@ function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
 }

-function positiveIntFromEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
+function positiveIntFromEnv(
+  env: NodeJS.ProcessEnv,
+  name: string,
+  defaultValue: number,
+  max = Number.MAX_SAFE_INTEGER,
+): number {
   const raw = env[name];
   if (raw === undefined || raw.trim() === "") return defaultValue;
@@ -13,6 +18,7 @@ function positiveIntFromEnv(env: NodeJS.ProcessEnv, name: string, defaultValue:
   // Whole value must be a positive decimal integer: rejects "3.5", "1e3", "3abc", "0", "-1".
   const n = /^[1-9]\d*$/.test(trimmed) ? Number(trimmed) : Number.NaN;
-  if (!Number.isSafeInteger(n)) {
-    throw new Error(`TEST BUG: ${name} must be an integer >= 1, got ${raw}`);
+  if (!Number.isSafeInteger(n) || n > max) {
+    const range = max === Number.MAX_SAFE_INTEGER ? ">= 1" : `between 1 and ${max}`;
+    throw new Error(`TEST BUG: ${name} must be an integer ${range}, got ${raw}`);
   }
   return n;
@@ -27,4 +33,14 @@ export function raceMaxSpreadMsFromEnv(env: NodeJS.ProcessEnv = process.env): nu
 }

+/** Reruns allowed per trial index when the dispatch spread is above the limit. */
+export function raceMaxSpreadRerunsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
+  return positiveIntFromEnv(env, "RACE_MAX_SPREAD_RERUNS", 3);
+}
+
+/** Share of invalid attempts a case may use, in whole percent of the trials asked for (1 to 100). */
+export function raceMaxInvalidSharePctFromEnv(env: NodeJS.ProcessEnv = process.env): number {
+  return positiveIntFromEnv(env, "RACE_MAX_INVALID_SHARE_PCT", 20, 100);
+}
+
 export function medusaBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
   const raw = env.MEDUSA_BASE_URL?.trim();
```

### 8.2 `src/races/types.ts`

```diff
--- a/src/races/types.ts
+++ b/src/races/types.ts
@@ -13,6 +13,19 @@ export interface RaceRequestResult {
 }

+export interface SpreadPolicy {
+  /** Largest dispatch spread, in ms, that still counts as a valid burst (valid when spread <= limit). */
+  limitMs: number;
+  /** Reruns allowed per trial index. */
+  maxReruns: number;
+  /** Invalid attempts allowed per case, in whole percent of the trials asked for. */
+  maxInvalidSharePct: number;
+}
+
 export interface RaceTrialResult {
   trial: number;
+  /** 1 for the first burst of a trial index, 2 for the first rerun, and so on. */
+  attempt: number;
+  /** False when the burst spread was above the limit: the burst is kept but not counted as a trial. */
+  valid: boolean;
   ok: boolean;
   statuses: Array<number | null>;
@@ -32,10 +45,21 @@ export interface RaceHistogram {
   startedAt: string;
   finishedAt: string;
+  /** Valid trials asked for (RACE_TRIALS). Invalid attempts are not part of this number. */
   trials: number;
   concurrency: number;
+  /** Valid attempts only. Invalid attempts keep their own counts in perTrial. */
   statusCounts: Record<string, number>;
+  /** One record per attempt (valid and invalid), ordered by trial then attempt. */
   perTrial: RaceTrialResult[];
   oracle: Record<string, RaceOracleValue>;
+  /** Valid attempts only. */
   dispatchSpreadMs: { min: number; max: number; mean: number };
+  /** Invalid attempts only (all zeros when there were none). */
+  invalidDispatchSpreadMs: { min: number; max: number; mean: number };
+  /** Attempts rejected because the spread was above the limit. */
+  invalidTrials: number;
+  /** Attempts that were reruns (attempt number above 1). */
+  reruns: number;
+  spreadPolicy: SpreadPolicy & { invalidBudget: number };
   invariantViolations: string[];
   verdict: RaceVerdict;
```

### 8.3 `src/races/histogram.ts` and `src/races/trial-record.ts`

`createHistogram` initialises the new fields; `recordTrial` sets `attempt: 1, valid: true` (the runner overwrites both).

```diff
--- a/src/races/histogram.ts
+++ b/src/races/histogram.ts
@@ -37,4 +37,8 @@ export function createHistogram(input: {
     oracle: {},
     dispatchSpreadMs: { min: 0, max: 0, mean: 0 },
+    invalidDispatchSpreadMs: { min: 0, max: 0, mean: 0 },
+    invalidTrials: 0,
+    reruns: 0,
+    spreadPolicy: { limitMs: 0, maxReruns: 0, maxInvalidSharePct: 0, invalidBudget: 0 },
     invariantViolations: [],
     verdict: "fail",
```

```diff
--- a/src/races/trial-record.ts
+++ b/src/races/trial-record.ts
@@ -16,4 +16,6 @@ export function recordTrial(
   const record: RaceTrialResult = {
     trial,
+    attempt: 1,
+    valid: true,
     ok: true,
     statuses,
```

### 8.4 `src/races/rerun-on-spread.ts` (new, complete file)

Contract, in words:

- `isSpreadValid(spread, limit)` is the only place the comparison exists (`<=`, D2).
- `AttemptFn(attempt)` does one whole attempt: fresh setup, one `fireTogether` burst, the product oracle, cleanup. It
  returns the record from `recordTrial`. It does **not** throw for a product violation (the record carries it); it
  throws only for a broken setup or cleanup, which is never rerun.
- `runner.runTrial(trial, attemptFn)` plugs into the unchanged `runTrials`. It loops attempts 1 to `maxReruns + 1`;
  sets `attempt` and `valid` on each record; stops at the first valid one. It then throws (so `runTrials` marks the
  trial failed) when: the last attempt is still invalid (per-trial cap); the budget was exceeded; or **any** attempt of
  this index, valid or invalid, has `ok === false` (D3). Otherwise it returns the valid record.
- After the budget is exceeded, later `runTrial` calls throw at once without running setup (the CI job stops early).
- `runner.applyTo(histogram)` writes `perTrial`, `statusCounts` (valid only), both spread aggregates, `invalidTrials`,
  `reruns`, `spreadPolicy` and the "runner too noisy" lines.

```ts
import {
  raceMaxInvalidSharePctFromEnv,
  raceMaxSpreadMsFromEnv,
  raceMaxSpreadRerunsFromEnv,
} from "./env.ts";
import { aggregateDispatchSpread, mergeStatusCounts } from "./histogram.ts";
import type { RaceHistogram, RaceTrialResult, SpreadPolicy } from "./types.ts";

/** A case may always spend this many invalid attempts, so a 3- or 5-trial PR run is not failed by one cold burst. */
export const MIN_INVALID_BUDGET = 2;

export function spreadPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): SpreadPolicy {
  return {
    limitMs: raceMaxSpreadMsFromEnv(env),
    maxReruns: raceMaxSpreadRerunsFromEnv(env),
    maxInvalidSharePct: raceMaxInvalidSharePctFromEnv(env),
  };
}

/** The one spread decision (D2): a burst at the limit is valid, above it is invalid. */
export function isSpreadValid(dispatchSpreadMs: number, limitMs: number): boolean {
  return dispatchSpreadMs <= limitMs;
}

/** Invalid attempts a case may spend before it fails as "runner too noisy". */
export function invalidBudget(trials: number, sharePct: number): number {
  return Math.max(MIN_INVALID_BUDGET, Math.ceil((trials * sharePct) / 100));
}

/** Name part for the data of one attempt: attempt 1 keeps today's "t3"; a rerun is "t3a2", "t3a3", ... */
export function attemptTag(trial: number, attempt: number): string {
  return attempt === 1 ? `t${trial}` : `t${trial}a${attempt}`;
}

export function validAttempts(records: readonly RaceTrialResult[]): RaceTrialResult[] {
  return records.filter((r) => r.valid);
}

/** Sum of one numeric oracle key over the given attempts. A missing key counts as 0. */
export function sumOracle(records: readonly RaceTrialResult[], key: string): number {
  return records.reduce((n, r) => n + Number(r.oracle[key] ?? 0), 0);
}

/**
 * One attempt = fresh setup, one fireTogether burst, the product oracle, cleanup. It returns the record
 * built by recordTrial and does not throw for product violations (they are in record.invariantViolations).
 * It throws only when setup or cleanup is broken (a TEST BUG), which is never rerun.
 */
export type AttemptFn = (attempt: number) => Promise<RaceTrialResult>;

export interface RerunRunner {
  /** Plug into runTrials(trials, (trial) => runner.runTrial(trial, attemptFn)). Resolves with the valid record. */
  runTrial(trial: number, attemptFn: AttemptFn): Promise<RaceTrialResult>;
  /** Every burst that was fired (valid and invalid), in firing order. */
  readonly attempts: readonly RaceTrialResult[];
  /** Attempts that threw before a burst record existed. Never counted as invalid trials. */
  readonly stubs: readonly RaceTrialResult[];
  /** "TEST BUG: runner too noisy ..." lines. Product violations stay in the attempt records. */
  readonly violations: readonly string[];
  /** Writes perTrial, statusCounts, spread aggregates, invalidTrials, reruns, spreadPolicy and violations. */
  applyTo(histogram: RaceHistogram): void;
}

function stubRecord(trial: number, attempt: number, message: string): RaceTrialResult {
  return {
    trial,
    attempt,
    valid: false,
    ok: false,
    statuses: [],
    statusCounts: {},
    dispatchSpreadMs: 0,
    oracle: {},
    invariantViolations: [message],
    error: message,
  };
}

export function createRerunRunner(policy: SpreadPolicy, trials: number): RerunRunner {
  const budget = invalidBudget(trials, policy.maxInvalidSharePct);
  const attempts: RaceTrialResult[] = [];
  const stubs: RaceTrialResult[] = [];
  const violations: string[] = [];
  let invalidCount = 0;
  let abortMessage: string | null = null;

  async function runTrial(trial: number, attemptFn: AttemptFn): Promise<RaceTrialResult> {
    if (abortMessage) throw new Error(abortMessage);
    const mine: RaceTrialResult[] = [];

    for (let attempt = 1; attempt <= policy.maxReruns + 1; attempt++) {
      let record: RaceTrialResult;
      try {
        record = await attemptFn(attempt);
      } catch (err) {
        stubs.push(stubRecord(trial, attempt, err instanceof Error ? err.message : String(err)));
        throw err;
      }
      record.attempt = attempt;
      record.valid = isSpreadValid(record.dispatchSpreadMs, policy.limitMs);
      attempts.push(record);
      mine.push(record);
      if (record.valid) break;

      invalidCount += 1;
      if (invalidCount > budget) {
        abortMessage =
          `TEST BUG: runner too noisy: ${invalidCount} invalid attempts exceed the budget of ${budget} ` +
          `(RACE_MAX_INVALID_SHARE_PCT=${policy.maxInvalidSharePct} of ${trials} trials, minimum ${MIN_INVALID_BUDGET}); ` +
          `case stopped at trial ${trial}`;
        violations.push(abortMessage);
        break;
      }
    }

    const last = mine[mine.length - 1]!;
    if (!last.valid) {
      if (abortMessage) throw new Error(abortMessage);
      const spreads = mine.map((r) => r.dispatchSpreadMs.toFixed(2)).join(", ");
      const message =
        `TEST BUG: runner too noisy: trial ${trial} still above RACE_MAX_SPREAD_MS=${policy.limitMs} ` +
        `after ${policy.maxReruns} reruns (spreads ${spreads} ms)`;
      violations.push(message);
      throw new Error(message);
    }
    // D3: a violation in any attempt, valid or invalid, fails the trial index.
    const failed = mine.find((r) => !r.ok);
    if (failed) {
      throw new Error(failed.error ?? failed.invariantViolations[0] ?? "TEST BUG: attempt failed");
    }
    return last;
  }

  function applyTo(histogram: RaceHistogram): void {
    const valid = attempts.filter((a) => a.valid);
    const invalid = attempts.filter((a) => !a.valid);
    histogram.perTrial = [...attempts, ...stubs].sort(
      (a, b) => a.trial - b.trial || a.attempt - b.attempt,
    );
    histogram.statusCounts = {};
    for (const a of valid) mergeStatusCounts(histogram.statusCounts, a.statusCounts);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(valid.map((a) => a.dispatchSpreadMs));
    histogram.invalidDispatchSpreadMs = aggregateDispatchSpread(
      invalid.map((a) => a.dispatchSpreadMs),
    );
    histogram.invalidTrials = invalid.length;
    histogram.reruns = attempts.filter((a) => a.attempt > 1).length;
    histogram.spreadPolicy = { ...policy, invalidBudget: budget };
    histogram.invariantViolations.push(...violations);
  }

  return { runTrial, attempts, stubs, violations, applyTo };
}
```

### 8.5 The three `invariants.ts`

Remove the two fields from each input type and the `>=` block. Nothing else in these files changes.

```diff
--- a/src/medusa/invariants.ts
+++ b/src/medusa/invariants.ts
@@ -17,6 +17,4 @@ export function checkOversellInvariants(input: {
   loserMessages: string[];
   loserQuantities: number[];
-  dispatchSpreadMs: number;
-  spreadLimit: number;
 }): string[] {
   const violations: string[] = [];
@@ -28,8 +26,4 @@ export function checkOversellInvariants(input: {
   }

-  if (input.dispatchSpreadMs >= input.spreadLimit) {
-    violations.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
-  }
-
   if (input.orderCount > input.s || input.reservationQty > input.s || input.orderQty > input.s) {
     violations.push("PRODUCT BUG: oversold");
```

```diff
--- a/src/cal/invariants.ts
+++ b/src/cal/invariants.ts
@@ -51,6 +51,4 @@ export function checkIdenticalSlotInvariants(input: {
   responses: ParsedResponse[];
   accepted: AcceptedRow[];
-  dispatchSpreadMs: number;
-  spreadLimit: number;
   setupEvidence?: string; // overlapEvidence() of the host's bookings in the slot, read before firing
 }): string[] {
@@ -97,8 +95,4 @@ export function checkIdenticalSlotInvariants(input: {
   }

-  if (input.dispatchSpreadMs >= input.spreadLimit) {
-    out.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
-  }
-
   return out;
 }
@@ -140,6 +134,4 @@ export function checkOverlapPairGuards(input: {
   responses: ParsedResponse[];
   windowAccepted: SlotRow[];
-  dispatchSpreadMs: number;
-  spreadLimit: number;
   expectedResponses?: number; // default 2
   setupEvidence?: string; // overlapEvidence() of the host's bookings in the window, read before firing
@@ -179,7 +171,4 @@ export function checkOverlapPairGuards(input: {
     );
   }
-  if (input.dispatchSpreadMs >= input.spreadLimit) {
-    out.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
-  }
   return out;
 }
```

```diff
--- a/src/documenso/invariants.ts
+++ b/src/documenso/invariants.ts
@@ -60,6 +60,4 @@ export type TrialInput = {
   burst: number; // completions fired in the trial: 2 for 001 and the control, 10 for 002
   classes: CompletionClass[]; // one per completion request
-  spreadMs: number;
-  spreadLimitMs: number;
   snapshot: TrialSnapshot;
 };
@@ -102,7 +100,4 @@ export function checkCompletionTrial(input: TrialInput): string[] {
   }

-  if (input.spreadMs >= input.spreadLimitMs) {
-    v.push(`TEST BUG: dispatchSpreadMs ${input.spreadMs} >= ${input.spreadLimitMs}`);
-  }
   if (counts["server-error"] > 0)
     v.push(`${label}: completion HTTP 5xx x${counts["server-error"]}`);
```

### 8.6 `src/medusa/run-case.ts`

The mechanical recipe (the same for Cal and Documenso):

1. Import `attemptTag`, `createRerunRunner`, `spreadPolicyFromEnv` (and `sumOracle`, `validAttempts` where aggregates
   are rebuilt); drop `aggregateDispatchSpread`, `mergeStatusCounts`, `raceMaxSpreadMsFromEnv`.
2. `const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);` replaces `spreads`, `perTrial` and
   `spreadLimit`.
3. The old `runTrials(..., async (trial) => { ... })` callback becomes `const runAttempt = async (trial, attempt) => {
... }` returning the record, and the call becomes `runTrials(n, (trial) => runner.runTrial(trial, (attempt) =>
runAttempt(trial, attempt)))`.
4. Every name that must be unique per attempt uses `attemptTag(trial, attempt)` (product leaf, emails, patterns).
5. Delete the lines that push the record, push the spread, merge the counts, and `throw` when `!record.ok`; end the
   `try` with `return record;` (the `finally` cleanup stays as it is).
6. Delete the stub block and the `histogram.perTrial = ...` and `aggregateDispatchSpread` lines; call
   `runner.applyTo(histogram);` instead.

```diff
--- a/src/medusa/run-case.ts
+++ b/src/medusa/run-case.ts
@@ -1,12 +1,8 @@
 import { fireTogether } from "../races/fire-together.ts";
 import { runTrials } from "../races/run-trials.ts";
-import {
-  aggregateDispatchSpread,
-  createHistogram,
-  mergeStatusCounts,
-  writeHistogram,
-} from "../races/histogram.ts";
+import { createHistogram, writeHistogram } from "../races/histogram.ts";
+import { attemptTag, createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
 import { recordTrial } from "../races/trial-record.ts";
-import { medusaBaseUrlFromEnv, raceMaxSpreadMsFromEnv } from "../races/env.ts";
+import { medusaBaseUrlFromEnv } from "../races/env.ts";
 import type { RaceHistogram, RaceTrialResult } from "../races/types.ts";
 import type pg from "pg";
@@ -59,5 +55,4 @@ export type RunOversellCaseInput = {

 export async function runOversellCase(input: RunOversellCaseInput): Promise<RaceHistogram> {
-  const spreadLimit = raceMaxSpreadMsFromEnv();
   const base = medusaBaseUrlFromEnv();
   const dataPrefix = casePrefix(input.runPrefix, input.caseId);
@@ -70,6 +65,5 @@ export async function runOversellCase(input: RunOversellCaseInput): Promise<Race
   });

-  const spreads: number[] = [];
-  const perTrial: RaceTrialResult[] = [];
+  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
   const inventoryItemIds: string[] = [];
   const cleanupViolations: string[] = [];
@@ -77,6 +71,7 @@ export async function runOversellCase(input: RunOversellCaseInput): Promise<Race

   try {
-    const trialResults = await runTrials(input.trials, async (trial) => {
-      const trialLeaf = `t${trial}`;
+    // One attempt = fresh product, fresh carts, one burst, oracle, cleanup. The runner decides about reruns.
+    const runAttempt = async (trial: number, attempt: number): Promise<RaceTrialResult> => {
+      const trialLeaf = attemptTag(trial, attempt);
       const productLeaf = `${trialLeaf}-product`;
       const orderIds: string[] = [];
@@ -236,6 +231,4 @@ export async function runOversellCase(input: RunOversellCaseInput): Promise<Race
             loserMessages,
             loserQuantities,
-            dispatchSpreadMs: fired.dispatchSpreadMs,
-            spreadLimit,
           });
           if (violations.length > 0) {
@@ -263,11 +256,5 @@ export async function runOversellCase(input: RunOversellCaseInput): Promise<Race
         }

-        perTrial.push(record);
-        spreads.push(record.dispatchSpreadMs);
-        mergeStatusCounts(histogram.statusCounts, record.statusCounts);
-
-        if (!record.ok) {
-          throw new Error(record.error);
-        }
+        return record;
       } finally {
         for (const orderId of [...new Set(orderIds)]) {
@@ -293,23 +280,11 @@ export async function runOversellCase(input: RunOversellCaseInput): Promise<Race
         }
       }
-    });
-
-    const recorded = new Set(perTrial.map((t) => t.trial));
-    for (const failed of trialResults.filter((t) => !t.ok && !recorded.has(t.trial))) {
-      perTrial.push({
-        trial: failed.trial,
-        ok: false,
-        statuses: [],
-        statusCounts: {},
-        dispatchSpreadMs: 0,
-        oracle: {},
-        invariantViolations: failed.error ? [failed.error] : [],
-        error: failed.error,
-      });
-    }
+    };

-    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
-    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);
+    const trialResults = await runTrials(input.trials, (trial) =>
+      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
+    );

+    runner.applyTo(histogram);
     histogram.invariantViolations.push(
       ...cleanupViolations,
```

### 8.7 `src/cal/run-case.ts` (two functions)

Same recipe. Additional points, all visible in the diff:

- `failedTrialRecords` is deleted; `runner.stubs` replaces it (Cal-003 still copies a stub's error into
  `guardViolations`).
- Aggregates that used to be accumulated inside the trial body are rebuilt after the loop from the attempt records.
  **Rates use `validAttempts`** (losers, `acceptedTotal`, outcomes); **bug counters use every attempt**
  (`pairsByAttempt` / `overlapPairs` / `doubleBookSummary`, `allResponses`, `guardViolations`, skipped-window evidence).
  This is decision D16.
- `trialPattern` for `-003` becomes `...-<tag>-`; `-t1-` and `-t1a2-` never match each other.
- `record.oracle.refusedTraceIds` now carries the tag prefix (`t3:` or `t3a2:`); the histogram-level string keeps the old
  `t3:<id>` shape for attempt 1.

```diff
--- a/src/cal/run-case.ts
+++ b/src/cal/run-case.ts
@@ -2,12 +2,14 @@ import type pg from "pg";
 import { fireTogether, summariseBody } from "../races/fire-together.ts";
 import { runTrials } from "../races/run-trials.ts";
+import { createHistogram, writeHistogram } from "../races/histogram.ts";
 import {
-  aggregateDispatchSpread,
-  createHistogram,
-  mergeStatusCounts,
-  writeHistogram,
-} from "../races/histogram.ts";
+  attemptTag,
+  createRerunRunner,
+  spreadPolicyFromEnv,
+  sumOracle,
+  validAttempts,
+} from "../races/rerun-on-spread.ts";
 import { recordTrial } from "../races/trial-record.ts";
-import { calBaseUrlFromEnv, raceMaxSpreadMsFromEnv } from "../races/env.ts";
+import { calBaseUrlFromEnv } from "../races/env.ts";
 import type { RaceHistogram, RaceRequestResult, RaceTrialResult } from "../races/types.ts";
 import {
@@ -28,5 +30,4 @@ import {
   refusedLegs,
   type OverlapLoserKind,
-  type LoserKind,
   type ParsedResponse,
 } from "./invariants.ts";
@@ -55,11 +56,4 @@ import {
 export type IdenticalSlotMode = "distinct" | "sameAttendee" | "spellings";

-const LOSER_KINDS: LoserKind[] = [
-  "slot-taken",
-  "booking-conflict",
-  "db-unique-redacted",
-  "unexpected",
-];
-
 function makeCanceller(cleanupViolations: string[]) {
   return async (uid: string, cancelled: Set<string>) => {
@@ -74,21 +68,10 @@ function makeCanceller(cleanupViolations: string[]) {
 }

-function failedTrialRecords(
-  trialResults: Array<{ trial: number; ok: boolean; error?: string }>,
-  perTrial: RaceTrialResult[],
-): RaceTrialResult[] {
-  const recorded = new Set(perTrial.map((t) => t.trial));
-  return trialResults
-    .filter((t) => !t.ok && !recorded.has(t.trial))
-    .map((failed) => ({
-      trial: failed.trial,
-      ok: false,
-      statuses: [],
-      statusCounts: {},
-      dispatchSpreadMs: 0,
-      oracle: {},
-      invariantViolations: failed.error ? [failed.error] : [],
-      error: failed.error,
-    }));
+/** The skipped-window notes of every attempt, joined as before (empty notes dropped). */
+function skippedEvidenceOf(attempts: readonly RaceTrialResult[]): string {
+  return attempts
+    .map((a) => String(a.oracle.skippedWindowEvidence ?? ""))
+    .filter(Boolean)
+    .join(" | ");
 }

@@ -118,5 +101,4 @@ export async function runIdenticalSlotCase(input: {
   trials: number;
 }): Promise<{ histogram: RaceHistogram; responses: ParsedResponse[] }> {
-  const spreadLimit = raceMaxSpreadMsFromEnv();
   const base = calBaseUrlFromEnv();
   const dataPrefix = casePrefix(input.runPrefix, input.caseId);
@@ -130,23 +112,14 @@ export async function runIdenticalSlotCase(input: {
   });

-  const spreads: number[] = [];
-  const perTrial: RaceTrialResult[] = [];
-  const allResponses: ParsedResponse[] = [];
+  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
+  const allResponses: ParsedResponse[] = []; // every attempt: a product violation in an invalid attempt counts (D3)
   const cleanupViolations: string[] = [];
-  const loserTotals: Record<LoserKind, number> = {
-    "slot-taken": 0,
-    "booking-conflict": 0,
-    "db-unique-redacted": 0,
-    unexpected: 0,
-  };
-  let acceptedTotal = 0;
   let leakAccepted = 0;
-  let skippedTotal = 0;
-  const skippedNotes: string[] = [];

   const cancelQuietly = makeCanceller(cleanupViolations);

   try {
-    const trialResults = await runTrials(input.trials, async (trial) => {
+    const runAttempt = async (trial: number, attempt: number): Promise<RaceTrialResult> => {
+      const tag = attemptTag(trial, attempt);
       const cancelled = new Set<string>();
       const winnerUids: string[] = [];
@@ -164,6 +137,4 @@ export async function runIdenticalSlotCase(input: {
         );
         const setupEvidence = overlapEvidence(slot.start, slot.end, setupOverlaps);
-        skippedTotal += slot.skipped.length;
-        skippedNotes.push(skippedEvidence(slot.skipped));
         const rawBodies: string[] = Array.from({ length: input.n }, () => "");
         const spelled = timeSpellings(slot.start);
@@ -175,6 +146,6 @@ export async function runIdenticalSlotCase(input: {
             const leaf =
               input.mode === "sameAttendee"
-                ? `t${trial}-same`
-                : `t${trial}-c${String(i).padStart(2, "0")}`;
+                ? `${tag}-same`
+                : `${tag}-c${String(i).padStart(2, "0")}`;
             const result = await createBooking(
               bookingBody({
@@ -224,6 +195,4 @@ export async function runIdenticalSlotCase(input: {
           kinds[classifyLoser(r.status, r.message)] += 1;
         }
-        for (const k of LOSER_KINDS) loserTotals[k] += kinds[k];
-        acceptedTotal += accepted.length;

         const record = recordTrial(trial, fired, () => {
@@ -232,6 +201,4 @@ export async function runIdenticalSlotCase(input: {
             responses,
             accepted,
-            dispatchSpreadMs: fired.dispatchSpreadMs,
-            spreadLimit,
             setupEvidence,
           });
@@ -258,9 +225,5 @@ export async function runIdenticalSlotCase(input: {
         };

-        perTrial.push(record);
-        spreads.push(record.dispatchSpreadMs);
-        mergeStatusCounts(histogram.statusCounts, record.statusCounts);
-
-        if (!record.ok) throw new Error(record.error);
+        return record;
       } finally {
         for (const uid of winnerUids) await cancelQuietly(uid, cancelled);
@@ -272,10 +235,11 @@ export async function runIdenticalSlotCase(input: {
         }
       }
-    });
-
-    perTrial.push(...failedTrialRecords(trialResults, perTrial));
+    };

-    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
-    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);
+    const trialResults = await runTrials(input.trials, (trial) =>
+      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
+    );
+    runner.applyTo(histogram);
+    const valid = validAttempts(runner.attempts);

     // Sweep: cancel anything of this case still holding a slot, then the leak check wants 0.
@@ -287,11 +251,11 @@ export async function runIdenticalSlotCase(input: {
       hostUserId: input.setup.userId,
       eventTypeId: input.setup.eventTypeId,
-      skippedWindows: skippedTotal,
-      skippedWindowEvidence: skippedNotes.filter(Boolean).join(" | "),
-      "loser_slot-taken": loserTotals["slot-taken"],
-      "loser_booking-conflict": loserTotals["booking-conflict"],
-      "loser_db-unique-redacted": loserTotals["db-unique-redacted"],
-      loser_unexpected: loserTotals.unexpected,
-      acceptedTotal,
+      skippedWindows: sumOracle(runner.attempts, "skippedWindows"), // every attempt: environment evidence
+      skippedWindowEvidence: skippedEvidenceOf(runner.attempts),
+      "loser_slot-taken": sumOracle(valid, "loser_slot-taken"), // rates: valid attempts only (D4)
+      "loser_booking-conflict": sumOracle(valid, "loser_booking-conflict"),
+      "loser_db-unique-redacted": sumOracle(valid, "loser_db-unique-redacted"),
+      loser_unexpected: sumOracle(valid, "loser_unexpected"),
+      acceptedTotal: sumOracle(valid, "acceptedCount"),
       leakAccepted,
     };
@@ -339,5 +303,4 @@ export async function runOverlapPairCase(input: {
   doubleBook: ReturnType<typeof doubleBookSummary>; // D16
 }> {
-  const spreadLimit = raceMaxSpreadMsFromEnv();
   const base = calBaseUrlFromEnv();
   const dataPrefix = casePrefix(input.runPrefix, input.caseId);
@@ -351,29 +314,19 @@ export async function runOverlapPairCase(input: {
   });

-  const spreads: number[] = [];
-  const perTrial: RaceTrialResult[] = [];
+  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
   const cleanupViolations: string[] = [];
-  const guardViolations: string[] = [];
-  const pairsByTrial: number[] = Array.from({ length: input.trials }, () => 0);
-  const refusedTraceIds: string[] = [];
-  const loserTotals: Record<OverlapLoserKind, number> = {
-    "slot-taken": 0,
-    "booking-conflict": 0,
-    "refused-db-error": 0,
-    unexpected: 0,
-  };
-  const outcomes = { both: 0, "60_only": 0, "30_only": 0, none: 0 };
+  const guardViolations: string[] = []; // every attempt: a violation in an invalid attempt counts (D3)
+  const pairsByAttempt: number[] = []; // every attempt, in firing order
   let overlapPairs = 0;
   let leakAccepted = 0;
-  let skippedTotal = 0;
-  const skippedNotes: string[] = [];

   const cancelQuietly = makeCanceller(cleanupViolations);

   try {
-    const trialResults = await runTrials(input.trials, async (trial) => {
+    const runAttempt = async (trial: number, attempt: number): Promise<RaceTrialResult> => {
+      const tag = attemptTag(trial, attempt);
       const cancelled = new Set<string>();
       const winnerUids: string[] = [];
-      const trialPattern = likeLiteralPrefix(`${dataPrefix}-t${trial}-`);
+      const trialPattern = likeLiteralPrefix(`${dataPrefix}-${tag}-`);

       try {
@@ -387,6 +340,4 @@ export async function runOverlapPairCase(input: {
         );
         const setupEvidence = overlapEvidence(window.start, window.end, setupOverlaps);
-        skippedTotal += window.skipped.length;
-        skippedNotes.push(skippedEvidence(window.skipped));
         const seq = input.mode === "sequential" ? sequentialPlan(trial) : null;
         const shape = seq ? seq.shape : overlapShapeForTrial(trial);
@@ -406,5 +357,5 @@ export async function runOverlapPairCase(input: {
               start: leg.start,
               end: leg.end,
-              email: attendeeEmail(dataPrefix, `t${trial}-r${leg.role}`),
+              email: attendeeEmail(dataPrefix, `${tag}-r${leg.role}`),
               name: `p6 r${leg.role}`,
               eventTypeId: leg.eventTypeId,
@@ -475,6 +426,4 @@ export async function runOverlapPairCase(input: {
           responses,
           windowAccepted,
-          dispatchSpreadMs: fired.dispatchSpreadMs,
-          spreadLimit,
           setupEvidence,
         });
@@ -494,7 +443,5 @@ export async function runOverlapPairCase(input: {
           kinds[classifyOverlapLoser(r.status, r.message)] += 1;
         }
-        for (const k of Object.keys(kinds) as OverlapLoserKind[]) loserTotals[k] += kinds[k];
         const refused = refusedLegs(responses).map((l) => l.traceId);
-        refusedTraceIds.push(...refused.map((id) => `t${trial}:${id}`));

         const winners = winnerRoles.includes("60")
@@ -505,8 +452,4 @@ export async function runOverlapPairCase(input: {
             ? "30"
             : "none";
-        if (winners === "60+30") outcomes.both += 1;
-        else if (winners === "60") outcomes["60_only"] += 1;
-        else if (winners === "30") outcomes["30_only"] += 1;
-        else outcomes.none += 1;

         const record = recordTrial(trial, fired, () => {
@@ -527,18 +470,13 @@ export async function runOverlapPairCase(input: {
           "loser_refused-db-error": kinds["refused-db-error"],
           loser_unexpected: kinds.unexpected,
-          refusedTraceIds: refused.join(","),
+          refusedTraceIds: refused.map((id) => `${tag}:${id}`).join(","),
           skippedWindows: window.skipped.length,
           skippedWindowEvidence: skippedEvidence(window.skipped),
         };

-        guardViolations.push(...guards.map((g) => `t${trial}: ${g}`));
-        pairsByTrial[trial - 1] = pairs.length;
-        overlapPairs += pairs.length;
-
-        perTrial.push(record);
-        spreads.push(record.dispatchSpreadMs);
-        mergeStatusCounts(histogram.statusCounts, record.statusCounts);
+        guardViolations.push(...guards.map((g) => `${tag}: ${g}`));
+        pairsByAttempt.push(pairs.length);

-        if (!record.ok) throw new Error(record.error);
+        return record;
       } finally {
         for (const uid of winnerUids) await cancelQuietly(uid, cancelled);
@@ -546,14 +484,15 @@ export async function runOverlapPairCase(input: {
         for (const row of live) await cancelQuietly(row.uid, cancelled);
       }
-    });
+    };

-    const failedRecords = failedTrialRecords(trialResults, perTrial);
-    for (const failed of failedRecords) {
-      guardViolations.push(`t${failed.trial}: ${failed.error ?? "trial failed"}`);
+    const trialResults = await runTrials(input.trials, (trial) =>
+      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
+    );
+    runner.applyTo(histogram);
+    for (const stub of runner.stubs) {
+      guardViolations.push(`t${stub.trial}a${stub.attempt}: ${stub.error ?? "trial failed"}`);
     }
-    perTrial.push(...failedRecords);
-
-    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
-    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);
+    const valid = validAttempts(runner.attempts);
+    overlapPairs = pairsByAttempt.reduce((a, b) => a + b, 0);

     const swept = await sweepAndLeakCheck(input.pool, leakPattern, cancelQuietly);
@@ -564,17 +503,20 @@ export async function runOverlapPairCase(input: {
       eventTypeId30: input.setup.eventTypeId30,
       eventTypeId60: input.setup.eventTypeId60,
-      ...doubleBookSummary(pairsByTrial),
-      outcome_both: outcomes.both,
-      outcome_60_only: outcomes["60_only"],
-      outcome_30_only: outcomes["30_only"],
-      outcome_none: outcomes.none,
-      "loser_slot-taken": loserTotals["slot-taken"],
-      "loser_booking-conflict": loserTotals["booking-conflict"],
-      "loser_refused-db-error": loserTotals["refused-db-error"],
-      loser_unexpected: loserTotals.unexpected,
-      refusedTraceIds: refusedTraceIds.join(","),
+      ...doubleBookSummary(pairsByAttempt), // every attempt: a double booking in an invalid attempt counts (D3)
+      outcome_both: valid.filter((a) => a.oracle.winners === "60+30").length, // rates: valid attempts only (D4)
+      outcome_60_only: valid.filter((a) => a.oracle.winners === "60").length,
+      outcome_30_only: valid.filter((a) => a.oracle.winners === "30").length,
+      outcome_none: valid.filter((a) => a.oracle.winners === "none").length,
+      "loser_slot-taken": sumOracle(valid, "loser_slot-taken"),
+      "loser_booking-conflict": sumOracle(valid, "loser_booking-conflict"),
+      "loser_refused-db-error": sumOracle(valid, "loser_refused-db-error"),
+      loser_unexpected: sumOracle(valid, "loser_unexpected"),
+      refusedTraceIds: runner.attempts
+        .map((a) => String(a.oracle.refusedTraceIds ?? ""))
+        .filter(Boolean)
+        .join(","),
       leakAccepted,
-      skippedWindows: skippedTotal,
-      skippedWindowEvidence: skippedNotes.filter(Boolean).join(" | "),
+      skippedWindows: sumOracle(runner.attempts, "skippedWindows"),
+      skippedWindowEvidence: skippedEvidenceOf(runner.attempts),
     };
     histogram.invariantViolations.push(...cleanupViolations, ...swept.leak);
@@ -592,5 +534,5 @@ export async function runOverlapPairCase(input: {
     guardViolations,
     overlapPairs,
-    doubleBook: doubleBookSummary(pairsByTrial),
+    doubleBook: doubleBookSummary(pairsByAttempt),
   };
 }
```

### 8.8 Documenso: `src/documenso/payloads.ts` and `src/documenso/run-case.ts`

`recipientEmail`, `recipientBodies` and `documentTitle` get a last parameter `attempt = 1` and use `attemptTag`, so
attempt 1 produces today's exact strings (no existing payload test changes) and a rerun produces `...-t3a2-r0@...`.

```diff
--- a/src/documenso/payloads.ts
+++ b/src/documenso/payloads.ts
@@ -1,3 +1,4 @@
 // Pure request bodies and parsers for the Documenso completion races (plan §8.1). No I/O.
+import { attemptTag } from "../races/rerun-on-spread.ts";

 export type RecipientBody = {
@@ -10,14 +11,19 @@ export type RecipientBody = {

 /** One recipient mailbox per trial (plan D19). Lowercase, so Inbucket's mailbox name is stable. */
-export function recipientEmail(casePfx: string, trial: number, index: number): string {
-  return `${casePfx}-t${trial}-r${index}@example.com`;
+export function recipientEmail(casePfx: string, trial: number, index: number, attempt = 1): string {
+  return `${casePfx}-${attemptTag(trial, attempt)}-r${index}@example.com`;
 }

-export function recipientBodies(casePfx: string, trial: number, count: number): RecipientBody[] {
+export function recipientBodies(
+  casePfx: string,
+  trial: number,
+  count: number,
+  attempt = 1,
+): RecipientBody[] {
   if (!Number.isInteger(count) || count < 1) {
     throw new Error("TEST BUG: recipientBodies count must be an integer >= 1");
   }
   return Array.from({ length: count }, (_, index) => ({
-    email: recipientEmail(casePfx, trial, index),
+    email: recipientEmail(casePfx, trial, index, attempt),
     name: `P6 Signer ${index}`,
     role: "SIGNER" as const,
@@ -28,6 +34,6 @@ export function recipientBodies(casePfx: string, trial: number, count: number):

 /** Document title. The case prefix comes first so the leak LIKE pattern matches it (plan §9). */
-export function documentTitle(casePfx: string, trial: number, label: string): string {
-  return `${casePfx} t${trial} ${label}`;
+export function documentTitle(casePfx: string, trial: number, label: string, attempt = 1): string {
+  return `${casePfx} ${attemptTag(trial, attempt)} ${label}`;
 }

```

In `run-case.ts`: the baseline `docDataBefore` is read **inside** the attempt function, first line, after the previous
attempt's cleanup (D18). `prepareDocument` takes `attempt`. `CaseResult` gets `attempts` (bursts fired) so the specs can
word their annotations; `doubleSealTrials` counts every attempt (D3). The histogram aggregates follow D16: `signed`,
`alreadySigned`, `envelopeCompleted`, `trialsSingleSeal` use valid attempts (the specs compare them with `trials`
multiples); `trialsDoubleSeal`, `sealJobsRetriedTotal`, `clientErrorResponses`, `serverErrorResponses` use every
attempt.

```diff
--- a/src/documenso/run-case.ts
+++ b/src/documenso/run-case.ts
@@ -3,12 +3,12 @@ import { readFile } from "node:fs/promises";
 import path from "node:path";
 import type pg from "pg";
-import { raceMaxSpreadMsFromEnv } from "../races/env.ts";
 import { fireTogether, summariseBody } from "../races/fire-together.ts";
+import { createHistogram, writeHistogram } from "../races/histogram.ts";
 import {
-  aggregateDispatchSpread,
-  createHistogram,
-  mergeStatusCounts,
-  writeHistogram,
-} from "../races/histogram.ts";
+  createRerunRunner,
+  spreadPolicyFromEnv,
+  sumOracle,
+  validAttempts,
+} from "../races/rerun-on-spread.ts";
 import { runTrials } from "../races/run-trials.ts";
 import { recordTrial } from "../races/trial-record.ts";
@@ -254,10 +254,17 @@ export type TrialDoc = {
 export async function prepareDocument(
   ctx: RunContext,
-  opts: { casePfx: string; trial: number; count: number; label: string; pdf: Uint8Array },
+  opts: {
+    casePfx: string;
+    trial: number;
+    attempt: number;
+    count: number;
+    label: string;
+    pdf: Uint8Array;
+  },
 ): Promise<TrialDoc> {
-  const title = documentTitle(opts.casePfx, opts.trial, opts.label);
+  const title = documentTitle(opts.casePfx, opts.trial, opts.label, opts.attempt);
   const envelopeId = await createEnvelope(ctx.baseUrl, ctx.apiToken, title, opts.pdf);
   ctx.envelopeIds.push(envelopeId); // registered before the rest, so endRun deletes it if a later step fails
-  const bodies = recipientBodies(opts.casePfx, opts.trial, opts.count);
+  const bodies = recipientBodies(opts.casePfx, opts.trial, opts.count, opts.attempt);
   const recipientIds = await createRecipients(ctx.baseUrl, ctx.apiToken, envelopeId, bodies);
   const env = await getEnvelope(ctx.baseUrl, ctx.apiToken, envelopeId);
@@ -382,5 +389,6 @@ export type CaseResult = {
   productViolations: string[]; // every "PRODUCT BUG: …" line, across trials
   testViolations: string[]; // everything else: TEST BUG, ENV, TEST BUG (control)
-  doubleSealTrials: number;
+  doubleSealTrials: number; // attempts (valid and invalid) that sealed twice (D3)
+  attempts: number; // every burst that was fired: valid trials plus invalid attempts
 };

@@ -403,5 +411,4 @@ export async function runCompletionCase(input: {
   const burst = input.mode === "same-recipient" ? 10 : 2;
   const recipientCount = input.mode === "same-recipient" ? 1 : 2;
-  const spreadLimit = raceMaxSpreadMsFromEnv();
   const casePfx = casePrefix(input.runPrefix, input.caseId);
   const pdf = await readFixturePdf();
@@ -415,10 +422,11 @@ export async function runCompletionCase(input: {
     trials: input.trials,
   });
-  const perTrial: RaceTrialResult[] = [];
-  const spreads: number[] = [];
+  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
   const violations: string[] = [];
   const recipientMailboxes: string[] = [];
   try {
-    const results = await runTrials(input.trials, async (trial) => {
+    const runAttempt = async (trial: number, attempt: number): Promise<RaceTrialResult> => {
+      // Re-read at the start of every attempt: DocumentData rows survive envelope/delete, so an invalid
+      // attempt's rows must be in this baseline, never in the next attempt's delta (phase 2 task 1 plan, D18).
       const docDataBefore = await docDataCount(ctx.pool);
       let doc: TrialDoc | null = null;
@@ -427,4 +435,5 @@ export async function runCompletionCase(input: {
           casePfx,
           trial,
+          attempt,
           count: recipientCount,
           label: input.mode,
@@ -456,6 +465,4 @@ export async function runCompletionCase(input: {
           burst,
           classes,
-          spreadMs: fired.dispatchSpreadMs,
-          spreadLimitMs: spreadLimit,
           snapshot,
         });
@@ -466,7 +473,4 @@ export async function runCompletionCase(input: {
         record.ok = trialViolations.length === 0;
         if (!record.ok) record.error = trialViolations[0];
-        perTrial.push(record);
-        spreads.push(fired.dispatchSpreadMs);
-        mergeStatusCounts(histogram.statusCounts, record.statusCounts);
         return record;
       } finally {
@@ -481,49 +485,37 @@ export async function runCompletionCase(input: {
         }
       }
-    });
-    for (const failed of results.filter(
-      (t) => !t.ok && !perTrial.some((p) => p.trial === t.trial),
-    )) {
-      perTrial.push({
-        trial: failed.trial,
-        ok: false,
-        statuses: [],
-        statusCounts: {},
-        dispatchSpreadMs: 0,
-        oracle: {},
-        invariantViolations: [failed.error ?? "TEST BUG: trial failed"],
-        error: failed.error,
-      });
-    }
-    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
-    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);
-    const doubleSealTrials = perTrial.filter((t) => t.oracle.doubleSealed === true).length;
+    };
+
+    await runTrials(input.trials, (trial) =>
+      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
+    );
+    runner.applyTo(histogram);
+    const all = runner.attempts;
+    const valid = validAttempts(all);
+    const doubleSealTrials = all.filter((t) => t.oracle.doubleSealed === true).length;
+    // Rates and setup counts use valid attempts (D4). Bug and error counters use every attempt (D3).
     histogram.oracle = {
-      trialsSingleSeal: perTrial.filter((t) => t.oracle.sealJobs === 1).length,
+      trialsSingleSeal: valid.filter((t) => t.oracle.sealJobs === 1).length,
       trialsDoubleSeal: doubleSealTrials,
-      sealJobsRetriedTotal: perTrial.reduce((n, t) => n + Number(t.oracle.sealJobsRetried ?? 0), 0),
-      signedResponses: perTrial.reduce((n, t) => n + Number(t.oracle.signedResponses ?? 0), 0),
-      alreadySignedResponses: perTrial.reduce(
-        (n, t) => n + Number(t.oracle.alreadySignedResponses ?? 0),
-        0,
-      ),
-      clientErrorResponses: perTrial.reduce(
-        (n, t) => n + Number(t.oracle.clientErrorResponses ?? 0),
-        0,
-      ),
-      envelopeCompletedTrials: perTrial.reduce(
-        (n, t) => n + Number(t.oracle.envelopeCompletedTrials ?? 0),
-        0,
-      ),
-      serverErrorResponses: perTrial.reduce(
-        (n, t) => n + Number(t.oracle.serverErrorResponses ?? 0),
-        0,
-      ),
+      sealJobsRetriedTotal: sumOracle(all, "sealJobsRetried"),
+      signedResponses: sumOracle(valid, "signedResponses"),
+      alreadySignedResponses: sumOracle(valid, "alreadySignedResponses"),
+      clientErrorResponses: sumOracle(all, "clientErrorResponses"),
+      envelopeCompletedTrials: sumOracle(valid, "envelopeCompletedTrials"),
+      serverErrorResponses: sumOracle(all, "serverErrorResponses"),
     };
-    histogram.invariantViolations = [
+    histogram.invariantViolations.push(
       ...violations,
-      ...perTrial.flatMap((t) => t.invariantViolations),
-    ];
-    return await finish(ctx, histogram, recipientMailboxes, true, doubleSealTrials, docDataAtStart);
+      ...histogram.perTrial.flatMap((t) => t.invariantViolations),
+    );
+    return await finish(
+      ctx,
+      histogram,
+      recipientMailboxes,
+      true,
+      doubleSealTrials,
+      docDataAtStart,
+      all.length,
+    );
   } catch (err) {
     histogram.invariantViolations.push(
@@ -542,4 +534,5 @@ async function finish(
   doubleSealTrials: number,
   docDataAtStart: number,
+  attempts = 0,
 ): Promise<CaseResult> {
   const cleanup = await endRun(ctx, recipientMailboxes);
@@ -553,4 +546,4 @@ async function finish(
   await writeHistogram(histogram);
   const { productViolations, testViolations } = splitViolations(histogram.invariantViolations);
-  return { histogram, productViolations, testViolations, doubleSealTrials };
+  return { histogram, productViolations, testViolations, doubleSealTrials, attempts };
 }
```

### 8.9 Self-tests and race specs

The three self-test specs each had their own copy of the trial loop, their own spread check and their own stub block.
They now use the runner. The region between `createRerunRunner` and `runner.applyTo(histogram)` after the change (the
rest of each file is unchanged):

Medusa `tests/medusa/races/framework-self-test.spec.ts`:

```ts
const runner = createRerunRunner(spreadPolicyFromEnv(), trials);

const trialResults = await runTrials(trials, (trial) =>
  runner.runTrial(trial, async () => {
    // Raw bodies by request index: the exact "OK" check uses these, while
    // bodySummary stays diagnostics-only.
    const rawBodies: Array<string | undefined> = Array.from({ length: CONCURRENCY });
    const fired = await fireTogether(
      CONCURRENCY,
      async (index) => {
        const res = await fetch(`${base}/health`);
        const body = await res.text();
        rawBodies[index] = body;
        return { status: res.status, body };
      },
      {
        warm: async () => {
          const res = await fetch(`${base}/health`);
          await res.text();
        },
      },
    );

    // Record first so perTrial and statusCounts keep the real statuses even
    // when validation fails.
    const record = recordTrial(trial, fired, () => {
      for (const req of fired.requests) {
        if (req.status !== 200 || rawBodies[req.index] !== "OK") {
          throw new Error(`PRODUCT BUG: GET /health HTTP ${req.status} body=${req.bodySummary}`);
        }
      }
    });

    return record;
  }),
);

runner.applyTo(histogram);
```

Cal `tests/cal/races/cal-self-test.spec.ts`:

```ts
const runner = createRerunRunner(spreadPolicyFromEnv(), trials);

const trialResults = await runTrials(trials, (trial) =>
  runner.runTrial(trial, async () => {
    const fired = await fireTogether(
      CONCURRENCY,
      async () => {
        const res = await fetch(`${base}${HEALTH_PATH}`);
        return { status: res.status, body: await res.text() };
      },
      {
        warm: async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          await res.text();
        },
      },
    );

    // Record first so perTrial and statusCounts keep the real statuses even when validation fails.
    const record = recordTrial(trial, fired, () => {
      for (const req of fired.requests) {
        if (req.status !== 200) {
          throw new Error(`PRODUCT BUG: GET ${HEALTH_PATH} HTTP ${req.status} ${req.bodySummary}`);
        }
      }
    });

    return record;
  }),
);

runner.applyTo(histogram);
```

Documenso `tests/documenso/races/documenso-self-test.spec.ts` (the `trialsOk` line after `runner.applyTo` stays as it
was):

```ts
const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
const trialResults = await runTrials(trials, (trial) =>
  runner.runTrial(trial, async () => {
    const fired = await fireTogether(
      CONCURRENCY,
      async () => {
        const res = await fetch(`${base}${HEALTH_PATH}`);
        return { status: res.status, body: await res.text() };
      },
      {
        warm: async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          await res.text();
        },
      },
    );

    // Record first so perTrial and statusCounts keep the real statuses even when validation fails.
    const record = recordTrial(trial, fired, () => {
      for (const req of fired.requests) {
        if (req.status !== 200) {
          throw new Error(`PRODUCT BUG: GET ${HEALTH_PATH} HTTP ${req.status} ${req.bodySummary}`);
        }
      }
    });

    return record;
  }),
);

runner.applyTo(histogram);
```

Import changes in each of the three: `createHistogram` and `writeHistogram` from `histogram.ts` (drop
`aggregateDispatchSpread`, `mergeStatusCounts`), `createRerunRunner` and `spreadPolicyFromEnv` from
`../../../src/races/rerun-on-spread.ts`, drop `raceMaxSpreadMsFromEnv`, drop the `RaceTrialResult` type import and the
`const spreadLimit` line.

The three race specs:

```diff
--- a/tests/cal/races/cal-race-001-identical-slot.spec.ts
+++ b/tests/cal/races/cal-race-001-identical-slot.spec.ts
@@ -49,5 +49,7 @@ test.describe.serial("P6-CAL-RACE-001 Cal identical slot", () => {
     expect(raw.concurrency).toBe(20);
     expect(raw.trials).toBe(trials);
-    expect(raw.perTrial).toHaveLength(trials);
+    // perTrial holds attempts: the valid trials asked for plus any invalid attempts (rerun-on-spread).
+    expect(raw.perTrial.filter((t: { valid: boolean }) => t.valid)).toHaveLength(trials);
+    expect(raw.perTrial).toHaveLength(trials + raw.invalidTrials);
     const counts = raw.statusCounts as Record<string, number>;
     for (const key of Object.keys(counts)) expect(key).toMatch(/^\d{3}$|^error$/);
```

```diff
--- a/tests/cal/races/cal-race-003-overlap.spec.ts
+++ b/tests/cal/races/cal-race-003-overlap.spec.ts
@@ -52,5 +52,5 @@ test.describe("P6-CAL-RACE-003 Cal overlapping windows", () => {
     test.info().annotations.push({
       type: "issue",
-      description: `P6-OBS-CAL-002: double-booked ${doubleBook.trialsDoubleBooked}/${trials} trials, clean ${doubleBook.trialsClean}, pairs by trial ${doubleBook.doubleBookedByTrial}`,
+      description: `P6-OBS-CAL-002: double-booked ${doubleBook.trialsDoubleBooked} of ${doubleBook.trialsDoubleBooked + doubleBook.trialsClean} attempts (${trials} valid trials), clean ${doubleBook.trialsClean}, pairs by attempt ${doubleBook.doubleBookedByTrial}`,
     });
     // Setup, HTTP contract, spread, cleanup and leak must hold before the product assertion.
```

```diff
--- a/tests/documenso/races/doc-race-001-last-recipients.spec.ts
+++ b/tests/documenso/races/doc-race-001-last-recipients.spec.ts
@@ -41,5 +41,5 @@ test.describe("P6-DOC-RACE-001 two last recipients", () => {
       test.info().annotations.push({
         type: "issue",
-        description: `P6-OBS-DOC-002: double seal in ${result.doubleSealTrials}/${trials} trials`,
+        description: `P6-OBS-DOC-002: double seal in ${result.doubleSealTrials} of ${result.attempts} attempts (${trials} valid trials)`,
       });
       // Setup, contract, spread, cleanup and leak come first. They are not expected to fail (plan §10).
@@ -64,5 +64,5 @@ test.describe("P6-DOC-RACE-001 two last recipients", () => {
       expect(
         result.doubleSealTrials,
-        `PRODUCT BUG: P6-OBS-DOC-002 double seal in ${result.doubleSealTrials} of ${trials} trials`,
+        `PRODUCT BUG: P6-OBS-DOC-002 double seal in ${result.doubleSealTrials} of ${result.attempts} attempts`,
       ).toBe(0);
     } finally {
```

`doc-race-002` needs no change: `statusCounts` is `{"200": 10 * trials}` because only valid attempts are counted, and
`signedResponses`, `alreadySignedResponses` and `trialsSingleSeal` use valid attempts (D16).

### 8.10 `src/ci/race-table.ts`

New column `Invalid / reruns` (`"<invalidTrials> / <reruns>"`, or `n/a` for a histogram without the fields). Rates
(accepted per trial, loser counts) read valid records only; bug counts (oversold, double-accepted, double-sealed,
double-booked) read every record. The sentence unit is `N trials` for a clean run and `N attempts` when invalid bursts
were fired. Text for a clean run is unchanged (all existing assertions still pass).

```diff
--- a/src/ci/race-table.ts
+++ b/src/ci/race-table.ts
@@ -8,4 +8,5 @@ export interface RaceSummaryRow {
   readonly keyCounts: string;
   readonly perTrialTime: string;
+  readonly invalidReruns: string;
   readonly outcome: string;
 }
@@ -45,4 +46,7 @@ function finiteNumber(value: unknown): number | undefined {
 const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

+// Histograms written before rerun-on-spread have no `valid` field: every record is a valid trial.
+const isValidTrial = (trial: unknown): boolean => !(isJson(trial) && trial.valid === false);
+
 // One value per trial, or undefined if any trial lacks it (the row then shows n/a).
 export function trialNumbers(trials: readonly unknown[], key: string): number[] | undefined {
@@ -86,4 +90,6 @@ interface ParsedRace {
   readonly perTrial: readonly unknown[];
   readonly oracle: Json;
+  readonly invalidTrials?: number;
+  readonly reruns?: number;
   readonly invariantViolations?: readonly unknown[];
 }
@@ -108,4 +114,6 @@ export function parseRaceFile(raw: unknown, file: string): ParsedRace {
     perTrial: Array.isArray(raw.perTrial) ? raw.perTrial : [],
     oracle: isJson(raw.oracle) ? raw.oracle : {},
+    invalidTrials: finiteNumber(raw.invalidTrials),
+    reruns: finiteNumber(raw.reruns),
     invariantViolations: Array.isArray(raw.invariantViolations)
       ? raw.invariantViolations
@@ -114,8 +122,13 @@ export function parseRaceFile(raw: unknown, file: string): ParsedRace {
 }

+// Rates (accepted per trial, loser counts) use valid attempts only; bug counts use every attempt (D3, D4).
+// The unit in the sentence is "trials" for a clean run and "attempts" when invalid bursts were fired.
 function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome: string } {
-  const total = h.trials ?? h.perTrial.length;
+  const valid = h.perTrial.filter(isValidTrial);
+  const total = h.trials ?? valid.length;
+  const unit =
+    h.perTrial.length === valid.length ? `${total} trials` : `${h.perTrial.length} attempts`;
   if (MEDUSA_OVERSELL_CASES.has(caseId)) {
-    const accepted = trialNumbers(h.perTrial, "httpWinnerCount");
+    const accepted = trialNumbers(valid, "httpWinnerCount");
     const available = trialNumbers(h.perTrial, "available");
     if (!accepted || !available) return { keyCounts: NA, outcome: NA };
@@ -125,12 +138,12 @@ function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome
       outcome:
         oversold > 0
-          ? `Oversold in ${oversold} of ${total} trials (not a tracked bug yet)`
-          : `No oversell in ${total} trials`,
+          ? `Oversold in ${oversold} of ${unit} (not a tracked bug yet)`
+          : `No oversell in ${unit}`,
     };
   }
   if (CAL_IDENTICAL_SLOT_CASES.has(caseId)) {
     const accepted = trialNumbers(h.perTrial, "acceptedCount");
-    const redacted = trialNumbers(h.perTrial, "loser_db-unique-redacted");
-    const unexpected = trialNumbers(h.perTrial, "loser_unexpected");
+    const redacted = trialNumbers(valid, "loser_db-unique-redacted");
+    const unexpected = trialNumbers(valid, "loser_unexpected");
     if (!accepted || !redacted || !unexpected) return { keyCounts: NA, outcome: NA };
     const doubleAccepted = accepted.filter((n) => n > 1).length;
@@ -138,6 +151,6 @@ function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome
     const first =
       doubleAccepted > 0
-        ? `Double-accepted in ${doubleAccepted} of ${total} trials`
-        : `One ACCEPTED per slot in ${total} trials`;
+        ? `Double-accepted in ${doubleAccepted} of ${unit}`
+        : `One ACCEPTED per slot in ${unit}`;
     const second =
       losers400 > 0
@@ -157,6 +170,6 @@ function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome
       outcome:
         doubleBooked > 0
-          ? `Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in ${doubleBooked} of ${total} trials`
-          : `Did not reproduce: no overlapping pair accepted together in ${total} trials`,
+          ? `Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in ${doubleBooked} of ${unit}`
+          : `Did not reproduce: no overlapping pair accepted together in ${unit}`,
     };
   }
@@ -169,6 +182,6 @@ function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome
       outcome:
         doubleSealed > 0
-          ? `Reproduces P6-OBS-DOC-002: sealed twice in ${doubleSealed} of ${total} trials`
-          : `Did not reproduce: sealed once in ${total} trials`,
+          ? `Reproduces P6-OBS-DOC-002: sealed twice in ${doubleSealed} of ${unit}`
+          : `Did not reproduce: sealed once in ${unit}`,
     };
   }
@@ -190,4 +203,8 @@ export function raceSummaryRow(file: string, raw: unknown): RaceSummaryRow {
     keyCounts,
     perTrialTime: perTrialTime(h),
+    invalidReruns:
+      h.invalidTrials === undefined || h.reruns === undefined
+        ? NA
+        : `${h.invalidTrials} / ${h.reruns}`,
     outcome,
   };
@@ -205,10 +222,10 @@ export function formatRaceTable(rows: readonly RaceSummaryRow[]): string {
     "## Race results",
     "",
-    "| Case | Trials | Verdict | Key counts | Per-trial time | Outcome |",
-    "| --- | ---: | --- | --- | ---: | --- |",
+    "| Case | Trials | Verdict | Key counts | Per-trial time | Invalid / reruns | Outcome |",
+    "| --- | ---: | --- | --- | ---: | ---: | --- |",
   ];
   const body = rows.map(
     (r) =>
-      `| ${[r.caseId, r.trials, r.verdict, r.keyCounts, r.perTrialTime, r.outcome].map(cell).join(" | ")} |`,
+      `| ${[r.caseId, r.trials, r.verdict, r.keyCounts, r.perTrialTime, r.invalidReruns, r.outcome].map(cell).join(" | ")} |`,
   );
   return [...header, ...body, ""].join("\n");
```

## 9. Data isolation, cleanup and leak check

- **Names.** `attemptTag(trial, attempt)` is `t<trial>` for attempt 1 (today's name, so nothing existing changes) and
  `t<trial>a<attempt>` for a rerun. Every product name that must be unique per attempt uses it: Medusa product leaf
  (`<tag>-product`), cart emails (`<tag>-cNN`); Cal attendee emails and the `-003` `LIKE` pattern; Documenso title and
  recipient mailboxes. The live proof (§2.6) shows why: the same product handle fails with HTTP 400 while the earlier
  product exists (for example when its cleanup failed).
- **Cleanup.** Each attempt keeps the `try ... finally` cleanup of today's trial body, so an invalid attempt is cleaned
  exactly like a valid one. The case-level sweep and leak check are unchanged and see every attempt's data through the
  case prefix.
- **Leak keys.** Unchanged (case prefix, title prefix). The tag sits after the prefix, so the existing `LIKE` patterns
  match every attempt.
- **Documenso residue.** `documentDataResidue` stays a report (Phase 1 D30), now across all attempts.
- **No SQL writes** anywhere; the oracle pool stays read-only (`25006`).

## 10. Labels (PRODUCT BUG vs TEST BUG) with the evidence each needs

| Label                           | When                                                                                                    | Evidence to paste                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `TEST BUG: runner too noisy`    | A trial index used all reruns while still above the limit, or the invalid attempts exceeded the budget. | The histogram's `perTrial` spreads, `spreadPolicy`, `invalidTrials`, `reruns`, and the runner's CPU/queue state if known. |
| `PRODUCT BUG: ...`              | Unchanged. A product violation in **any** attempt (valid or invalid) fails the case (D3).               | Status, counts and the violation line, plus which `attempt` and whether it was `valid`.                                   |
| `TEST BUG: ...` (setup/cleanup) | An attempt function threw (setup or cleanup broken). Never rerun.                                       | The stub record in `perTrial` (`valid: false`, `statuses: []`).                                                           |
| `ENV: ...`                      | Unchanged.                                                                                              | Last 40 lines of the harness or web log.                                                                                  |
| `TEST BUG (control)`            | Unchanged (Documenso sequential control).                                                               | The violation line.                                                                                                       |

A change to the spread rule is never a reason to weaken an assertion: no assertion changes in this task except the one
that counted `perTrial` entries (§8.9), which now counts valid trials and total attempts separately.

## 11. CI (`.github/workflows/perf.yml`)

Remove exactly these five lines, nothing else:

```diff
--- a/.github/workflows/perf.yml
+++ b/.github/workflows/perf.yml
@@ -170,3 +170,2 @@ jobs:
           RACE_TRIALS: ${{ github.event_name == 'pull_request' && '3' || '50' }}
-          RACE_MAX_SPREAD_MS: "20"
           P6_PLAYWRIGHT_JSON: results/playwright/medusa-race.json
@@ -367,3 +366,2 @@ jobs:
           RACE_TRIALS: "3"
-          RACE_MAX_SPREAD_MS: "20"
           P6_PLAYWRIGHT_JSON: results/playwright/cal-self-test.json
@@ -381,3 +379,2 @@ jobs:
           RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
-          RACE_MAX_SPREAD_MS: "20"
           P6_PLAYWRIGHT_JSON: results/playwright/cal-race-001.json
@@ -395,3 +392,2 @@ jobs:
           RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
-          RACE_MAX_SPREAD_MS: "20"
           P6_PLAYWRIGHT_JSON: results/playwright/cal-race-003.json
@@ -598,3 +594,2 @@ jobs:
           RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
-          RACE_MAX_SPREAD_MS: "20"
           P6_PLAYWRIGHT_JSON: results/playwright/documenso-race.json
```

- `RACE_MAX_SPREAD_MS` is then unset in CI and the default 5 applies, with reruns.
- `RACE_MAX_SPREAD_RERUNS` and `RACE_MAX_INVALID_SHARE_PCT` are **not** set in CI: the defaults apply (so CI always
  tests the defaults).
- The job summary and the race table need no workflow change: `scripts/write-ci-job-summary.ts` already renders every
  histogram through `src/ci/race-table.ts`, which gets the new column.
- Verify: `rg -n RACE_MAX_SPREAD_MS .github` prints nothing; `npm run lint:actions` is clean.

## 12. Environment changes

### 12.1 New environment variables

| Name                         | Default | Parsing                                                   | Purpose                                       |
| ---------------------------- | ------- | --------------------------------------------------------- | --------------------------------------------- |
| `RACE_MAX_SPREAD_RERUNS`     | 3       | whole number >= 1 (`0`, negatives, fractions, junk throw) | Reruns per trial index.                       |
| `RACE_MAX_INVALID_SHARE_PCT` | 20      | whole number 1 to 100                                     | Invalid attempts per case, percent of trials. |

Both are added to `.env.example` (names, empty) and to the README table. `RACE_MAX_SPREAD_MS` keeps its meaning and
default.

### 12.2 Network domains, setup steps, Cursor cloud, Claude Code cloud

Nothing changes. No new package, no new host, no setup-script change, nothing pasted into environment settings.

## 13. Unit tests

### 13.1 `tests/unit/rerun-on-spread.test.ts` (new; 19 tests; complete file)

| Group                 | Test                                                                            | D / rule         |
| --------------------- | ------------------------------------------------------------------------------- | ---------------- |
| `isSpreadValid`       | a spread exactly at the limit is valid                                          | D2               |
|                       | a spread below the limit is valid                                               | D2               |
|                       | a spread above the limit is invalid                                             | D2               |
| `invalidBudget`       | share of the trials, rounded up, never below 2                                  | D15              |
| `attemptTag`          | keeps the first attempt's name and tags reruns                                  | D17              |
| `spreadPolicyFromEnv` | defaults to 5 ms, 3 reruns, 20 percent                                          | D15, D21         |
|                       | reads the three variables                                                       |                  |
| `runTrial`            | a burst at the limit is one valid attempt and no rerun                          | D2               |
|                       | a burst above the limit is invalid, rerun with fresh setup, then valid          | rerun            |
|                       | stops at the per-trial cap with a TEST BUG and keeps every attempt              | cap              |
|                       | stops the whole case when the invalid-share budget is spent                     | budget           |
|                       | a product violation in an invalid attempt still fails the trial                 | D3               |
|                       | an invalid attempt with no violation does not fail the trial                    | D3               |
|                       | a throw from the attempt is a stub, is not rerun and is not an invalid trial    | D19              |
| `applyTo`             | counts statuses of valid attempts only and keeps invalid attempts in `perTrial` | D4               |
|                       | totals `invalidTrials` and `reruns` over several trials                         | D4               |
|                       | aggregates the spread of valid and invalid attempts separately                  | D20              |
|                       | reports zero invalid and zero reruns for a clean run                            | zero is a result |
| helpers               | `validAttempts` and `sumOracle`                                                 | D16              |

Each test builds its records with `record(trial, spreadMs, over)` and plays spreads back with `script(trial, spreads)`;
no network, no timers. The runner is plugged into the real `runTrials` in the budget and totals tests, which also shows
that `runTrials` needs no change.

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHistogram } from "../../src/races/histogram.ts";
import {
  attemptTag,
  createRerunRunner,
  invalidBudget,
  isSpreadValid,
  spreadPolicyFromEnv,
  sumOracle,
  validAttempts,
} from "../../src/races/rerun-on-spread.ts";
import { runTrials } from "../../src/races/run-trials.ts";
import type { RaceTrialResult, SpreadPolicy } from "../../src/races/types.ts";

const POLICY: SpreadPolicy = { limitMs: 5, maxReruns: 3, maxInvalidSharePct: 20 };

/** What an attemptFn returns: the record recordTrial builds. attempt and valid are set by the runner. */
function record(
  trial: number,
  spreadMs: number,
  over: Partial<RaceTrialResult> = {},
): RaceTrialResult {
  return {
    trial,
    attempt: 1,
    valid: true,
    ok: true,
    statuses: [200, 400],
    statusCounts: { "200": 1, "400": 1 },
    dispatchSpreadMs: spreadMs,
    oracle: {},
    invariantViolations: [],
    ...over,
  };
}

/** An attemptFn that plays back one spread per attempt and counts how often fresh setup ran. */
function script(trial: number, spreads: number[], over: Partial<RaceTrialResult> = {}) {
  const calls: number[] = [];
  const fn = async (attempt: number) => {
    calls.push(attempt);
    return record(trial, spreads[attempt - 1] ?? 0, over);
  };
  return { fn, calls };
}

function histogramFor(trials: number) {
  return createHistogram({
    caseId: "fake",
    title: "fake",
    product: "framework",
    concurrency: 2,
    trials,
  });
}

describe("isSpreadValid (D2)", () => {
  it("a spread exactly at the limit is valid", () => {
    assert.equal(isSpreadValid(5, 5), true);
  });
  it("a spread below the limit is valid", () => {
    assert.equal(isSpreadValid(0.4, 5), true);
  });
  it("a spread above the limit is invalid", () => {
    assert.equal(isSpreadValid(5.0001, 5), false);
  });
});

describe("invalidBudget", () => {
  it("is a share of the trials, rounded up, never below 2", () => {
    assert.equal(invalidBudget(3, 20), 2);
    assert.equal(invalidBudget(5, 20), 2);
    assert.equal(invalidBudget(30, 10), 3);
    assert.equal(invalidBudget(50, 10), 5);
    assert.equal(invalidBudget(50, 20), 10);
    assert.equal(invalidBudget(51, 20), 11);
  });
});

describe("attemptTag", () => {
  it("keeps the first attempt's name and tags reruns", () => {
    assert.equal(attemptTag(3, 1), "t3");
    assert.equal(attemptTag(3, 2), "t3a2");
    assert.equal(attemptTag(12, 4), "t12a4");
  });
});

describe("spreadPolicyFromEnv", () => {
  it("defaults to 5 ms, 3 reruns, 20 percent", () => {
    assert.deepEqual(spreadPolicyFromEnv({}), POLICY);
  });
  it("reads the three variables", () => {
    assert.deepEqual(
      spreadPolicyFromEnv({
        RACE_MAX_SPREAD_MS: "8",
        RACE_MAX_SPREAD_RERUNS: "2",
        RACE_MAX_INVALID_SHARE_PCT: "30",
      }),
      { limitMs: 8, maxReruns: 2, maxInvalidSharePct: 30 },
    );
  });
});

describe("createRerunRunner.runTrial", () => {
  it("a burst at the limit is one valid attempt and no rerun", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const { fn, calls } = script(1, [5]);
    const got = await runner.runTrial(1, fn);
    assert.deepEqual(calls, [1]);
    assert.equal(got.valid, true);
    assert.equal(got.attempt, 1);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.reruns, 0);
  });

  it("a burst above the limit is invalid, rerun with fresh setup, then valid", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const { fn, calls } = script(1, [9, 1]);
    const got = await runner.runTrial(1, fn);
    assert.deepEqual(calls, [1, 2]); // attemptFn is the whole setup + burst + oracle + cleanup
    assert.equal(got.attempt, 2);
    assert.equal(got.valid, true);
    assert.deepEqual(
      runner.attempts.map((a) => [a.attempt, a.valid]),
      [
        [1, false],
        [2, true],
      ],
    );
  });

  it("stops at the per-trial cap with a TEST BUG and keeps every attempt", async () => {
    const runner = createRerunRunner({ ...POLICY, maxReruns: 2 }, 50); // budget 10, so the cap is hit first
    const { fn, calls } = script(4, [9, 8, 7, 1]);
    await assert.rejects(
      runner.runTrial(4, fn),
      /TEST BUG: runner too noisy: trial 4 still above RACE_MAX_SPREAD_MS=5 after 2 reruns \(spreads 9\.00, 8\.00, 7\.00 ms\)/,
    );
    assert.deepEqual(calls, [1, 2, 3]); // 1 burst + 2 reruns, never a fourth
    const h = histogramFor(50);
    runner.applyTo(h);
    assert.equal(h.perTrial.length, 3);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.reruns, 2);
    assert.ok(h.invariantViolations.some((v) => v.includes("runner too noisy: trial 4")));
  });

  it("stops the whole case when the invalid-share budget is spent", async () => {
    const runner = createRerunRunner(POLICY, 5); // budget = max(2, ceil(5 * 20 / 100)) = 2
    const results = await runTrials(5, (trial) => runner.runTrial(trial, script(trial, [9, 1]).fn));
    assert.deepEqual(
      results.map((r) => r.ok),
      [true, true, false, false, false],
    );
    assert.match(results[2]?.error ?? "", /3 invalid attempts exceed the budget of 2/);
    assert.match(results[3]?.error ?? "", /runner too noisy/); // trial 4 never ran its setup
    const h = histogramFor(5);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.spreadPolicy.invalidBudget, 2);
    assert.ok(h.invariantViolations.some((v) => v.includes("exceed the budget of 2")));
    assert.equal(
      runner.attempts.some((a) => a.trial >= 4),
      false,
    );
  });

  it("a product violation in an invalid attempt still fails the trial (D3)", async () => {
    const runner = createRerunRunner(POLICY, 1);
    const fn = async (attempt: number) =>
      attempt === 1
        ? record(1, 9, {
            ok: false,
            error: "PRODUCT BUG: oversold",
            invariantViolations: ["PRODUCT BUG: oversold"],
          })
        : record(1, 1);
    await assert.rejects(runner.runTrial(1, fn), /PRODUCT BUG: oversold/);
    const invalid = runner.attempts.find((a) => !a.valid);
    assert.deepEqual(invalid?.invariantViolations, ["PRODUCT BUG: oversold"]); // recorded, not dropped
    assert.equal(runner.attempts.length, 2); // and the trial still reached a valid second attempt
  });

  it("an invalid attempt with no violation does not fail the trial", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.runTrial(1, script(1, [9, 1]).fn);
    assert.deepEqual(runner.violations, []);
  });

  it("a throw from the attempt is a stub, is not rerun and is not an invalid trial", async () => {
    const runner = createRerunRunner(POLICY, 1);
    let calls = 0;
    await assert.rejects(
      runner.runTrial(1, async () => {
        calls += 1;
        throw new Error("TEST BUG: POST /admin/products HTTP 400");
      }),
      /HTTP 400/,
    );
    assert.equal(calls, 1);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.perTrial.length, 1);
    assert.equal(h.perTrial[0]?.valid, false);
    assert.deepEqual(h.perTrial[0]?.statuses, []);
  });
});

describe("createRerunRunner.applyTo (D4)", () => {
  it("counts statuses of valid attempts only and keeps invalid attempts in perTrial", async () => {
    const runner = createRerunRunner(POLICY, 2);
    await runTrials(2, (trial) =>
      runner.runTrial(
        trial,
        trial === 1
          ? script(1, [9, 1], { statusCounts: { "200": 2 } }).fn
          : script(2, [1], { statusCounts: { "200": 1, "400": 1 } }).fn,
      ),
    );
    const h = histogramFor(2);
    runner.applyTo(h);
    assert.deepEqual(h.statusCounts, { "200": 3, "400": 1 }); // trial 1 attempt 2 + trial 2; not attempt 1
    assert.equal(h.trials, 2); // valid trials asked for, unchanged
    assert.deepEqual(
      h.perTrial.map((t) => [t.trial, t.attempt, t.valid]),
      [
        [1, 1, false],
        [1, 2, true],
        [2, 1, true],
      ],
    );
    assert.deepEqual(h.perTrial[0]?.statusCounts, { "200": 2 }); // the discarded burst keeps its own counts
  });

  it("totals invalidTrials and reruns over several trials", async () => {
    const runner = createRerunRunner({ ...POLICY, maxInvalidSharePct: 100 }, 3); // budget 3: no abort here
    const plan: Record<number, number[]> = { 1: [9, 8, 1], 2: [1], 3: [7, 1] };
    await runTrials(3, (trial) => runner.runTrial(trial, script(trial, plan[trial]!).fn));
    const h = histogramFor(3);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 3);
    assert.equal(h.reruns, 3);
    assert.equal(h.trials, 3);
    assert.equal(h.perTrial.length, 6);
  });

  it("aggregates the spread of valid and invalid attempts separately", async () => {
    const runner = createRerunRunner(POLICY, 1);
    await runner.runTrial(1, script(1, [9, 2]).fn);
    const h = histogramFor(1);
    runner.applyTo(h);
    assert.deepEqual(h.dispatchSpreadMs, { min: 2, max: 2, mean: 2 });
    assert.deepEqual(h.invalidDispatchSpreadMs, { min: 9, max: 9, mean: 9 });
    assert.deepEqual(h.spreadPolicy, { ...POLICY, invalidBudget: 2 });
  });

  it("reports zero invalid and zero reruns for a clean run", async () => {
    const runner = createRerunRunner(POLICY, 2);
    await runTrials(2, (trial) => runner.runTrial(trial, script(trial, [1]).fn));
    const h = histogramFor(2);
    runner.applyTo(h);
    assert.equal(h.invalidTrials, 0);
    assert.equal(h.reruns, 0);
    assert.deepEqual(h.invalidDispatchSpreadMs, { min: 0, max: 0, mean: 0 });
  });
});

describe("helpers", () => {
  it("validAttempts and sumOracle", () => {
    const a = record(1, 1, { valid: true, oracle: { acceptedCount: 1 } });
    const b = record(1, 9, { valid: false, oracle: { acceptedCount: 1 } });
    const c = record(2, 1, { valid: true, oracle: {} });
    assert.deepEqual(validAttempts([a, b, c]), [a, c]);
    assert.equal(sumOracle([a, b, c], "acceptedCount"), 2);
    assert.equal(sumOracle(validAttempts([a, b, c]), "acceptedCount"), 1);
    assert.equal(sumOracle([c], "missing"), 0);
  });
});
```

### 13.2 Updated tests

Env parsers (reject `0`, negatives, fractions, exponents, junk, `101`; defaults 3 and 20):

```diff
--- a/tests/unit/env.test.ts
+++ b/tests/unit/env.test.ts
@@ -8,5 +8,7 @@ import {
   medusaBaseUrlFromEnv,
   medusaDatabaseUrlFromEnv,
+  raceMaxInvalidSharePctFromEnv,
   raceMaxSpreadMsFromEnv,
+  raceMaxSpreadRerunsFromEnv,
   raceTrialsFromEnv,
 } from "../../src/races/env.ts";
@@ -62,4 +64,37 @@ describe("env", () => {
   });

+  it("defaults RACE_MAX_SPREAD_RERUNS to 3 and parses 1 and 7", () => {
+    assert.equal(raceMaxSpreadRerunsFromEnv({}), 3);
+    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: "1" }), 1);
+    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: " 7 " }), 7);
+    assert.equal(raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: "  " }), 3);
+  });
+
+  it("rejects 0, negatives, fractions, exponents and junk in RACE_MAX_SPREAD_RERUNS", () => {
+    for (const raw of ["0", "-1", "abc", "3abc", "3.5", "1e3", "+2", "0x2"]) {
+      assert.throws(
+        () => raceMaxSpreadRerunsFromEnv({ RACE_MAX_SPREAD_RERUNS: raw }),
+        /TEST BUG: RACE_MAX_SPREAD_RERUNS must be an integer >= 1/,
+        raw,
+      );
+    }
+  });
+
+  it("defaults RACE_MAX_INVALID_SHARE_PCT to 20 and parses 1, 20 and 100", () => {
+    assert.equal(raceMaxInvalidSharePctFromEnv({}), 20);
+    assert.equal(raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: "1" }), 1);
+    assert.equal(raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: "100" }), 100);
+  });
+
+  it("rejects 0, negatives, fractions, junk and above 100 in RACE_MAX_INVALID_SHARE_PCT", () => {
+    for (const raw of ["0", "-5", "abc", "12.5", "1e2", "101", "1000"]) {
+      assert.throws(
+        () => raceMaxInvalidSharePctFromEnv({ RACE_MAX_INVALID_SHARE_PCT: raw }),
+        /TEST BUG: RACE_MAX_INVALID_SHARE_PCT must be an integer between 1 and 100/,
+        raw,
+      );
+    }
+  });
+
   it("medusa base URL fallback strips trailing slash", () => {
     assert.equal(medusaBaseUrlFromEnv({}), "http://127.0.0.1:9000");
```

Histogram defaults, trial-record defaults:

```diff
--- a/tests/unit/histogram.test.ts
+++ b/tests/unit/histogram.test.ts
@@ -22,4 +22,8 @@ describe("createHistogram", () => {
     assert.deepEqual(typed.statusCounts, {});
     assert.deepEqual(typed.dispatchSpreadMs, { min: 0, max: 0, mean: 0 });
+    assert.deepEqual(typed.invalidDispatchSpreadMs, { min: 0, max: 0, mean: 0 });
+    assert.equal(typed.invalidTrials, 0);
+    assert.equal(typed.reruns, 0);
+    assert.equal(typed.trials, 3);
     assert.equal(typed.caseId, "framework-self-test");
     assert.ok(typed.startedAt.length > 0);
```

```diff
--- a/tests/unit/trial-record.test.ts
+++ b/tests/unit/trial-record.test.ts
@@ -16,4 +16,6 @@ describe("recordTrial", () => {
     );
     assert.equal(record.ok, true);
+    assert.equal(record.attempt, 1); // the rerun runner overwrites attempt and valid
+    assert.equal(record.valid, true);
     assert.deepEqual(record.statuses, [200, 200]);
     assert.deepEqual(record.statusCounts, { "200": 2 });
```

Race table (the column; a bug seen only in an invalid attempt still shows (D3); rates from valid attempts only (D4);
old histograms show `n/a`):

```diff
--- a/tests/unit/race-table.test.ts
+++ b/tests/unit/race-table.test.ts
@@ -161,4 +161,41 @@ describe("race rows", () => {
   });

+  it("shows invalid attempts and reruns, and n/a for a histogram from before rerun-on-spread", () => {
+    assert.equal(rowOf(histogram("x", [], { invalidTrials: 2, reruns: 1 })).invalidReruns, "2 / 1");
+    assert.equal(rowOf(histogram("x", [], { invalidTrials: 0, reruns: 0 })).invalidReruns, "0 / 0");
+    assert.equal(rowOf(histogram("x", [])).invalidReruns, "n/a");
+  });
+
+  it("the table has an Invalid / reruns column", () => {
+    const md = formatRaceTable([rowOf(histogram("x", [], { invalidTrials: 2, reruns: 1 }))]);
+    assert.ok(
+      md.includes(
+        "| Case | Trials | Verdict | Key counts | Per-trial time | Invalid / reruns | Outcome |",
+      ),
+    );
+    assert.ok(md.includes("| 2 / 1 |"));
+  });
+
+  it("Medusa: an oversell seen only in an invalid attempt is still reported (D3)", () => {
+    const invalid = {
+      ...trial(1, { httpWinnerCount: 6, available: -1 }),
+      attempt: 1,
+      valid: false,
+    };
+    const valid = { ...trial(1, { httpWinnerCount: 5, available: 0 }), attempt: 2, valid: true };
+    const row = rowOf(histogram("P6-MED-RACE-001", [invalid, valid], { trials: 1 }));
+    assert.equal(row.keyCounts, "accepted per trial 5; oversold trials 1"); // rate: valid attempts only
+    assert.equal(row.outcome, "Oversold in 1 of 2 attempts (not a tracked bug yet)");
+  });
+
+  it("identical slot: loser counts use valid attempts only, double accepts use every attempt", () => {
+    const bad = { acceptedCount: 2, "loser_db-unique-redacted": 18, loser_unexpected: 0 };
+    const ok = { acceptedCount: 1, "loser_db-unique-redacted": 19, loser_unexpected: 0 };
+    const invalid = { ...trial(1, bad), attempt: 1, valid: false };
+    const valid = { ...trial(1, ok), attempt: 2, valid: true };
+    const row = rowOf(histogram("P6-CAL-RACE-001", [invalid, valid], { trials: 1 }));
+    assert.equal(row.keyCounts, "double-accepted trials 1; non-409 losers 19");
+  });
+
   it("unknown case id uses the verdict only, key counts n/a", () => {
     const row = rowOf(histogram("framework-self-test", [], { verdict: "pass" }));
@@ -207,4 +244,5 @@ describe("parsing and formatting", () => {
         keyCounts: "n/a",
         perTrialTime: "n/a",
+        invalidReruns: "0 / 0",
         outcome: "a | b",
       },
```

The three invariants tests lose their spread cases (the decision moved to `isSpreadValid`, tested in 13.1); the fixtures
lose the two spread fields:

```diff
--- a/tests/unit/medusa-invariants.test.ts
+++ b/tests/unit/medusa-invariants.test.ts
@@ -3,6 +3,4 @@ import { describe, it } from "node:test";
 import { checkOversellInvariants } from "../../src/medusa/invariants.ts";

-const spreadLimit = 5;
-
 function base(overrides: Partial<Parameters<typeof checkOversellInvariants>[0]>) {
   return {
@@ -25,6 +23,4 @@ function base(overrides: Partial<Parameters<typeof checkOversellInvariants>[0]>)
     ),
     loserQuantities: Array.from({ length: 15 }, () => 1),
-    dispatchSpreadMs: 1,
-    spreadLimit,
     ...overrides,
   };
@@ -46,9 +42,4 @@ describe("checkOversellInvariants", () => {
   });

-  it("qty1 spread too high", () => {
-    const v = checkOversellInvariants(base({ dispatchSpreadMs: 9 }));
-    assert.ok(v.some((x) => x.includes("TEST BUG") && x.includes("dispatchSpreadMs")));
-  });
-
   it("qty1 shared order ids", () => {
     const v = checkOversellInvariants(
```

```diff
--- a/tests/unit/cal-invariants.test.ts
+++ b/tests/unit/cal-invariants.test.ts
@@ -47,5 +47,5 @@ function check(
   responses: ParsedResponse[],
   accepted: AcceptedRow[],
-  extra: { n?: number; spread?: number; limit?: number } = {},
+  extra: { n?: number } = {},
 ): string[] {
   return checkIdenticalSlotInvariants({
@@ -53,6 +53,4 @@ function check(
     responses,
     accepted,
-    dispatchSpreadMs: extra.spread ?? 1,
-    spreadLimit: extra.limit ?? 20,
   });
 }
@@ -134,9 +132,4 @@ describe("checkIdenticalSlotInvariants", () => {
   });

-  it("flags spread at or above the limit", () => {
-    const v = check([win(), ...many(redacted, 19)], [row("u1")], { spread: 21, limit: 20 });
-    assert.ok(v.some((x) => /TEST BUG.*dispatchSpreadMs/.test(x)));
-  });
-
   it("flags a wrong response count", () => {
     const v = check([win(), ...many(redacted, 18)], [row("u1")], { n: 20 });
@@ -160,14 +153,8 @@ const slotRow = (uid: string): SlotRow => ({
 });

-function guards(
-  responses: ParsedResponse[],
-  rows: SlotRow[],
-  extra: { spread?: number; limit?: number } = {},
-): string[] {
+function guards(responses: ParsedResponse[], rows: SlotRow[]): string[] {
   return checkOverlapPairGuards({
     responses,
     windowAccepted: rows,
-    dispatchSpreadMs: extra.spread ?? 1,
-    spreadLimit: extra.limit ?? 20,
   });
 }
@@ -237,9 +224,4 @@ describe("checkOverlapPairGuards", () => {
   });

-  it("flags spread at the limit", () => {
-    const v = guards([win("u1"), taken()], [slotRow("u1")], { spread: 20, limit: 20 });
-    assert.ok(v.some((x) => /TEST BUG.*dispatchSpreadMs/.test(x)));
-  });
-
   it("flags a wrong response count", () => {
     const v = guards([win("u1")], [slotRow("u1")]);
@@ -380,6 +362,4 @@ describe("setup violation labelling", () => {
     responses: [taken(), taken()],
     windowAccepted: [],
-    dispatchSpreadMs: 1,
-    spreadLimit: 20,
   };

@@ -408,6 +388,4 @@ describe("setup violation labelling", () => {
       responses: [taken(), taken()],
       accepted: [],
-      dispatchSpreadMs: 1,
-      spreadLimit: 20,
     };
     assert.deepEqual(checkIdenticalSlotInvariants(slot), [
```

```diff
--- a/tests/unit/documenso-invariants.test.ts
+++ b/tests/unit/documenso-invariants.test.ts
@@ -43,6 +43,4 @@ function input(
     burst: 2,
     classes,
-    spreadMs: 0.4,
-    spreadLimitMs: 20,
     snapshot,
     ...overrides,
@@ -176,11 +174,4 @@ describe("documenso invariants", () => {
   });

-  it("flags a spread at or above the limit as a test bug", () => {
-    const v = checkDoc001Trial(
-      input(DOC001_CLASSES, passing(), { spreadMs: 20, spreadLimitMs: 20 }),
-    );
-    assert.ok(v.includes("TEST BUG: dispatchSpreadMs 20 >= 20"));
-  });
-
   it("flags sealed items that are not 1 of 1", () => {
     const v = checkDoc001Trial(input(DOC001_CLASSES, passing({ itemsSealed: 0 })));
```

Documenso payload names for a rerun:

```diff
--- a/tests/unit/documenso-payloads.test.ts
+++ b/tests/unit/documenso-payloads.test.ts
@@ -19,4 +19,14 @@ describe("documenso payloads", () => {
   });

+  it("a rerun gets its own mailbox and title, attempt 1 keeps today's names", () => {
+    assert.equal(recipientEmail(CASE_PREFIX, 3, 1, 1), `${CASE_PREFIX}-t3-r1@example.com`);
+    assert.equal(recipientEmail(CASE_PREFIX, 3, 1, 2), `${CASE_PREFIX}-t3a2-r1@example.com`);
+    assert.equal(
+      recipientBodies(CASE_PREFIX, 3, 2, 2)[0]?.email,
+      `${CASE_PREFIX}-t3a2-r0@example.com`,
+    );
+    assert.equal(documentTitle(CASE_PREFIX, 4, "two-last", 3), `${CASE_PREFIX} t4a3 two-last`);
+  });
+
   it("rejects a recipient count below one", () => {
     assert.throws(() => recipientBodies(CASE_PREFIX, 0, 0), /TEST BUG/);
```

Self-tests: they are Playwright tests against a live product, so they are checked by running them (§14 Step 7, §15),
not by a unit test. Their expected behaviour is the same as before; the only difference is the histogram's new fields.

## 14. Build steps (repo root; on any differing output: stop and report, paste it)

Do not start until the maintainer approves this plan. Never `git add -A`. Never print secrets. Start and stop products
only with the repo scripts, and always finish a live run with `npm run down:<product>`. Run
`export PATH="/usr/local/bin:$PATH"` first (AGENTS.md). Expected unit-test counts are from the dry run (§2.9).

### Step 0. Branch, plan, baseline

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main
git switch feat/2026-10-22-p6-rerun-on-spread   # exists already: cut from main at ac563ab, plan commit on top
git log --oneline -2                             # the plan commit, then ac563ab
git status --short                               # empty
npm ci && npm run check                                           # Prettier clean, typecheck 0, 4 script(s) ok, # tests 299, # fail 0
```

The plan file is already the first commit on the branch (`docs(plans): add the phase 2 task 1 rerun-on-spread plan`).

### Step 1. Framework (commit 1)

1. `src/races/env.ts` (§8.1), `src/races/types.ts` (§8.2), `src/races/histogram.ts` and `src/races/trial-record.ts`
   (§8.3), `src/races/rerun-on-spread.ts` (§8.4, copy the file as it is).
2. `tests/unit/rerun-on-spread.test.ts` (§13.1) and the env, histogram and trial-record test changes (§13.2).
3. **Temporary scaffolding so this commit compiles** (the new fields are required on `RaceTrialResult`; typecheck lists
   the six places): in the stub literal `{ trial: failed.trial, ok: false, ... }` of `src/medusa/run-case.ts`,
   `src/cal/run-case.ts` (inside `failedTrialRecords`), `src/documenso/run-case.ts` and the three self-test specs, add
   `attempt: 1, valid: false,` after `trial: failed.trial,`. Steps 2 to 5 delete these literals again.

```bash
npx prettier --write src/races tests/unit
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 322, # pass 322, # fail 0
```

Commit 1 (§16).

### Step 2. Medusa (commit 2)

Apply §8.5 (`src/medusa/invariants.ts`), §8.6 (`src/medusa/run-case.ts`) and the `medusa-invariants` test change.

```bash
npx prettier --write src/medusa tests/unit
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 321, # fail 0
```

Commit 2. Live proof (cloud VM, **proof only, never published**):

```bash
export PATH="/usr/local/bin:$PATH"
npm run up:medusa                          # exit 0, /health 200
npm run smoke:medusa                       # 5 of 5 iterations complete
export PRODUCTS_ROOT=/home/user/products   # this VM does not export it
export MEDUSA_ADMIN_EMAIL=<a throwaway email>
export MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 12)"   # throwaway; do not print it or write it in the repo
# If seeding fails with "HTTP 401", the admin user exists from an earlier run with another throwaway password:
# use a new throwaway email.
npm run clean:results
RACE_TRIALS=3 npx playwright test --project=medusa-race
#   6 passed; every results/races/*.json: verdict pass, trials 3, invalidTrials 0, reruns 0
npm run clean:results
RACE_TRIALS=3 RACE_MAX_SPREAD_MS=1 npx playwright test --project=medusa-race -g "P6-MED-RACE-001 N carts"
#   most likely: 1 failed; verdict fail; invariantViolations has "TEST BUG: runner too noisy: ..."; every attempt in perTrial
npm run clean:results
RACE_TRIALS=3 RACE_MAX_SPREAD_MS=2 npx playwright test --project=medusa-race -g "P6-MED-RACE-001 N carts"
#   most likely: 1 passed; invalidTrials 0 or 1; if 1, a perTrial row with valid false and a later row with valid true
node -e 'const h=require("./results/races/P6-MED-RACE-001.json");console.log(h.verdict,h.trials,h.invalidTrials,h.reruns,JSON.stringify(h.spreadPolicy),h.invariantViolations)'
npm run down:medusa                        # exit 0; :9000 closed
```

The two forced-noise runs depend on the VM's timing, so "most likely" is the honest wording: the proof is that **both
outcomes are recorded correctly and the leak check is clean** (`invariantViolations` has no leak line), not a fixed
number. If the 1 ms run happens to pass, repeat it; if the 2 ms run fails on budget, that is the same design working
(paste it either way).

### Step 3. Cal (commit 3)

Apply §8.5 (`src/cal/invariants.ts`), §8.7 (`src/cal/run-case.ts`), the `cal-race-001` and `cal-race-003` spec changes
(§8.9) and the `cal-invariants` test change.

```bash
npx prettier --write src/cal tests
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 319, # fail 0
```

Commit 3. Optional live proof if the VM has Cal built (`bash scripts/bootstrap.sh cal`, `npm run up:cal`, `npm run
smoke:cal`): `RACE_TRIALS=5 npx playwright test --project=cal-race tests/cal/races/cal-race-001-identical-slot.spec.ts`
(expect `2 passed`, `Invalid / reruns` usually `1 / 1` because trial 1 is slow in 69% of runs), then
`npm run down:cal`. CI covers this in any case.

### Step 4. Documenso (commit 4)

Apply §8.5 (`src/documenso/invariants.ts`), §8.8 (`payloads.ts`, `run-case.ts`), the `doc-race-001` spec change, and the
`documenso-invariants` and `documenso-payloads` test changes.

```bash
npx prettier --write src/documenso tests
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 319, # fail 0
```

Commit 4. Live proof is optional (Node 24, about 270 s cold: `npm run up:documenso`, then `RACE_TRIALS=5 npm run
race:documenso`, `npm run down:documenso`); CI covers it.

### Step 5. Self-tests (commit 5)

Apply §8.9 to the three self-test specs (this removes the temporary literals of Step 1).

```bash
npx prettier --write tests
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 319, # fail 0
npx playwright test --list                # Total: 18 tests in 8 files
```

Commit 5. The Medusa self-test was already run live in Step 2 (the `6 passed` run includes `framework-self-test`).

### Step 6. Race table (commit 6)

Apply §8.10 and the `race-table` test change.

```bash
npx prettier --write src/ci tests/unit
npm run typecheck                         # exit 0
npm run test:unit                         # # tests 323, # fail 0
GITHUB_STEP_SUMMARY=/tmp/summary.md node scripts/write-ci-job-summary.ts    # after a live histogram exists in results/races/
cat /tmp/summary.md                       # the table has the "Invalid / reruns" column
```

Commit 6.

### Step 7. CI, README, `.env.example` (commit 7)

Apply §11, §17 and the `.env.example` lines.

```bash
npx prettier --check README.md .github/workflows/perf.yml
rg -n RACE_MAX_SPREAD_MS .github                 # no output
npm run check                                    # Prettier clean, actionlint clean, typecheck 0, 4 script(s) ok, # tests 323, # fail 0
```

Commit 7.

### Step 8. Push, stop for review

```bash
git push -u origin feat/2026-10-22-p6-rerun-on-spread
```

No PR until the maintainer asks. After a PR exists: watch the three product jobs (§15).

## 15. Verification gate (hard gate before the PR is marked ready; paste real output)

| Check                                                                     | Must show                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                           | Prettier clean, `actionlint` clean, typecheck 0, `4 script(s) ok.`, `# tests 323`, `# fail 0`                                                                                                                             |
| `npx playwright test --list`                                              | `Total: 18 tests in 8 files`                                                                                                                                                                                              |
| Medusa local proof (Step 2)                                               | `6 passed` with zero invalid; the 1 ms and 2 ms runs show the records and `spreadPolicy`; no leak violation; `npm run down:medusa` exit 0                                                                                 |
| `rg -n RACE_MAX_SPREAD_MS .github`                                        | no output                                                                                                                                                                                                                 |
| CI on the PR (small counts: Medusa 3, others 5)                           | `medusa-smoke`, `cal-smoke`, `documenso-smoke` green; each `race-histograms-*` artefact has `invalidTrials`, `reruns`, `spreadPolicy` in every file; the Race results table has the new column; web-log token check green |
| CI on `main` after merge (`workflow_dispatch`, full count, default limit) | all three jobs green once; `Invalid / reruns` recorded for `P6-CAL-RACE-001` (expected about `1 / 1`, zero is also valid); job time recorded, not published                                                               |
| Every product still passes its `test.fail()` proofs                       | `P6-DOC-RACE-001` (`test.fail()`), `P6-CAL-RACE-003` (`test.fail()`), `extra-loser-contract` (`test.fail()`) stay green (expected failures)                                                                               |

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

0. `docs(plans): add the phase 2 task 1 rerun-on-spread plan`: this file only.
1. `feat(races): add rerun-on-spread runner and env limits`: `src/races/{env,types,histogram,trial-record,rerun-on-spread}.ts`,
   `tests/unit/{rerun-on-spread,env,histogram,trial-record}.test.ts`, plus the six scaffolding files of Step 1.3
   (`src/medusa/run-case.ts`, `src/cal/run-case.ts`, `src/documenso/run-case.ts` and the three `*self-test.spec.ts`).
2. `feat(medusa): rerun invalid bursts`: `src/medusa/{invariants,run-case}.ts`, `tests/unit/medusa-invariants.test.ts`.
3. `feat(cal): rerun invalid bursts`: `src/cal/{invariants,run-case}.ts`, `tests/unit/cal-invariants.test.ts`,
   `tests/cal/races/cal-race-001-identical-slot.spec.ts`, `tests/cal/races/cal-race-003-overlap.spec.ts`.
4. `feat(documenso): rerun invalid bursts`: `src/documenso/{invariants,payloads,run-case}.ts`,
   `tests/unit/{documenso-invariants,documenso-payloads}.test.ts`, `tests/documenso/races/doc-race-001-last-recipients.spec.ts`.
5. `test(races): run the self-tests through the rerun runner`: the three `*self-test.spec.ts`.
6. `feat(ci): show invalid bursts and reruns in the race table`: `src/ci/race-table.ts`, `tests/unit/race-table.test.ts`.
7. `ci(races): drop the 20 ms spread stopgap and document rerun-on-spread`: `.github/workflows/perf.yml`, `README.md`,
   `.env.example`.

Environment identity (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`) is kept. No co-author, tool-attribution or session trailer
lines (AGENTS.md). `git status --short` before each commit lists only that commit's
paths; nothing under `products/`, `node_modules/` or `results/`.

## 17. Docs (README)

Replace the three "Spread ≥" bullets, the label row and the Documenso baseline sentence, and add the new subsection
"Rerun on spread (all products)" before "Medusa oversell histogram". Exact diff:

```diff
--- a/README.md
+++ b/README.md
@@ -48,10 +48,40 @@ the burst together.

 - `/health` not HTTP 200 with body `OK` → **PRODUCT BUG** (paste status and body).
-- Spread ≥ `RACE_MAX_SPREAD_MS` (default 5) with successful responses → **TEST BUG** (barrier
-  ran sequentially or was not a gate). Raise the env var on noisy CI runners; do not change the
-  helper.
+- A burst whose spread is above `RACE_MAX_SPREAD_MS` (default 5) is **invalid** and is rerun, not failed
+  (see "Rerun on spread" below). Too many invalid bursts → **TEST BUG** (runner too noisy).
 - Mapped oversell race `P6-MED-RACE-001` writes `results/races/P6-MED-RACE-001.json` when Medusa is
   up with admin credentials set (see below).

+### Rerun on spread (all products)
+
+`dispatchSpreadMs` only says how far apart Node started the requests, not when the server received them. A race
+verdict should rest on bursts that really went out together, so the spread is a precondition of a trial, not a
+product check:
+
+- A burst is **valid** when `dispatchSpreadMs <= RACE_MAX_SPREAD_MS` (default 5) and **invalid** when it is above.
+  One function, `isSpreadValid` in `src/races/rerun-on-spread.ts`, makes this decision for every product.
+- An invalid burst is kept in the histogram (`perTrial`, with `attempt` and `valid: false`) and the trial is run
+  again from scratch (new cart, slot or document, new burst) under the same trial index. A rerun is a new attempt
+  of the same trial, not a retry of a failed assertion.
+- Only the spread makes an attempt invalid. The product oracle runs on every attempt. A product violation in any
+  attempt, valid or invalid, is recorded and fails the case (or counts towards an expected-failure proof). Data of
+  every attempt is cleaned up and leak-checked.
+- `trials` is the number of valid trials asked for. Top-level `statusCounts` and `dispatchSpreadMs` count valid
+  attempts only; `invalidDispatchSpreadMs`, `invalidTrials` (attempts rejected for spread) and `reruns` (attempts
+  after the first) report the rest. Counters that decide a bug (double seal, double booking, oversell, 5xx) use every
+  attempt.
+- Two limits stop a runner that is too noisy; reaching either fails the case as **TEST BUG: runner too noisy**, with
+  every attempt kept:
+
+| Variable                     | Default | Meaning                                                                                          |
+| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
+| `RACE_MAX_SPREAD_MS`         | 5       | Largest spread, in ms, of a valid burst.                                                         |
+| `RACE_MAX_SPREAD_RERUNS`     | 3       | Reruns allowed per trial index (at most 4 bursts for one index).                                 |
+| `RACE_MAX_INVALID_SHARE_PCT` | 20      | Invalid attempts allowed per case, in whole percent of `trials`, rounded up, never fewer than 2. |
+
+Every value must be a whole number of at least 1 (the percentage at most 100); `0`, negatives, fractions and junk
+fail the run with a TEST BUG. The job summary and the race table show `Invalid / reruns` for each case; zero is a
+valid result. CI uses the defaults. Evidence for the defaults: `docs/plans/2026-10-22-p6-phase2-task1-rerun-on-spread.md`.
+
 ### Medusa oversell histogram (`P6-MED-RACE-001`)

@@ -67,5 +97,6 @@ password; locally copy names from `.env.example`). The oversell spec calls harne
 - Any `"500"` or `"error"` count is a **PRODUCT BUG** (report status and body summary). Do not treat
   it as a stock loser.
-- `dispatchSpreadMs` is still the Node start spread for the burst (see above).
+- `dispatchSpreadMs` is still the Node start spread for the burst (see above). `statusCounts` count valid
+  attempts only (see "Rerun on spread").
 - Trial count: pull requests run 3 trials; `main` (push, schedule or `workflow_dispatch`) runs 50. The extras run 3.

@@ -89,5 +120,6 @@ Later `up:cal` runs reuse the Next.js build. The self-test writes `results/races

 - `GET /pro/30min` not HTTP 200 → **PRODUCT BUG** (paste status and body start).
-- Spread ≥ `RACE_MAX_SPREAD_MS` with successful responses → **TEST BUG** (barrier).
+- A burst above `RACE_MAX_SPREAD_MS` is invalid and rerun (see "Rerun on spread"); too many → **TEST BUG**
+  (runner too noisy).
 - `up:cal` exits 1, out of memory, a blocked host, Docker or disk errors → **ENV** (paste the last
   40 lines of `cal-up.log`).
@@ -174,5 +206,5 @@ host the webhook receiver is allowed on). SSRF protection stays on for every oth
 | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 | **PRODUCT** | Health burst not 200; signup not 201; verify not `VERIFIED`; token or API v1 not 200; no confirmation email; webhook delivered not once, secret differs, `WebhookCall` not one `SUCCESS` 200, or body differs |
-| **TEST**    | Spread at or over `RACE_MAX_SPREAD_MS`; SQLSTATE not 25006; leak or cleanup failure                                                                                                                           |
+| **TEST**    | Runner too noisy (rerun cap or invalid-share budget used up); SQLSTATE not 25006; leak or cleanup failure                                                                                                     |
 | **ENV**     | `up` exits 1, Node below 24, out of memory, Docker or disk errors, a missing hosts entry or bypass host (webhook `FAILED` with `responseCode` 0), a 429, or Inbucket API drift                                |

@@ -211,5 +243,6 @@ Trial counts: 5 on pull requests, 50 on `main`, nightly and `workflow_dispatch`.

 The completion races need a serial database: no other write may reach the Documenso database during the run,
-because the `DocumentData` count is a per-trial delta. CI runs one job with `workers: 1` and a fresh
+because the `DocumentData` count is a per-attempt delta (the baseline is read again at the start of every attempt,
+so the rows of an invalid attempt are never counted in the next one). CI runs one job with `workers: 1` and a fresh
 database. Locally, run no other Documenso work while the race runs.

@@ -219,6 +252,6 @@ team or user, because account deletion re-owns completed envelopes).

 Labels: **PRODUCT BUG** (a completion 4xx or 5xx, a seal or audit count that is not 1, a delta that is not
-2, a duplicate e-mail or webhook, a `WebhookCall` that is not SUCCESS 200); **TEST BUG** (setup, spread,
-cleanup, leak, histogram); **ENV** (a blocked webhook host, a 429, a missing fixture, a stack that is down);
+2, a duplicate e-mail or webhook, a `WebhookCall` that is not SUCCESS 200); **TEST BUG** (setup, runner too
+noisy, cleanup, leak, histogram); **ENV** (a blocked webhook host, a 429, a missing fixture, a stack that is down);
 **TEST BUG (control)** (the sequential control failed). Paste the evidence (status, counts, the violation
 line); never a token.
```

`.env.example` (names only):

```diff
--- a/.env.example
+++ b/.env.example
@@ -23,6 +23,13 @@ RACE_TRIALS=

 # Max client-side dispatch spread in ms (Node start times, not server receive). Default: 5.
+# A burst above it is invalid and rerun (README "Rerun on spread").
 RACE_MAX_SPREAD_MS=

+# Reruns allowed per trial index when a burst is invalid. Whole number >= 1. Default: 3.
+RACE_MAX_SPREAD_RERUNS=
+
+# Invalid attempts allowed per case, in whole percent of the trials (1 to 100). Default: 20.
+RACE_MAX_INVALID_SHARE_PCT=
+
 # Cal web URL. 127.0.0.1 only. Default when unset: http://127.0.0.1:3000
 CAL_BASE_URL=
```

## 18. Will NOT do

- No change to `runTrials`, `fireTogether`, `dispatchSpreadMs()`, `src/oracles/pg.ts`, the harness or a fork.
- No rerun for anything but the spread: a failed assertion, a 5xx, a setup error or a cleanup error is never rerun.
- No Playwright `retries`, no sleeps, no `test.fail()` added, no assertion weakened, no timeout raised.
- No change to the default `RACE_MAX_SPREAD_MS` (5), to trial counts, or to job timeouts.
- No warm-up burst (X1), no server-arrival evidence (X2), no event-loop metrics (X3) until accepted.
- No blind CI re-runs: a red job is root-caused first (PRODUCT BUG or TEST BUG, with evidence).
- No PR, no published timing, no secret, no personal name in any file or log.

## 19. Risks and unknowns

- **R1 Reruns hiding a real problem.** Mitigation: D3 (a violation in any attempt fails the case), the per-trial cap, the
  budget, and every attempt kept in `perTrial`. `test.fail()` proofs count every attempt.
- **R2 Rate of invalid bursts rising unnoticed.** The budget fails loudly at 20%, but 5% would pass. Mitigation: the
  `Invalid / reruns` column in every job summary; proposed X4 for the closeout.
- **R3 The independence assumption in §2.8.** A noisy minute makes consecutive bursts slow together. The budget, not the
  per-trial cap, is the guard; the live 1 ms run shows it stopping a case at trial 1.
- **R4 Trial 1 effect is not explained.** The cause (cold route, pool) is a hypothesis; X1 and X3 would test it. The plan
  does not depend on it.
- **R5 Documenso `DocumentData` delta.** Late writes of an earlier attempt after its snapshot would shift the next
  baseline. Mitigation: the baseline is read after the previous attempt's cleanup; the seal, email and webhook jobs are
  waited to terminal states before the snapshot (Task 7 D23); still the "serial database" requirement stays in the README.
- **R6 Names.** A rerun's data names differ from attempt 1's; attempt 1 keeps today's names so existing evidence and
  patterns stay valid.
- **R7 Required fields on `RaceTrialResult`.** Any future code that builds a record by hand must set `attempt` and
  `valid`; the typecheck enforces it (it found six places in the dry run).
- **R8 CI time.** Bounded by the budget (§2.8): at most 10 extra bursts at full count.
- **R9 `perTrial` now means "attempts".** Any external reader that assumes one row per trial must filter on `valid`. The
  only in-repo readers are `src/ci/race-table.ts` and two specs, all updated here.
- **R10 Old histograms.** The release zips lack the new fields. The race table treats them as valid and shows `n/a`.

## 20. Decisions (2026-10-22; numbering continues from the roadmap's D12)

- **D13 Module and runner contract.** `src/races/rerun-on-spread.ts` holds the policy, the decision, the runner and two
  helpers; `runTrials` is unchanged and wraps `runner.runTrial`. An attempt function returns a record and does not throw
  for violations. Standard: a small pure module with an injected attempt function, testable without a network.
  Rejected: editing `runTrials` (agreed not to), a class hierarchy.
  **Flag (a rerun is normally an anti-pattern):** re-running a test until it passes is the "flaky retry" the race rules
  forbid. This is a different thing: only the measurement precondition (the burst spread) is repeated, the assertions
  never are, every discarded burst stays in the histogram, the number of discards is capped, and a product violation in
  a discarded burst still fails the case (D3). It is the same idea as discarding a bad sample in a benchmark. The standard
  alternatives are to fail on the precondition (today's behaviour, which produced the stopgap) or to widen the limit
  (the stopgap itself, which makes the check meaningless).
- **D14 One comparison, owned by `isSpreadValid` (D2, agreed 2026-10-22).** `<=` valid, `>` invalid. The invariants lose
  `dispatchSpreadMs` and `spreadLimit`; the self-test specs lose their copies. Rejected: keeping a spread line in the
  invariants "as a second opinion" (two places would drift).
- **D15 Cap defaults.** `RACE_MAX_SPREAD_RERUNS` = 3, `RACE_MAX_INVALID_SHARE_PCT` = 20, budget =
  `max(2, ceil(trials × pct / 100))` (§2.8). Both parsed strictly: whole numbers, `>= 1`, the percentage `<= 100`.
  **Flag (non-standard):** the budget has a constant floor of 2 that is not configurable, and the share is a whole
  percent in the variable name (`_PCT`) because `positiveIntFromEnv` is integer-only. The standard alternative is a
  fractional ratio (`0.2`) with its own float parser, and a `RACE_MIN_INVALID_BUDGET` variable instead of a constant.
  Chosen: fewer knobs, one parser. Open to the owner (Q1, Q2).
- **D16 Which counters use which attempts.** Rates and setup counts use **valid** attempts (`statusCounts`, spread
  aggregate, losers, `acceptedTotal`, outcomes, `signedResponses`, `trialsSingleSeal`, `envelopeCompletedTrials`, "accepted
  per trial"). Counters that decide a bug or an error use **every** attempt (`doubleSealTrials`, `overlapPairs`,
  `doubleBookSummary`, `clientErrorResponses`, `serverErrorResponses`, `allResponses`, `guardViolations`, oversold
  trials, skipped-window evidence). This is D3 and D4 applied counter by counter; one rule: "a number that is published
  as a rate excludes discarded bursts; a number that can prove a bug includes them".
- **D17 Attempt naming.** `attemptTag(trial, attempt)`: `t3` for attempt 1, `t3a2` for a rerun. Attempt 1 keeps today's
  names. Rejected: renaming everything to `t3a1` (churns existing evidence and tests for no gain); a random suffix
  (unrepeatable).
- **D18 Documenso baseline per attempt (agreed 2026-10-22).** `docDataBefore` is read at the start of every attempt,
  after the previous attempt's cleanup.
- **D19 A throw is not an invalid trial.** An attempt that throws (setup or cleanup broken) leaves a stub record
  (`valid: false`, no statuses), is not rerun, and is not counted in `invalidTrials` (that counter means "rejected for
  spread"). It fails the trial index as before.
- **D20 Extra histogram fields.** `invalidDispatchSpreadMs` and `spreadPolicy` are added beyond the agreed list: the
  first so the discarded spreads are visible without scanning `perTrial`, the second so evidence states which limits
  applied. **Flag (non-standard):** `perTrial` holds attempts. The standard shape is two arrays (`trials[]` for the valid
  result and `attempts[]` for every burst). Chosen as agreed in D4 ("invalid attempts keep their own record in
  `perTrial`"); open question Q5.
- **D21 `RACE_MAX_SPREAD_MS` stays 5 (agreed 2026-10-22: unless the probe shows a reason).** It does not: Medusa max
  5.56 ms in 418 bursts, Cal 7.63 ms, and the cause of the Cal outliers is the cold first burst that a rerun absorbs.
- **D22 Race table.** One new column; rates from valid records, bug counts from all; "attempts" wording only when invalid
  bursts exist, so a clean run reads as before.
- **D23 Self-tests use the runner.** The three self-tests lose their own spread check, trial loop and stub block, so
  there is one spread rule everywhere (the roadmap's "all existing cases re-run under it").
- **D24 No timeout change.** Per-test and job timeouts have at least 2x margin over the measured worst case plus the
  budget's extra bursts (§2.8).
- **D25 Dry run before the plan.** The plan's code was built and tested in a scratch copy (§2.9), so every diff and every
  expected count in this document is from a real run, not an estimate.

## 21. Open questions for the maintainer

1. **Q1, the floor of 2.** Keep the fixed floor `MIN_INVALID_BUDGET = 2` (D15), or make it a variable, or drop it? Without
   a floor a 3- or 5-trial PR run would fail on a single cold first burst plus one bad rerun. Recommendation: keep.
2. **Q2, the variable name and unit.** `RACE_MAX_INVALID_SHARE_PCT` as a whole percent (D15), or `RACE_MAX_INVALID_SHARE`
   as a ratio with a float parser? Recommendation: keep the percent.
3. **Q3, proposed extras.** Accept or decline X1 (warm-up burst), X2 (server-arrival evidence), X3 (event-loop delay), X4
   (rates in the README results). X1 is the one with data behind it (§2.3).
4. **Q4, roadmap labels.** The roadmap still marks D2 to D4 "proposed" and lists the narrower file set. May the build PR
   update those lines (a docs commit), or should they wait for the Phase 2 closeout? This task's instruction was to commit
   only the plan.
5. **Q5, `perTrial` as attempts.** Keep as agreed (D4/D20), or split into `trials[]` and `attempts[]` now while only three
   readers exist? Recommendation: keep; the cost of the split grows later, but it is a pure refactor.
6. **Q6, local proof on Cal and Documenso.** The Medusa proof is mandatory; the Cal and Documenso runs are optional on the
   VM because CI runs them. Make them mandatory before the PR?

## Appendix A. Scratch scripts (never committed)

Saved in the session scratchpad; run with `node`. Inputs are the extracted release zips and artefact zips, each in its own
directory (`<root>/<run id>/race-histograms-*/*.json`); the analysis scripts live in a different directory and take the
root as an argument.

### A.1 `spread.cjs`: spread distribution per case

```js
// usage: node spread.cjs <extracted-root>   (reads <root>/<runId>/race-histograms-*/*.json)
const fs = require("fs"),
  path = require("path");
const root = process.argv[2];
const by = {};
for (const run of fs.readdirSync(root)) {
  const rd = path.join(root, run);
  for (const d of fs.readdirSync(rd).filter((x) => x.startsWith("race-histograms-"))) {
    for (const f of fs.readdirSync(path.join(rd, d)).filter((x) => x.endsWith(".json"))) {
      const h = JSON.parse(fs.readFileSync(path.join(rd, d, f), "utf8"));
      const e = (by[h.caseId] ??= { conc: h.concurrency, runs: new Set(), v: [], perRun: {} });
      e.runs.add(run);
      for (const t of h.perTrial ?? []) {
        if (typeof t.dispatchSpreadMs !== "number") continue;
        e.v.push(t.dispatchSpreadMs);
        (e.perRun[run] ??= []).push(t.dispatchSpreadMs);
      }
    }
  }
}
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};
const r = (x) => (Math.round(x * 100) / 100).toFixed(2);
console.log(
  "caseId | N | runs | trials | zeros | >1 | >2 | >=5 | >5 | >10 | max | p95 | p99 | mean",
);
for (const [id, e] of Object.entries(by).sort()) {
  const v = e.v;
  if (!v.length) continue;
  const c = (f) => v.filter(f).length;
  console.log(
    [
      id,
      e.conc,
      e.runs.size,
      v.length,
      c((x) => x === 0),
      c((x) => x > 1),
      c((x) => x > 2),
      c((x) => x >= 5),
      c((x) => x > 5),
      c((x) => x > 10),
      r(Math.max(...v)),
      r(pct(v, 0.95)),
      r(pct(v, 0.99)),
      r(v.reduce((a, b) => a + b, 0) / v.length),
    ].join(" | "),
  );
}
console.log("\nper-run max for cases with any >5:");
for (const [id, e] of Object.entries(by).sort())
  for (const [run, vs] of Object.entries(e.perRun))
    if (vs.some((x) => x > 5))
      console.log(
        id,
        run,
        "n=" + vs.length,
        "max=" + r(Math.max(...vs)),
        "over5=" + vs.filter((x) => x > 5).length,
      );
```

### A.2 `byindex.cjs`: spread by trial index

```js
const fs = require("fs"),
  path = require("path");
const root = process.argv[2];
const rows = {};
for (const run of fs.readdirSync(root))
  for (const d of fs
    .readdirSync(path.join(root, run))
    .filter((x) => x.startsWith("race-histograms-")))
    for (const f of fs.readdirSync(path.join(root, run, d)).filter((x) => x.endsWith(".json"))) {
      const h = JSON.parse(fs.readFileSync(path.join(root, run, d, f), "utf8"));
      if (
        !["P6-CAL-RACE-001", "P6-MED-RACE-001", "P6-CAL-RACE-003", "P6-DOC-RACE-002"].includes(
          h.caseId,
        )
      )
        continue;
      for (const t of h.perTrial) {
        (rows[h.caseId] ??= []).push([t.trial, t.dispatchSpreadMs, run]);
      }
    }
for (const [id, v] of Object.entries(rows)) {
  const first = v.filter((x) => x[0] === 1).map((x) => x[1]),
    rest = v.filter((x) => x[0] > 1).map((x) => x[1]);
  const m = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "-");
  console.log(
    id,
    "trial1 n=" + first.length,
    "mean=" + m(first),
    "max=" + (first.length ? Math.max(...first).toFixed(2) : "-"),
    "| trials>1 n=" + rest.length,
    "mean=" + m(rest),
    "max=" + Math.max(...rest).toFixed(2),
  );
  console.log(
    "   >5 ms at trial index:",
    v
      .filter((x) => x[1] > 5)
      .map((x) => x[0])
      .join(",") || "none",
  );
}
```

### A.3 `cap2.cjs`: the numbers behind the cap defaults

```js
// Two-population model for P6-CAL-RACE-001, inputs = counts from the p6-phase1 release.
// P6-CAL-RACE-001, 13 runs: trial 1: 9 of 13 first bursts > 5 ms; later trials: 4 of 637 > 5 ms.
const z = 1.96;
const wil = (k, n) => {
  const p = k / n;
  return (
    (p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
    (1 + (z * z) / n)
  );
};
const C = (a, b) => {
  let r = 1;
  for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i;
  return r;
};
const tailGT = (N, p, m) => {
  let s = 0;
  for (let i = m + 1; i <= N; i++) s += C(N, i) * p ** i * (1 - p) ** (N - i);
  return s;
};
const pRest = 4 / 637,
  pRestHi = wil(4, 637),
  pFirst = 9 / 13;
console.log(
  "p_rest",
  pRest.toFixed(4),
  "wilson95 upper",
  pRestHi.toFixed(4),
  "| p_first",
  pFirst.toFixed(3),
);
for (const [label, pr] of [
  ["observed", pRest],
  ["upper95", pRestHi],
]) {
  console.log("\n" + label + " rest-rate");
  for (const R of [1, 2, 3, 4])
    console.log(
      `R=${R}: P(a later index exhausts)=${(pr ** (R + 1)).toExponential(2)}  P(trial 1 exhausts)=${(pFirst * pr ** R).toExponential(2)}  P(any index in 50)=${(1 - (1 - pr ** (R + 1)) ** 49 * (1 - pFirst * pr ** R)).toExponential(2)}`,
    );
  for (const N of [3, 5, 30, 50])
    for (const pct of [10, 20]) {
      const allowed = Math.max(2, Math.ceil((N * pct) / 100));
      // invalid attempts = [trial1 invalid] + invalid among the other attempts (N-1+invalid draws approx N-1+allowed)
      const pBudget =
        pFirst * tailGT(N - 1 + allowed, pr, allowed - 1) +
        (1 - pFirst) * tailGT(N - 1 + allowed, pr, allowed);
      console.log(
        `N=${N} pct=${pct} allowed=${allowed}: P(invalid>allowed)~${pBudget.toExponential(2)}`,
      );
    }
}
```

### A.4 `probe4-medusa.mts`: can Medusa setup repeat inside one trial index? (needs the stack up and the admin variables set)

```ts
// Proof only (cloud VM). Imports the real src modules; writes nothing to the repo.
import {
  seedAndLogin,
  loadCatalog,
  createStockedVariant,
  deleteProduct,
  deleteCustomersByEmail,
} from "<repo root>/src/medusa/admin.ts";
import { prepareReadyCart } from "<repo root>/src/medusa/store.ts";
import { prefixedEmail } from "<repo root>/src/medusa/payloads.ts";
const token = await seedAndLogin();
const catalog = await loadCatalog(token);
const prefix = "p6-probe4-" + Date.now().toString(36);
const mk = (leaf: string) => createStockedVariant({ token, catalog, prefix, leaf, s: 5 });
const out: string[] = [];
const a1 = await mk("t1-product");
out.push("attempt 1 product created: yes");
const email = prefixedEmail(prefix, "t1-c00");
const c1 = await prepareReadyCart({
  publishableKey: catalog.publishableKey,
  regionId: catalog.regionId,
  salesChannelId: catalog.salesChannelId,
  variantId: a1.variantId,
  email,
  quantity: 1,
});
out.push("attempt 1 cart ready: line-item HTTP " + c1.lineItemStatus);
// (1) same leaf again while attempt 1 still exists (cleanup of attempt 1 failed)
try {
  const dup = await mk("t1-product");
  out.push(
    "same leaf, previous product still present: created (ids differ: " +
      (dup.productId !== a1.productId) +
      ")",
  );
  await deleteProduct(token, dup.productId);
} catch (e) {
  out.push("same leaf, previous product still present: " + (e as Error).message);
}
// (2) attempt-specific leaf while attempt 1 still exists
const a2 = await mk("t1a2-product");
out.push("attempt-specific leaf t1a2, previous product present: created");
// (3) same email in a second cart (rerun uses a fresh cart, same customer email)
const c2 = await prepareReadyCart({
  publishableKey: catalog.publishableKey,
  regionId: catalog.regionId,
  salesChannelId: catalog.salesChannelId,
  variantId: a2.variantId,
  email,
  quantity: 1,
});
out.push(
  "second cart, same email, new variant: line-item HTTP " +
    c2.lineItemStatus +
    ", cartIds differ: " +
    (c1.cartId !== c2.cartId),
);
// (4) delete attempt 1 product, recreate with the SAME leaf
await deleteProduct(token, a1.productId);
try {
  const a3 = await mk("t1-product");
  out.push("same leaf after deleteProduct: created");
  await deleteProduct(token, a3.productId);
} catch (e) {
  out.push("same leaf after deleteProduct: " + (e as Error).message);
}
await deleteProduct(token, a2.productId);
await deleteCustomersByEmail(token, email);
console.log(out.join("\n"));
```
