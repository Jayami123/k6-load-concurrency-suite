# P6 dashboard v2 (plan only)

Roadmap: Phase 5 presentation of the Phase 4 evidence. Written on `plan/2026-10-28-p6-dashboard-v2` from `origin/main` at `85a9302` (`docs(readme): add the phase 4 results (#126)`, 2026-10-28 14:42 Asia/Colombo). Probe date 2026-10-28. **VM timings prove that a step works; none is a published number or a target.** Stop for owner review before any build PR.

## 1. Header

- **Task:** dashboard v2 of the P6 GitHub Pages site. Fixes V1–V9. Delivers D1–D7.
- **Base SHA:** `85a9302` (re-fetched 2026-10-28 18:23 Asia/Colombo; newer wins).
- **B0:** **1336** unit tests pass, 0 fail, 329 suites. `npm run check` exit 0. Node v22.23.3 (`package.json` engines `>=22.22.0`).
- **Build branch pattern:** `feat/<build date>-p6-dashboard-v2-<slug>` per PR (Asia/Colombo date of the build session). Plan branch stays `plan/2026-10-28-p6-dashboard-v2` and is not a build branch.
- **Unit-test delta:** **+55 against B0 1336**, expected **1391** after PR-I. Per PR: T +2, A +0, B +0, C +9, D +9, E +6, F +6, G +9, H +9, I +5, J +0.
- **Stop for owner review: yes.** This session is plan-only. The build changes `pages.yml` (new `scan` job) and `gate.yml` (CI), publishes a redesigned public site, and labels PRODUCT BUG (SUSPECTED) rows in a committed findings file. No build starts until the owner says so.

## 2. What it proves

- Every number on the site is computed at build time from a published release zip or a committed file. A missing source reads `pending: <reason>`. INVALID runs are listed and never plotted.
- The five chart families (knee curves, soak trends, A/A noise, A/B ratios, race tallies) are static inline SVG with a data table beside each chart, no CDN, no script, no remote font.
- V1–V9 are closed by named files and named tests. The live tiles after the last PR match the released values in §3, each with its source run ids.
- The site stays secret-free: `scripts/evidence-token-scan.mjs` and pinned gitleaks run over `site/` and over `tests/fixtures/dashboard/` before anything is published.

## 3. Live probe evidence

Commands below were run 2026-10-28 18:23–18:55 Asia/Colombo. Trimmed outputs quote field names and numbers only. A GitHub client is never named; release zips were read the same way the pages job **Fetch the planned zips and check each one's sum** (`.github/workflows/pages.yml` lines 83–95) reads them.

### 3.1 V1–V9

| Id  | Command (trimmed)                                                                                                                       | Output (trimmed)                                                                                                                                                                                                                                                                      | Value it sets                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| V1  | Python walk of every `knee-report-main.json` in p6-phase4a and p6-phase4                                                                | 18 reports. Every `firstSaturated.resource` is `app_cpu`, steps 2–6. Footnote in `src/dashboard/render/page.ts:94` still says the resource is not in the committed bounds.                                                                                                            | Site gap, not a data gap. Knee charts must mark `<resource> at step <n>`.                                 |
| V2  | Walk of 10 `soak.json`                                                                                                                  | `verdict` always `NO THRESHOLD YET`, `reasons` `no soak-bounds.json entry for this product`. `statistics.rssMb.slope.theilSenPerMin` present. `k6/thresholds/soak-bounds.json` `"products": {}`.                                                                                      | Chart the series and print the slope. Never invent a bound.                                               |
| V3  | Read `.github/workflows/pages.yml` lines 3–7 and 21–24; grep `EVIDENCE_RELEASE`; live site built from `3c9d164` while main is `85a9302` | Triggers are `workflow_run` and `workflow_dispatch` only. `EVIDENCE_RELEASE` defined at line 24, read nowhere else. Live Last-Modified 14:25:01 Asia/Colombo, pages run 40660111756 head `3c9d164`.                                                                                   | Add a `push` trigger on `main` with `paths:`. Remove the dead env. Fit step caps under 20.                |
| V4  | Live site findings table vs README.md:539–563 vs `docs/observations/`                                                                   | Site lists 2 rows (MED-001, MED-002). README has 18 rows. Observation files: 5. Heading regex in `build-site.ts:64` requires `# P6-OBS-`. RSS file uses `## P6-OBS-CAL-005`.                                                                                                          | Findings come from `docs/findings.json`, not from observation headings.                                   |
| V5  | `src/dashboard/cards.ts:105` and `:114`; A/A zips 40497029348 and 40605925118                                                           | `caseIds: []`. Arms are VALID PASS in the release. Tile: `A/A tolerance committed; runs pending release`.                                                                                                                                                                             | Set case ids. Card reads the released arms.                                                               |
| V6  | `walkVerdicts` (`build-site.ts:75`) vs race files `race-histograms-*/**/P6-*-RACE-*.json` in p6-phase4 perf runs                        | `walkVerdicts` reads only `verdict.json`. Race cards PENDING. Histograms are in the release.                                                                                                                                                                                          | Walk `P6-*-RACE-*.json` too.                                                                              |
| V7  | `cards.ts:59–66`; race JSON `title`; roadmap `docs/plans/2026-10-22-p6-phase2-roadmap.md:106` and `:393–394`                            | Promo card titled `Medusa promo ledger (P6-MED-RACE-008)`. Histogram title `two parallel cancels of one order`. Promo/budget cases are `-005` and `-012` (zip dir `race-histograms-medusa-budget`).                                                                                   | Move `-008` onto the cancel card with `-009`. Promo card uses `-005` and `-012`.                          |
| V8  | Three `P6-MED-LOAD-009/**/verdict.json` in 40498902575, 40524237209, 40526041971                                                        | `outcome` `PASS`, `reasons` `[]`, `stages.reconcile.data.knownFail` `P6-OBS-MED-002`, `leakedCanceledOrders` 4, 5, 6. `computeCard` (`cards.ts:131`) checks `outcome === "FAIL"` only. Site `KNOWN FAIL 0`. **Fact in the prompt found wrong:** the reason string is not in the file. | Read `knownFail` from `stages.reconcile.data`. Do not require `outcome === "FAIL"`.                       |
| V9  | Zip `p6-40636843578-evidence/ab-medusa/` vs `ab-cal/gate-verdict-cal.json`; `gate.yml:982` and `:990–1012`                              | Cal has `gate-verdict-cal.json` and `a-1`..`b-3` dirs. Medusa has six unlabelled VALID PASS run dirs, no verdict file, `run-meta` has no `arm` field. Token-scan step flattens arm dirs and does not copy the verdict.                                                                | PR-B stages `gate-verdict-medusa.json` and `ab-medusa-arm-map.json`. Site never claims unreleased labels. |

### 3.2 Field lists (section 5.3 of the prompt)

| Field list     | Command / source                                                                                                                   | Output (trimmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Value it sets                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Knee reports   | 18 files `knee-*/<case>/<run>/knee-report-main.json`                                                                               | Keys: `schema, ruleId, caseId, runId, label, verdict, range, stop, firstSaturated, limitation, stopRule, steps, conflicts, invalid, environment`. `environment` is a **string**, not an object.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Use these names only.                                                           |
| Knee Cal probe | 40234172872 `P6-CAL-LOAD-005/20261025T211249Z-930402a3/knee-report-main.json`                                                      | 9 steps (index 0–8), `range` 12–14, `firstSaturated` `{resource: app_cpu, step: 5}`, `limitation` `the first saturated resource is taken from step 5, before the stop at step 6`, `stop.step` 6, `ruleId` `P6-RULE-006`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fixture `tests/fixtures/dashboard/knee/cal-40234172872.json`.                   |
| Knee INVALID   | 40234172872 Documenso `20261025T211144Z-2d4c30cb`                                                                                  | `verdict` `INVALID`, `invalid[0].code` `dropped_iterations`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | List, never plot.                                                               |
| Soak files     | 10 `soak.json` in runs 40364715443, 40364720958, 40373021384, 40373634603, 40376505653, 40376751161, 40455577906, 40505035282 (×3) | `verdict` `NO THRESHOLD YET`. `statistics` has `durationSec, warmupSec, rssMb, fds, dbConnections` each with `slope{n, slopePerMin, theilSenPerMin, stepsOver, reason}` and `plateau{n, middleMedian, lastMedian, ratio, reason}`. 40505035282 also has `rssD33`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Slopes from this file, never refit.                                             |
| Soak med-120   | 40455577906 `soak-medusa-120/.../soak.json`                                                                                        | rss `theilSenPerMin` 0.1478153090900617, plateau `ratio` 1.010694309908446.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Fixture asserted values (print 0.1478 and 1.0107).                              |
| Soak doc-30    | 40364720958 / 40376751161 / 40505035282                                                                                            | theilSenPerMin 10.3537, 11.6499, 12.4485.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | "about 10–12.4" confirmed.                                                      |
| Telemetry      | 10 `telemetry-main.json` in soak dirs                                                                                              | Keys `schema, product, startedAtMs, stoppedAtMs, intervalMs` (1000), `sources, samples, gaps, limits{maxConnections, fdsSoftLimit}`. Sample: `t, sampleCostMs, proc{cpuTicks, rssMb, fds, members}, log, container{cpuNs, memBytes}, probe{ok, status, ms}, db{active, idleInTx, waiting, total, ...}`. 120 min file ~6.0 MB / 7201 samples.                                                                                                                                                                                                                                                                                                                                                                                       | Downsample at 1 minute. Never copy the raw file into `site/`.                   |
| A/A            | 40497029348 head `9640e8b`, 40605925118 head `4db5975`; `run-meta.startedAt` + `k6-main-summary.json`                              | Dropping the earliest `startedAt` per run per product: Cal p95 77.36236, 77.52155, 76.21159 / 60.05507, 59.50627, 58.34139 → spread 0.2815090877016766, tolerance 0.5630181754033532. Medusa 220.75429, 228.38899, 221.58890 / 220.91392, 229.55115, 221.04940 → spread 0.039747372698561996, tolerance 0.1 (FLOOR). Warm-ups Cal 80.10, 64.32; Medusa 228.88, 240.92. All VALID PASS. `p95 = http_req_duration["p(95)"]` (`src/load/baseline-band.ts:68–79`).                                                                                                                                                                                                                                                                     | Fixtures and A/A chart.                                                         |
| A/B Cal        | 40636843578 `ab-cal/gate-verdict-cal.json`                                                                                         | Keys `product, caseId, a[3], b[3], tolerance, verdict, ratios, rule, reasons, excluded, exitCode`. a 86.645, 83.022, 83.484; b 83.323, 82.273, 85.542; ratios 0.99807, 0.98549, 1.02465; `verdict` `PASS`; `rule` `repeated regression: every B arm's ratio is above 1 + toleranceRel`.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Cal chart from this file.                                                       |
| A/B Medusa     | 40636843578 `ab-medusa/load-medusa/P6-MED-LOAD-002/`                                                                               | 6 VALID PASS, no `gate-verdict-medusa.json`, no `arm` in run-meta. Recomputed from start order (a, b alternating): a 224.543, 215.298, 215.187; b 218.632, 217.043, 214.772; ratios 1.01549, 1.0081, 0.99756. **INFERENCE (Q-3).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Do not draw labelled A/B until a post-PR-B release.                             |
| Selftest       | `gate-selftest/selftest.json`                                                                                                      | `p95{a, slow, same}`, `slowed{verdict: "FAIL (REGRESSION)", ratios, rule, reasons}`, `unchanged{verdict: PASS, ratios}`, `check{ok: true}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Gate proof chart.                                                               |
| Races          | 5 perf runs 40465973379, 40469597860, 40498902575, 40524237209, 40526041971                                                        | Histogram keys: `caseId, title, product, commitSha, startedAt, finishedAt, trialsRequested, concurrency, statusCounts, trials, attempts, warmup, dispatchSpreadMs, invalidDispatchSpreadMs, invalidTrials, reruns, spreadPolicy, invariantViolations, verdict, oracle`. Tally matches the prompt (CAL-001 50/0, 51/0, 51/0, 50/0, 51/0 with 1 invalid attempt in runs 2, 3, 5; CAL-003 fail 30/29..; DOC-001 fail 50/50 ×5; DOC-002 pass 50/0 ×5; MED-008 suspectedBug 50 ×5; -009 13, 20, 16, 12, 9; -011 37, 34, 37, 36, 35; -005 4, 0, 6, 0, 1; -012 22, 14, 14, 14, 18; MED-001/007/010 0). CAL-006..009 pass, 0 violations in **all five** runs. TW-\* `verdict` `fail`, 0 `invariantViolations`, `oracle.companyRowsLeft` 0. | Race charts. Twenty card PENDING until a post-PR-T release (Q-5).               |
| Invariants     | `burst.json`, `stale.json`, `exactly-once.json`, LOAD-009 `verdict.json`                                                           | burst keys `accepted, attempts, histogram, knownBugs, reasons, verdict`. stale keys `contract, staleCount, pollsExpected, pollsDone, timeToDisappearMs, observation, verdict, reasons`. exactly-once keys `sequentialDocs, sequentialExact, pairDocs, pairKnownDuplicates, verdict, reasons, sequentialDocsRead`.                                                                                                                                                                                                                                                                                                                                                                                                                  | Under-load card still uses `verdict.json`; extra files are evidence links only. |
| Findings 5.4   | README.md:539–563; public issue API; `docs/observations/`; `docs/BACKLOG.md:117, :127`                                             | Upstream issues 30375, 30374, 30376, 3187 open. Comment 6318151560 exists. #29815 has 3 comments, none from the owner's account → `existing issue; our comment not posted`. P6-OBS-CAL-004 and P6-OBS-DOC-004 have **no definition on main**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `docs/findings.json` rows in §6.6.                                              |
| Site v1        | GET the live Pages URL; `wc -c`                                                                                                    | 80589 bytes. Tiles as in the prompt. Built from `3c9d164` on 2026-10-28 08:54 UTC (14:24 Asia/Colombo start).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Size budget baseline ~80.6 KB.                                                  |
| Pages timings  | run 40660111756 jobs                                                                                                               | checkout 1 s, setup-node 3 s, validate 9 s, fetch 22 s, build 1 s, deploy step 7 s, other steps 0–1 s. Job timeout 20. Step caps sum 22.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Q-1 arithmetic.                                                                 |
| Pages caps     | `pages.yml`                                                                                                                        | collect 1, validate 3, plan-release 3, fetch 5, build 2, token scan 2, gitleaks install 1, gitleaks 2, configure-pages 1, upload 2 = 22. checkout and setup-node have no `timeout-minutes`. Deploy job 10, deploy step 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lower caps. Never raise 20.                                                     |
| Workflow ids   | public workflow API                                                                                                                | perf 376454455, knee 396253729, soak 397232763, gate 398161444, evidence-release 391606435, pages 398168028, gitleaks-config 395880805.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Unchanged.                                                                      |
| Releases       | list of tags                                                                                                                       | `p6-phase4`, `p6-phase4a` exist. `p6-phase4b` is **not** a GitHub Release (it is the `release` field in `tolerance.json` and `soak-bounds.json`). SHA256SUMS all OK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Dashboard reads zips of tags that exist.                                        |
| Probe gate     | run 40643722351                                                                                                                    | `pull_request`, not main. `docs/releases/p6-phase4.md:17` says it is not a release input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Do not fetch it.                                                                |

### 3.3 UNPROBED

1. **p6-phase4b as a GitHub Release:** does not exist. Confirm at build time it is still absent; do not fetch it.
2. **Numeric WCAG contrast of every colour token pair:** not measured in this session. PR-I's contrast unit test is the check.
3. **P6-OBS-CAL-004 and P6-OBS-DOC-004 definitions:** UNVERIFIED, no definition on main. Do not invent rows. Hand-made screenshot PNGs are out of scope (Q-7).

## 4. Depends on

Main at `85a9302` (verified):

- `.github/workflows/pages.yml` (144 lines). Pins already in the file: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`, `actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0`, `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0`, `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1`. `GITLEAKS_VERSION` 8.30.1, `GITLEAKS_SHA256` `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`.
- `.github/workflows/gate.yml` job `ab-medusa` (line 600, `timeout-minutes: 75`). Verdict write at line 982. Token-scan flatten at lines 990–1012. Comment at lines 998–999 **stays intact**. Upload `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`.
- `scripts/dashboard/build-site.ts` (`readKnee:30`, `readSoak:47`, `readObservations:58`, `walkVerdicts:69–75`).
- `src/dashboard/cards.ts` (`CARD_SPECS:39–117`, `computeCard:121–136`).
- `src/dashboard/render/page.ts` (`kneeBody:84–94`, `summaryStrip:98`, `findingsSection:163`, `renderSite:213`).
- `src/dashboard/render/svg.ts:24` `kneeRangeSvg` (kept for the bounds bar; v2 adds curve charts beside it).
- `src/dashboard/render/style.ts` (palette, 1100 px max, `prefers-color-scheme`).
- `src/dashboard/site-model.ts` (`KNEE_CASE_IDS:51`, `SOAK_CASE_IDS:57`, `escapeLabel:41`).
- `src/load/baseline-band.ts:68–79`, `src/load/gate/aa-noise.ts:31–41` (`spreadOf`; JSDoc starts at line 31, the function at line 34), `src/load/gate/ratio.ts:10–22`, `scripts/write-tolerance.ts:77–93`.
- `src/races/histogram.ts:53` default `verdict: "fail"`. `src/twenty/run-case.ts:95` `runTwentyTrials` never assigns `histogram.verdict`. `src/medusa/run-order-case.ts:76–77, 265–266` suspected lines never change the histogram verdict.
- `k6/thresholds/tolerance.json` (release name `p6-phase4b`, utcDays `2026-10-27`, `2026-10-28`), `k6/thresholds/soak-bounds.json` (`products: {}`), `k6/thresholds/knee-bounds.json` (release `p6-phase4a`).
- `docs/releases/p6-phase4.md`, `docs/evidence/pending-release.json` (`pending: []`), `README.md:539–563` and `:750–775`.
- Tests: `tests/unit/build-site.test.ts`, `dashboard-cards.test.ts`, `dashboard-render.test.ts`, `render-chart.test.ts`, `readme-rules.test.ts`.
- Releases: tags `p6-phase4a` and `p6-phase4` with `SHA256SUMS.txt` and `p6-<runId>-evidence.zip`.
- Merged PRs that produced this main: #126 (readme results), #142, #141, #140, #139 as listed on `git log`.

## 5. Build-time recheck table

| #   | Check                          | Exact command                                                                                  | Expected                                                                                                    | If it differs                                                                                                      |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | origin/main SHA                | `git fetch origin main && git rev-parse origin/main`                                           | `85a9302` or newer                                                                                          | `git merge --no-ff origin/main` on the build branch; never rebase or force-push                                    |
| 2   | B0                             | `export PATH="/usr/local/bin:$PATH"; npm ci; npm run check`                                    | exit 0, `# pass 1336` or the new main's count                                                               | stop and record the new B0; do not edit expected counts to match a red run                                         |
| 3   | p6-phase4a sums                | repeat pages.yml step **Fetch the planned zips and check each one's sum** for tag `p6-phase4a` | every zip OK                                                                                                | do not build from a zip that fails                                                                                 |
| 4   | p6-phase4 sums                 | same for tag `p6-phase4`                                                                       | every zip OK                                                                                                | same                                                                                                               |
| 5   | p6-phase4b GitHub tag          | public releases list (the **List the p6 releases** step)                                       | tag absent                                                                                                  | if a real GitHub release appears, treat it as a new source and re-probe; do not assume its contents                |
| 6   | `tolerance.json` unchanged     | `sha256sum k6/thresholds/tolerance.json`                                                       | same bytes as `85a9302` (Cal p95 tolerance 0.5630181754033532, Medusa 0.1)                                  | follow the file; update fixtures                                                                                   |
| 7   | `soak-bounds.json` unchanged   | `cat k6/thresholds/soak-bounds.json` (products only)                                           | `"products": {}`                                                                                            | never invent a bound; the soak card stays `NO THRESHOLD YET`                                                       |
| 8   | `gate-verdict-cal.json` fields | after unzip of 40636843578                                                                     | keys `product, caseId, a, b, tolerance, verdict, ratios, rule, reasons, excluded, exitCode`; verdict `PASS` | follow the file                                                                                                    |
| 9   | LOAD-009 `knownFail`           | three verdict files above                                                                      | `stages.reconcile.data.knownFail === "P6-OBS-MED-002"` and `leakedCanceledOrders` 4, 5, 6                   | follow the file; do not require `outcome === "FAIL"`                                                               |
| 10  | Node                           | `node --version`                                                                               | v22 or later                                                                                                | use the repo setup; record an owner to-do if PATH must change (Cursor cloud: `export PATH="/usr/local/bin:$PATH"`) |
| 11  | Action pins                    | grep SHA comments in `pages.yml` and `gate.yml`                                                | the SHAs in §4                                                                                              | keep the SHA already in the repo; do not float a tag                                                               |
| 12  | Word `capacity`                | `npm run test:unit -- tests/unit/readme-rules.test.ts`                                         | pass                                                                                                        | never add the bare word to the site                                                                                |

## 6. Design

### 6.1 File tree

```text
.github/workflows/pages.yml                         CHANGED  PR-A (push trigger, split scan job, dead env); PR-I does not touch it
.github/workflows/gate.yml                          CHANGED  PR-B only (stage verdict + arm map; comment 998-999 intact)
src/twenty/run-case.ts                              CHANGED  PR-T (assign histogram.verdict)
tests/unit/twenty-histogram-verdict.test.ts         NEW      PR-T
docs/findings.json                                  NEW      PR-C  machine-readable findings
docs/findings.schema.json                           NEW      PR-C
src/dashboard/findings.ts                           NEW      PR-C  load + types
src/dashboard/verdicts.ts                           NEW      PR-D  walkVerdicts (moved out of build-site.ts)
src/dashboard/collect.ts                            NEW      PR-D  one registration point
src/dashboard/render/charts.ts                      NEW      PR-D  SVG primitives
src/dashboard/knee/read-curves.ts                   NEW      PR-D stub, PR-E fills
src/dashboard/soak/read-trends.ts                   NEW      PR-D stub, PR-F fills
src/dashboard/soak/downsample.ts                    NEW      PR-F
src/dashboard/gate/read-aa.ts                       NEW      PR-D stub, PR-G fills
src/dashboard/gate/read-ab.ts                       NEW      PR-D stub, PR-G fills
src/dashboard/races/read-tallies.ts                 NEW      PR-D stub, PR-H fills
src/dashboard/render/knee-chart.ts                  NEW      PR-D stub, PR-E fills
src/dashboard/render/soak-chart.ts                  NEW      PR-D stub, PR-F fills
src/dashboard/render/aa-chart.ts                    NEW      PR-D stub, PR-G fills
src/dashboard/render/ab-chart.ts                    NEW      PR-D stub, PR-G fills
src/dashboard/render/race-chart.ts                  NEW      PR-D stub, PR-H fills
src/dashboard/cards.ts                              CHANGED  PR-H (V5, V6, V7, V8)
src/dashboard/render/page.ts                        CHANGED  PR-D (one-line section hooks); PR-I (findings table, CSP)
src/dashboard/render/style.ts                       CHANGED  PR-I (remove transitions; D4)
src/dashboard/site-model.ts                         CHANGED  PR-D (PageContext extras live in collect types, not here unless needed)
scripts/dashboard/build-site.ts                     CHANGED  PR-D (call collectFromArtefactDir)
tests/fixtures/dashboard/                           NEW      trimmed JSON, `_source` header
tests/unit/findings-schema.test.ts                  NEW      PR-C
tests/unit/dashboard-fixtures-scan.test.ts          NEW      PR-C
tests/unit/dashboard-charts.test.ts                 NEW      PR-D
tests/unit/dashboard-collect.test.ts                NEW      PR-D
tests/unit/dashboard-knee-curves.test.ts            NEW      PR-E
tests/unit/dashboard-soak-trends.test.ts            NEW      PR-F
tests/unit/dashboard-aa-ab.test.ts                  NEW      PR-G
tests/unit/dashboard-races.test.ts                  NEW      PR-H
tests/unit/dashboard-cards.test.ts                  CHANGED  PR-H
tests/unit/dashboard-findings-page.test.ts          NEW      PR-I
tests/unit/dashboard-size-budget.test.ts            NEW      PR-I
tests/unit/dashboard-contrast.test.ts               NEW      PR-I
README.md                                           CHANGED  PR-J
```

**Shared-file rule (D-WAVE2):** PR-D adds stub modules that return empty arrays / `""`, and wires them once in `collect.ts`, `build-site.ts` and `page.ts`. Wave 2 PRs edit only their own module, chart file, tests and fixtures. `cards.ts` is PR-H only. PR-I is the second editor of `page.ts` and runs after Wave 2.

### 6.2 Collect (PR-D)

D-COLLECT (decided): move `walkVerdicts` into `src/dashboard/verdicts.ts` (NEW, PR-D). `build-site.ts` imports it. Do not import `scripts/dashboard/build-site.ts` from `src/` (that cycle would load the CLI `main`). Keep `{ dir, verdict }` so the existing `chart-main.html` copy in `build-site.ts:115–120` still finds the file next to `verdict.json`.

```ts
// src/dashboard/verdicts.ts  (NEW, PR-D)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface VerdictInput {
  runId: string;
  caseId: string;
  outcome: string;
  validity: string;
  reasons: string[];
  knownFail?: string; // stages.reconcile.data.knownFail
  leakedCanceledOrders?: number;
  suspectedBugCount?: number;
  githubRunId: string;
}

export interface WalkedVerdict {
  dir: string; // parent of verdict.json; chart-main.html lives here when present
  verdict: VerdictInput;
}

/** Recursively finds verdict.json. caseId = grandparent dir, runId = parent dir. Also reads knownFail. */
export function walkVerdicts(root: string, githubRunId: string): WalkedVerdict[] {
  const out: WalkedVerdict[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "verdict.json") {
        const v = JSON.parse(readFileSync(p, "utf8"));
        const knownFail =
          typeof v.stages?.reconcile?.data?.knownFail === "string"
            ? v.stages.reconcile.data.knownFail
            : undefined;
        const leaked =
          typeof v.stages?.reconcile?.data?.leakedCanceledOrders === "number"
            ? v.stages.reconcile.data.leakedCanceledOrders
            : undefined;
        out.push({
          dir: path.dirname(p),
          verdict: {
            runId: path.basename(path.dirname(p)),
            caseId: path.basename(path.dirname(path.dirname(p))),
            outcome: String(v.outcome ?? ""),
            validity: String(v.validity?.verdict ?? "INVALID"),
            reasons: (v.reasons ?? []).map(String),
            knownFail,
            leakedCanceledOrders: leaked,
            githubRunId,
          },
        });
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}
```

```ts
// src/dashboard/collect.ts
import { walkVerdicts, type VerdictInput } from "./verdicts.ts";
import { readKneeCurves, type KneeCurve } from "./knee/read-curves.ts";
import { readSoakTrends, type SoakTrend } from "./soak/read-trends.ts";
import { readAaSeries, type AaSeries } from "./gate/read-aa.ts";
import { readAbGate, type AbGate } from "./gate/read-ab.ts";
import { readRaceTallies, raceVerdictInputs, type RaceTally } from "./races/read-tallies.ts";

export interface CollectedEvidence {
  verdicts: VerdictInput[];
  kneeCurves: KneeCurve[];
  soakTrends: SoakTrend[];
  aa: AaSeries[];
  ab: AbGate[];
  races: RaceTally[];
}

/** Walks one unzipped evidence dir. Stubs return empty arrays until their PR fills them. */
export function collectFromArtefactDir(dir: string, githubRunId: string): CollectedEvidence {
  const races = readRaceTallies(dir, githubRunId);
  return {
    // Race histograms have no verdict.json (V6). PR-D stub raceVerdictInputs returns [].
    // PR-H fills it so computeCard sees promo/cancel/invariants cases.
    verdicts: [
      ...walkVerdicts(dir, githubRunId).map((w) => w.verdict),
      ...raceVerdictInputs(races),
    ],
    kneeCurves: readKneeCurves(dir, githubRunId),
    soakTrends: readSoakTrends(dir, githubRunId),
    aa: readAaSeries(dir, githubRunId),
    ab: readAbGate(dir, githubRunId),
    races,
  };
}
```

`site-model.ts` keeps exporting `VerdictInput` in PR-D by re-exporting from `verdicts.ts` so existing tests compile. Extra fields are optional, so `tests/unit/dashboard-cards.test.ts` still typechecks.

`build-site.ts` `main` (PR-D): replace the local `walkVerdicts` with the import. One walk per artefact dir; still copy `chart-main.html`. Concatenate collected arrays onto `PageContext`.

```ts
// scripts/dashboard/build-site.ts  (changed lines of main only)
import { collectFromArtefactDir } from "../../src/dashboard/collect.ts";
import { walkVerdicts } from "../../src/dashboard/verdicts.ts";

// inside the sources loop, instead of the local walkVerdicts:
const collected = collectFromArtefactDir(dir, githubRunId);
verdicts.push(...collected.verdicts);
kneeCurves.push(...collected.kneeCurves);
soakTrends.push(...collected.soakTrends);
aa.push(...collected.aa);
ab.push(...collected.ab);
races.push(...collected.races);
for (const { dir: runDir, verdict } of walkVerdicts(dir, githubRunId)) {
  runs.set(verdict.runId, githubRunId);
  const chart = path.join(runDir, "chart-main.html");
  if (existsSync(chart)) {
    const href = path.posix.join("runs", verdict.caseId, verdict.runId, "chart-main.html");
    chartCopies.push({ from: chart, to: href });
    charts.set(verdict.runId, href);
  }
}
```

The second `walkVerdicts` is the same walk as collect (cheap). Do not drop the chart copy: v1 links `chart-main.html` (`build-site.ts:115–120`).

### 6.3 SVG primitives (PR-D) — `src/dashboard/render/charts.ts`

Geometry constants (all charts):

```ts
export const VIEW = { width: 720, height: 280, left: 56, right: 16, top: 24, bottom: 40 } as const;
```

```ts
import { escapeLabel } from "../site-model.ts";

/** Purpose: one SVG document with title, desc, role="img", aria-labelledby. No external CSS. */
export function svgDoc(opts: {
  id: string;
  title: string;
  desc: string;
  width?: number;
  height?: number;
  body: string;
}): string {
  const w = opts.width ?? VIEW.width;
  const h = opts.height ?? VIEW.height;
  const titleId = `${opts.id}-title`;
  const descId = `${opts.id}-desc`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">${escapeLabel(opts.title)}</title><desc id="${descId}">${escapeLabel(opts.desc)}</desc>${opts.body}</svg>`;
}

/** Purpose: x/y linear scale. Domain must be finite. Throws TEST BUG on a zero-width domain. */
export function scaleLinear(
  domain: [number, number],
  range: [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1)
    throw new Error("TEST BUG: scale domain must be finite and non-zero");
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** Purpose: polyline `d` attribute from already-scaled points. */
export function polylinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  const [h, ...t] = points;
  return (
    `M${h.x.toFixed(1)},${h.y.toFixed(1)}` +
    t.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("")
  );
}

/** Purpose: vertical band (knee range, A/B tolerance). */
export function bandRect(x0: number, x1: number, y0: number, y1: number, extra = ""): string {
  const x = Math.min(x0, x1);
  const w = Math.max(1, Math.abs(x1 - x0));
  return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="var(--bar-fill)" fill-opacity="0.5" ${extra}/>`;
}

/** Purpose: x and y axis lines + tick labels. Ticks are numbers, formatted with the mono font. */
export function axis(opts: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ticks: Array<{ v: number; x: number; y: number; label: string; axis: "x" | "y" }>;
}): string {
  const xLine = `<line x1="${opts.x0}" y1="${opts.y1}" x2="${opts.x1}" y2="${opts.y1}" stroke="currentColor" stroke-opacity="0.4"/>`;
  const yLine = `<line x1="${opts.x0}" y1="${opts.y0}" x2="${opts.x0}" y2="${opts.y1}" stroke="currentColor" stroke-opacity="0.4"/>`;
  const ticks = opts.ticks
    .map((t) => {
      const anchor = t.axis === "y" ? "end" : "middle";
      const dx = t.axis === "y" ? " dx='-4'" : "";
      const dy = t.axis === "x" ? " dy='12'" : " dy='4'";
      return `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" font-size="11" font-family="var(--mono, monospace)" text-anchor="${anchor}" fill="currentColor"${dx}${dy}>${escapeLabel(t.label)}</text>`;
    })
    .join("");
  return xLine + yLine + ticks;
}

export type MarkShape = "circle" | "square" | "triangle" | "hollow-circle";

/** Purpose: one mark. Colour is never the only signal: shape + optional dash must differ. */
export function mark(shape: MarkShape, x: number, y: number, label?: string): string {
  const core =
    shape === "square"
      ? `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="currentColor"/>`
      : shape === "triangle"
        ? `<polygon points="${x.toFixed(1)},${(y - 5).toFixed(1)} ${(x + 5).toFixed(1)},${(y + 4).toFixed(1)} ${(x - 5).toFixed(1)},${(y + 4).toFixed(1)}" fill="currentColor"/>`
        : shape === "hollow-circle"
          ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="none" stroke="currentColor"/>`
          : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="currentColor"/>`;
  return label ? core + svgText(x + 8, y + 4, label) : core;
}

/** Purpose: dashed stroke for a series index (0 solid, 1 dash, 2 dash-dot, 3 long-dash). */
export function dashFor(index: number): string {
  return ["none", "6 4", "2 3 6 3", "12 4"][index % 4] ?? "none";
}

/** Purpose: a text label, escaped. */
export function svgText(x: number, y: number, text: string, extra = ""): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" fill="currentColor" ${extra}>${escapeLabel(text)}</text>`;
}
```

Stubs for Wave 2 (PR-D bodies `return []` / `return ""`):

```ts
// src/dashboard/knee/read-curves.ts
export interface KneeCurve {
  /* filled in PR-E */
}
export function readKneeCurves(_dir: string, _githubRunId: string): KneeCurve[] {
  return [];
}

// src/dashboard/soak/read-trends.ts
export interface SoakTrend {
  /* PR-F */
}
export function readSoakTrends(_dir: string, _githubRunId: string): SoakTrend[] {
  return [];
}

// src/dashboard/gate/read-aa.ts
export interface AaSeries {
  /* PR-G */
}
export function readAaSeries(_dir: string, _githubRunId: string): AaSeries[] {
  return [];
}

// src/dashboard/gate/read-ab.ts
export interface AbGate {
  /* PR-G */
}
export function readAbGate(_dir: string, _githubRunId: string): AbGate[] {
  return [];
}

// src/dashboard/races/read-tallies.ts
import type { VerdictInput } from "../verdicts.ts";
export interface RaceTally {
  /* PR-H */
}
export function readRaceTallies(_dir: string, _githubRunId: string): RaceTally[] {
  return [];
}
export function raceVerdictInputs(_tallies: RaceTally[]): VerdictInput[] {
  return [];
}

// render/*-chart.ts each:
export function renderKneeCurves(_rows: KneeCurve[]): string {
  return "";
}
export function renderSoakTrends(_rows: SoakTrend[]): string {
  return "";
}
export function renderAaChart(_rows: AaSeries[]): string {
  return "";
}
export function renderAbChart(_rows: AbGate[]): string {
  return "";
}
export function renderRaceChart(_rows: RaceTally[]): string {
  return "";
}
```

`page.ts` (PR-D, the only Wave-1 edit of this file). Extend `PageContext` (optional so existing tests compile):

```ts
import type { KneeCurve } from "../knee/read-curves.ts";
import type { SoakTrend } from "../soak/read-trends.ts";
import type { AaSeries } from "../gate/read-aa.ts";
import type { AbGate } from "../gate/read-ab.ts";
import type { RaceTally } from "../races/read-tallies.ts";

export interface PageContext {
  sha: string;
  builtAt: string;
  knee?: { release: string; products: KneeProduct[] };
  soak?: { release: string; calibrated: number; products: number };
  observations: Array<{ id: string; title: string; file: string }>;
  kneeCurves?: KneeCurve[];
  soakTrends?: SoakTrend[];
  aa?: AaSeries[];
  ab?: AbGate[];
  races?: RaceTally[];
}
```

In `renderSite`, pick the body by card id (keep today's `kneeBody` bar; v2 curves sit beside it):

```ts
function chartBody(id: string, ctx: PageContext): string {
  if (id === "knee") return kneeBody(ctx) + renderKneeCurves(ctx.kneeCurves ?? []);
  if (id === "soak") return renderSoakTrends(ctx.soakTrends ?? []);
  if (id === "aa-noise") return renderAaChart(ctx.aa ?? []);
  if (id === "ab-gate") return renderAbChart(ctx.ab ?? []);
  if (
    id === "promo" ||
    id === "cancel" ||
    id === "invariants" ||
    id === "two-instance" ||
    id === "twenty"
  )
    return renderRaceChart((ctx.races ?? []).filter((r) => /* card's caseIds */ true));
  return "";
}
```

Filter races by `CARD_SPECS.find(s => s.id === id).caseIds` (do not dump every race onto every race card). Each renderer returns `""` until its PR.

PR-D tests (`tests/unit/dashboard-charts.test.ts`):

1. `svgDoc wraps title, desc, role=img and aria-labelledby`
2. `polylinePath joins scaled points in order`
3. `bandRect shades x0 to x1`
4. `mark hollow-circle is distinct from circle (warm-up vs counted)`
5. `dashFor(0) is solid and dashFor(1) contains a dash array`
6. `axis tick labels are escaped`
7. `svgDoc escapes title and desc so markup cannot break out`
8. `an empty polylinePath is an empty string, not a plot`

PR-D tests (`tests/unit/dashboard-collect.test.ts`):

9. `collectFromArtefactDir on an empty dir returns empty arrays for every stub`

### 6.4 Knee curves (PR-E) — V1

```ts
// src/dashboard/knee/read-curves.ts
export interface KneeStep {
  index: number;
  rate: number;
  p95Ms: number;
  errors: number;
  errorRate: number;
  requests: number;
  reached: boolean;
  plannedIterations: number;
  startedIterations: number;
}
export interface KneeCurve {
  githubRunId: string;
  caseId: string;
  runId: string;
  product: string;
  verdict: "KNEE" | "INVALID" | string;
  range: { lowerStep: number; upperStep: number; lowerRate: number; upperRate: number };
  stop: { step: number; rate: number; reasons: string[] };
  firstSaturated: { resource: string; step: number } | null;
  limitation: string | null;
  steps: KneeStep[];
  invalid: Array<{ code: string; detail: string }>;
}

/**
 * Finds knee-report-main.json under dir. Does not plot; the renderer skips verdict !== "KNEE".
 * Product is the caseId map: P6-CAL-LOAD-005 cal, P6-MED-LOAD-004 medusa, P6-DOC-LOAD-005 documenso
 * (site-model.ts KNEE_CASE_IDS).
 */
export function readKneeCurves(dir: string, githubRunId: string): KneeCurve[] {
  // walk files named knee-report-main.json
  // JSON.parse; keep only the fields above; ignore unknown keys including _source
}
```

```ts
// src/dashboard/render/knee-chart.ts
/** One figure per product. VALID runs only. INVALID listed in a <table> under the SVG. */
export function renderKneeCurves(rows: KneeCurve[]): string {
  // group by product
  // viewBox 0 0 720 280
  // x = steps[].rate (throughput), y = steps[].p95Ms
  // ticks: 5 x ticks at min..max rate, 5 y ticks at 0..max p95
  // bandRect from range.lowerRate to range.upperRate (use the committed union per product if several runs disagree: shade each run's own band at low opacity)
  // polyline per VALID run, dashFor(runIndex)
  // mark triangle at firstSaturated.step's (rate, p95) with svgText "<resource> at step <n>"
  // mark square at stop.step
  // beside the SVG: <table> columns run id, step, rate, p95Ms, saturated?
}
```

Fixture `tests/fixtures/dashboard/knee/cal-40234172872.json`:

```json
{
  "_source": {
    "release": "p6-phase4",
    "githubRunId": "40234172872",
    "file": "knee-cal/P6-CAL-LOAD-005/20261025T211249Z-930402a3/knee-report-main.json"
  },
  "schema": 1,
  "ruleId": "P6-RULE-006",
  "caseId": "P6-CAL-LOAD-005",
  "runId": "20261025T211249Z-930402a3",
  "verdict": "KNEE",
  "range": { "lowerStep": 5, "upperStep": 6, "lowerRate": 12, "upperRate": 14 },
  "stop": { "step": 6, "rate": 14, "reasons": ["p95"] },
  "firstSaturated": { "resource": "app_cpu", "step": 5 },
  "limitation": "the first saturated resource is taken from step 5, before the stop at step 6",
  "steps": []
}
```

Cut `steps` from the zip (9 rows, fields in §3.2 only). Second fixture `doc-invalid-40234172872.json` with `verdict: "INVALID"` and `runId: "20261025T211144Z-2d4c30cb"`.

Tests (`tests/unit/dashboard-knee-curves.test.ts`):

1. `Cal run 40234172872 has 9 steps, range 12 to 14, firstSaturated app_cpu at step 5`
2. `the limitation text is the file's limitation, not invented`
3. `the INVALID Documenso report 20261025T211144Z-2d4c30cb is listed and not in the polyline`
4. `the SVG contains the text app_cpu at step 5`
5. `the stop step is marked`
6. `every number names its github run id in the table`

### 6.5 Soak trends (PR-F) — V2

```ts
// src/dashboard/soak/downsample.ts
export interface Bucket {
  minute: number;
  n: number;
  rssMb: { min: number; mean: number; max: number };
  fds: { min: number; mean: number; max: number };
  dbTotal: { min: number; mean: number; max: number };
}

/** 1-minute buckets. intervalMs must be 1000 (TEST BUG if not). Slopes are NOT computed here. */
export function downsampleTelemetry(
  samples: Array<{
    t: number;
    proc?: { rssMb?: number; fds?: number };
    db?: { total?: number };
  }>,
  startedAtMs: number,
  intervalMs: number,
): Bucket[] {
  if (intervalMs !== 1000) throw new Error("TEST BUG: telemetry intervalMs is not 1000");
  // bucket index = Math.floor((sample.t - startedAtMs) / 60_000)
  // skip samples missing the field; empty buckets omitted
}
```

Source for the rule: the probed `intervalMs` is 1000; Grafana and Prometheus downsample with min/mean/max over a fixed step. LTTB is set aside (more code, same slopes still come from `soak.json`).

```ts
// src/dashboard/soak/read-trends.ts
export interface SoakTrend {
  githubRunId: string;
  caseId: string;
  runId: string;
  product: string;
  durationSec: number;
  verdict: string; // "NO THRESHOLD YET" until soak-bounds.json has the product
  rssTheilSenPerMin: number;
  plateauRatio: number;
  buckets: Bucket[];
}

export function readSoakTrends(dir: string, githubRunId: string): SoakTrend[] {
  // find soak.json next to telemetry-main.json
  // verdict and slopes from soak.json
  // if soak-bounds.json products[product] exists, that is the only time the printed verdict may change
  // never refit slope on buckets
}
```

Renderer: viewBox 0 0 720 320; x = minute; three polylines (rssMb mean solid, fds dashed, db.total dash-dot) with min/max as thin lines or not plotted (mean is enough if min/max would clutter; print min/max in the table). Text in the corner: `theilSen <n> MB/min, plateau ratio <r>, NO THRESHOLD YET`. Table columns: minute, rss mean, fds mean, db.total mean.

Fixtures: `tests/fixtures/dashboard/soak/med-120-40455577906-soak.json` (statistics only) and `tests/fixtures/dashboard/soak/med-120-40455577906-telemetry-head.json` (`_source` plus `intervalMs`, `startedAtMs`, and **the first 180 samples** — enough to test one 3-minute downsample; a second fixture with 7201 is too large). The 180-sample cut is taken from the real file's first 180 entries, fields `t, proc.rssMb, proc.fds, db.total` only.

Tests:

1. `med-120 rss theilSenPerMin is 0.1478 from soak.json, not from the buckets`
2. `plateau ratio is 1.0107 from soak.json`
3. `verdict text is NO THRESHOLD YET while soak-bounds products is empty`
4. `downsample of 180 samples at 1000 ms yields 3 buckets`
5. `a missing soak.json yields pending: no soak.json in this artefact`
6. `the chart does not contain a numeric RSS bound`

### 6.6 Findings file (PR-C) — V4, Q-2

`docs/findings.schema.json`: JSON Schema 2020-12. Required per row: `id, aliases, product, label, severity, upstream, tests, evidence, provenance`.

`docs/findings.json`: `{ "schema": 1, "rows": [ ... ] }`.

Rows (24). Severity copied as written. Upstream text exactly:

| id              | aliases                               | product   | label                             | severity                                     | upstream                                                                           |
| --------------- | ------------------------------------- | --------- | --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| P6-OBS-CAL-001  | []                                    | cal       | PRODUCT BUG                       | low                                          | filed: calcom/cal.diy#30375                                                        |
| P6-OBS-CAL-002  | []                                    | cal       | PRODUCT BUG                       | high                                         | filed: calcom/cal.diy#30374                                                        |
| P6-OBS-CAL-003  | []                                    | cal       | PRODUCT BUG                       | low                                          | filed: calcom/cal.diy#30376                                                        |
| P6-OBS-DOC-001  | []                                    | documenso | PRODUCT BUG                       | low                                          | not filed (draft: Task 9 plan Appendix E)                                          |
| P6-OBS-DOC-002  | []                                    | documenso | PRODUCT BUG                       | medium                                       | filed: documenso/documenso#3187 (existing report, our repro is the linked comment) |
| P6-OBS-DOC-005  | []                                    | documenso | PRODUCT BUG                       | medium                                       | not filed (draft below)                                                            |
| P6-MED-RACE-011 | ["F-M1"]                              | medusa    | suspected (D40)                   | suspected (D40)                              | not filed                                                                          |
| P6-MED-RACE-008 | ["X04"]                               | medusa    | PRODUCT BUG                       | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B1)                                         |
| P6-MED-RACE-009 | ["X05"]                               | medusa    | PRODUCT BUG                       | high (proposed)                              | not filed (draft: Task 9 plan Appendix B2)                                         |
| F-M3            | ["P6-MED-RACE-008","P6-MED-RACE-009"] | medusa    | PRODUCT BUG                       | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B1)                                         |
| F-M2            | ["P6-MED-RACE-012","P6-MED-RACE-005"] | medusa    | PRODUCT BUG                       | medium (proposed)                            | not filed (draft: Task 9 plan Appendix B3)                                         |
| F-M4            | ["P6-MED-RACE-014"]                   | medusa    | PRODUCT BUG                       | PRODUCT BUG, medium (owner label 2026-10-23) | not filed (draft: Task 9 plan Appendix B1)                                         |
| P6-CAL-RACE-006 | ["F-C1"]                              | cal       | PRODUCT BUG (owner label, O6)     | PRODUCT BUG (owner label, O6)                | existing issue; our comment not posted (calcom/cal.diy#29815)                      |
| P6-CAL-RACE-008 | ["F-C1"]                              | cal       | PRODUCT BUG (owner label, O6)     | PRODUCT BUG (owner label, O6)                | existing issue; our comment not posted (calcom/cal.diy#29815)                      |
| P6-CAL-RACE-007 | ["F-C2"]                              | cal       | PRODUCT BUG (owner label, O6)     | PRODUCT BUG (owner label, O6)                | not filed (draft: Task 9 plan Appendix C2)                                         |
| P6-CAL-RACE-009 | ["F-C3"]                              | cal       | PRODUCT BUG (owner label, O6)     | PRODUCT BUG (owner label, O6)                | not filed (draft: Task 9 plan Appendix C3)                                         |
| P6-OBS-TW-001   | []                                    | twenty    | PRODUCT BUG (owner label)         | PRODUCT BUG (owner label)                    | not filed publicly: private security report                                        |
| P6-TW-RACE-004  | []                                    | twenty    | PRODUCT BUG (owner label)         | PRODUCT BUG (owner label)                    | not filed publicly: private security report                                        |
| P6-OBS-MED-001  | []                                    | medusa    | PRODUCT BUG, suspected root cause | product                                      | not filed                                                                          |
| P6-OBS-MED-002  | []                                    | medusa    | PRODUCT BUG (SUSPECTED)           | PRODUCT BUG (SUSPECTED)                      | not filed                                                                          |
| P6-OBS-CAL-005  | []                                    | cal       | PRODUCT BUG (SUSPECTED)           | PRODUCT BUG (SUSPECTED)                      | not filed                                                                          |
| P6-OBS-DOC-007  | []                                    | documenso | PRODUCT BUG (SUSPECTED)           | PRODUCT BUG (SUSPECTED)                      | not filed                                                                          |
| P6-OBS-DOC-003  | []                                    | documenso | finding                           | low                                          | not filed (Task 9 plan Appendix F private draft)                                   |
| P6-OBS-DOC-006  | []                                    | documenso | suspected                         | suspected                                    | not filed                                                                          |

Do **not** add P6-OBS-CAL-004 or P6-OBS-DOC-004.

Fill the other required fields (not in the table above, to keep it readable):

- `tests`: copy the README **Test** column as a string array (one entry). Observation-only rows use the observation file as the single entry, e.g. `["docs/observations/2026-10-27-med-cancel-keeps-reservations.md"]`.
- `evidence`: `{ "release": "p6-phase4" or "p6-phase1" matching the README Evidence cell, "runIds": ["...numeric ids only..."], "files": ["path/inside/the/zip/or/docs/..."] }`. Rendered as `<repo>/actions/runs/<id>` (the same relative form `docs/releases/p6-phase4.md` already uses). Never a new URL that contains the owner's account name.
- `provenance`: the string `docs/findings.json` on every row. The renderer appends `, commit <sha>` from `PageContext.sha` (D2). Do not store a commit SHA in the JSON (it would drift on every merge).

```ts
// src/dashboard/findings.ts
import { readFileSync } from "node:fs";

export interface FindingRow {
  id: string;
  aliases: string[];
  product: string;
  label: string;
  severity: string;
  upstream: string;
  tests: string[];
  evidence: { release: string; runIds: string[]; files: string[] };
  provenance: string; // always "docs/findings.json"; commit sha is appended at render
}
export interface FindingsFile {
  schema: 1;
  rows: FindingRow[];
}

/** Purpose: load and validate the committed findings file. Throws TEST BUG on schema miss. */
export function loadFindings(file: string): FindingsFile {
  const j = JSON.parse(readFileSync(file, "utf8")) as FindingsFile;
  if (j.schema !== 1 || !Array.isArray(j.rows))
    throw new Error("TEST BUG: findings.json schema is not 1 or rows is missing");
  for (const row of j.rows) {
    for (const key of [
      "id",
      "aliases",
      "product",
      "label",
      "severity",
      "upstream",
      "tests",
      "evidence",
      "provenance",
    ] as const) {
      if (row[key] === undefined) throw new Error(`TEST BUG: findings row missing ${key}`);
    }
    if (row.provenance !== "docs/findings.json")
      throw new Error("TEST BUG: findings row provenance must be docs/findings.json");
  }
  return j;
}
```

Tests (`tests/unit/findings-schema.test.ts`):

1. `findings.json matches docs/findings.schema.json` (implement a tiny required-keys checker; do not add ajv)
2. `every README Known product bugs ID exists in findings.json`
3. `every findings.json id is unique`
4. `the six observation ids missing from the README are present`
5. `P6-OBS-CAL-004 and P6-OBS-DOC-004 are absent`
6. `CAL-RACE-006 upstream text is existing issue; our comment not posted`
7. `OBS-TW-001 and TW-RACE-004 upstream text is not filed publicly: private security report`
8. `severity strings are copied as written (medium (proposed) is not upgraded)`

Plus `tests/unit/dashboard-fixtures-scan.test.ts`:

9. `node scripts/evidence-token-scan.mjs tests/fixtures/dashboard` exits 0 (and `docs/findings.json`)

Parse the README table the way `readme-rules.test.ts` walks lines starting with `|`. The ID cell looks like `` `P6-MED-RACE-011` (F-M1) `` or `F-M3 (\`-008\`, \`-009\`)`: take the first `` P6-… `` token when present, otherwise the `F-M*`/`F-C*`token. Compare those ids to`findings.json` `id`values (aliases live in`aliases`, not as a second id). Drift risk: a new README row without a JSON row fails this test. That is the point (Q-2). Industry source: JSON Schema (json-schema.org, 2020-12) as the machine-readable contract; the README stays the human view (Write the Docs / docs-as-code). Flag: two sources can drift; the unit test is the guard, not a human checklist.

### 6.7 A/A and A/B (PR-G) — V5, Q-3

```ts
// src/dashboard/gate/read-aa.ts
export interface AaArmPoint {
  githubRunId: string;
  runId: string;
  startedAt: string;
  utcDay: string;
  p95Ms: number;
  warmup: boolean;
}
export interface AaSeries {
  product: "cal" | "medusa";
  caseId: string;
  points: AaArmPoint[];
  spread: number;
  tolerance: number; // from k6/thresholds/tolerance.json, metric p95Ms
}

/**
 * Arms = folders with run-meta.json + k6-main-summary.json under aa-cal or aa-medusa.
 * Warm-up = earliest startedAt per githubRunId per product (write-tolerance.ts:77-93, gate.yml warm-up steps).
 * p95Ms = summary.metrics.http_req_duration["p(95)"].
 * Spread is not recomputed for the tile: the tile prints tolerance.json.
 * The chart may recompute spread with spreadOf() as a check; if it differs from the file, print both and mark TEST BUG in the page? No: print the file, assert equality in the unit test.
 */
export function readAaSeries(dir: string, githubRunId: string): AaSeries[] {
  // walk aa-cal/** and aa-medusa/** for run-meta.json sitting next to k6-main-summary.json
  // p95Ms = summary.metrics.http_req_duration["p(95)"] (baseline-band.ts:68-79)
  // startedAt from run-meta.json (ISO string); skip a dir that has no startedAt (pending: no startedAt)
  // group by product (path prefix aa-cal → cal, aa-medusa → medusa)
  // warmup = the unique earliest startedAt per githubRunId per product
  // spread and tolerance: read k6/thresholds/tolerance.json; do not call spreadOf for the tile
  // return [] when neither aa-cal nor aa-medusa exists
}
```

```ts
// src/dashboard/gate/read-ab.ts
export interface AbGate {
  product: string;
  caseId: string;
  source: "gate-verdict-cal.json" | "gate-verdict-medusa.json" | "unlabelled-arms";
  pendingReason?: string;
  a?: number[];
  b?: number[];
  ratios?: number[];
  verdict?: string;
  rule?: string;
  toleranceRel?: number;
}

export function readAbGate(dir: string, githubRunId: string): AbGate[] {
  // if gate-verdict-cal.json present: source that file (fields a, b, ratios, verdict, rule, tolerance.tolerance)
  // if gate-verdict-medusa.json present: same
  // else if ab-medusa/load-medusa/P6-MED-LOAD-002 has run dirs: source "unlabelled-arms", pendingReason
  //   "verdict file not in release; arm labels not in the artefact path"
  //   list the six p95 values in startedAt order WITHOUT a/b letters in the SVG
  // selftest.json → a separate AbGate product "selftest"
}
```

A/A SVG: x = utc day (two groups 2026-10-27, 2026-10-28); y = p95Ms; solid circle = counted, hollow-circle = warm-up with text `warm-up, not counted`; dashed median line of counted points; caption `spread <s>, tolerance <t> from k6/thresholds/tolerance.json, runs 40497029348 40605925118`.

A/B SVG: x = B arm index 1..3; y = ratio; band from `1 - T` to `1 + T` with caption `only the upper limit 1 + T is the fail rule` (the `rule` string). Cal from the verdict file. Medusa: no labelled dots until `source === "gate-verdict-medusa.json"`. Selftest slowed case as a second small SVG titled `gate self-test (slowed): FAIL (REGRESSION)`.

Tests (`tests/unit/dashboard-aa-ab.test.ts`), fixtures cut from the zips (`_source` + `startedAt` + `p95` only, no environment secrets):

1. `dropping the earliest startedAt per run per product reproduces Cal p95 77.362, 77.522, 76.212, 60.055, 59.506, 58.341`
2. `Cal spread 0.28151 and tolerance 0.56302 match tolerance.json`
3. `Medusa spread 0.039747 and tolerance 0.1 (FLOOR)`
4. `warm-up arms are hollow and labelled warm-up, not counted`
5. `Cal A/B ratios 0.99807, 0.98549, 1.02465 and verdict PASS from gate-verdict-cal.json`
6. `the rule text says every B arm's ratio is above 1 + toleranceRel`
7. `Medusa A/B without a verdict file is pending: verdict file not in release`
8. `selftest slowed verdict is FAIL (REGRESSION)`
9. `an inferred start-order label never appears as a released a-1 / b-1 in the SVG`

### 6.8 Races and cards (PR-H) — V6, V7, V8, Q-4, Q-5

```ts
// src/dashboard/races/read-tallies.ts
export interface RaceTally {
  githubRunId: string;
  caseId: string;
  title: string;
  product: string;
  verdict: "pass" | "fail" | string;
  attempts: number;
  attemptsWithViolation: number;
  attemptsWithSuspectedBug: number;
  invalidAttempts: number;
  invariantViolationsTop: number;
}

export function readRaceTallies(dir: string, githubRunId: string): RaceTally[] {
  // files matching /P6-[A-Z]+-RACE-\d+\.json$/
  // attemptsWithViolation = attempts where invariantViolations.length > 0
  // attemptsWithSuspectedBug = attempts where oracle.suspectedBug is a non-empty string
  // do not map verdict
}

export function raceVerdictInputs(tallies: RaceTally[]): VerdictInput[] {
  // After PR-T, runTwentyTrials assigns verdict like Cal. p6-phase4 TW histograms still have
  // the default fail (0 violations). Do not map that pair to FAIL.
  // outcome = histogram.verdict === "fail" && attemptsWithViolation > 0 ? "FAIL"
  //         : histogram.verdict === "fail" && attemptsWithViolation === 0 && product === "twenty"
  //             ? skip this tally (no VerdictInput; the Twenty card stays PENDING)
  //         : "PASS"
  // suspectedBugCount = attemptsWithSuspectedBug
  // validity = "VALID" unless the file is unreadable
}
```

`cards.ts` changes (exact):

```ts
{
  id: "promo",
  title: "Medusa promo ledger (P6-MED-RACE-005, P6-MED-RACE-012)",
  proves: "It proves that a promotion's budget and its ledger balances hold when carts race for the same promotion: no overspend and no double redemption.",
  caseIds: ["P6-MED-RACE-005", "P6-MED-RACE-012"],
  pendingReason: "no VALID promo ledger run in a release yet",
},
{
  id: "cancel",
  title: "Medusa cancel races (P6-MED-RACE-008, P6-MED-RACE-009)",
  proves: "It proves that a cancel racing a fulfilment or a second cancel leaves one terminal state and releases every reservation. The known failure is the reservation leak below.",
  caseIds: ["P6-MED-RACE-008", "P6-MED-RACE-009"],
  knownFail: { caseIds: ["P6-MED-RACE-009"], obs: "P6-OBS-MED-002" },
  pendingReason: "no VALID cancel race run in a release yet",
},
{
  id: "aa-noise",
  caseIds: ["P6-CAL-LOAD-003", "P6-MED-LOAD-002"],
  pendingReason: "no VALID A/A arm in a published release yet",
  // title/proves unchanged
},
{
  id: "ab-gate",
  caseIds: ["P6-CAL-LOAD-003"], // Cal only until a released Medusa verdict exists (Q-3). Do not add P6-MED-LOAD-002: those dirs are unlabelled.
  pendingReason: "no VALID A/B gate verdict in a published release yet",
},
{
  id: "twenty",
  title: "Twenty races (P6-TW-RACE-001–006)",
  proves: "It proves the Twenty race histograms carry an assigned pass or fail, not the createHistogram default.",
  caseIds: ["P6-TW-RACE-001", "P6-TW-RACE-002", "P6-TW-RACE-003", "P6-TW-RACE-004", "P6-TW-RACE-005", "P6-TW-RACE-006"],
  knownFail: { caseIds: ["P6-TW-RACE-004"], obs: "P6-OBS-TW-001" }, // only after a post-PR-T release assigns fail for real
  pendingReason: "p6-phase4 histograms still have the default fail; waiting for a release after PR-T",
},
```

Also add `knownFail` on the Cal/Documenso invariants card:

```ts
knownFail: {
  caseIds: ["P6-CAL-RACE-003", "P6-DOC-RACE-001"],
  obs: "P6-OBS-CAL-002", // the pill shows one obs; the table lists both. Prefer a joined label in the pill: "P6-OBS-CAL-002 / P6-OBS-DOC-002" by extending knownFail.obs to a string that may contain two ids.
},
```

Use `obs: "P6-OBS-CAL-002 / P6-OBS-DOC-002"` (one string). Do not invent a new severity.

`computeCard` new known-fail rule (replace line 131):

```ts
function isKnownFail(v: VerdictInput, spec: CardSpec): boolean {
  const kf = spec.knownFail;
  if (!kf || !kf.caseIds.includes(v.caseId)) return false;
  if (v.outcome === "FAIL") return true;
  if (v.knownFail && kf.obs.split(" / ").includes(v.knownFail)) return true;
  // Cancel -009 histograms are verdict "pass" with suspectedBug set (Q-4). That is KNOWN FAIL
  // only because spec.knownFail.caseIds lists them. Never use this branch to map a case to FAIL.
  if ((v.suspectedBugCount ?? 0) > 0 && v.outcome === "PASS") return true;
  return false;
}
```

Q-4 evidence: `src/medusa/run-order-case.ts:76-77` "they never change the verdict (D54)" and `:265-266` "suspected lines never reach invariantViolations". Promo (`-005`/`-012`) has **no** `spec.knownFail`, so the card stays **PASS with a suspected-bug count on the chart**. Cancel `-009` and load `-009` are **KNOWN FAIL** because `spec.knownFail` matches. Never map `pass` + `suspectedBug` to **FAIL**.

Q-5: PR-T (Wave 1) is the fix. Evidence: `src/races/histogram.ts:53` default `"fail"`; `src/twenty/run-case.ts:95-140` `runTwentyTrials` never assigns `verdict`; `docs/BACKLOG.md:108-111`. Leave the default (unfinished histograms stay fail; `tests/unit/histogram.test.ts` keeps `assert.equal(typed.verdict, "fail")`). Assign in `runTwentyTrials` the same way Cal does (`src/cal/run-case.ts:267-268`) **before** `writeHistogram`. p6-phase4 zips still carry the default, so the Twenty card is **PENDING** until a post-PR-T release. Findings table still lists `P6-TW-RACE-004`.

Race SVG: grouped bars per run, two marks (solid bar = attempts, hollow bar = attempts with violation or suspectedBug), text labels of the two numbers. viewBox 0 0 720 200. Table: run, attempts, with violation, with suspectedBug, histogram verdict.

Tests (`tests/unit/dashboard-races.test.ts` + updates to `dashboard-cards.test.ts`):

1. `CAL-RACE-001 tally 50/0, 51/0, 51/0, 50/0, 51/0 in run order`
2. `promo card caseIds are P6-MED-RACE-005 and P6-MED-RACE-012`
3. `cancel card caseIds include P6-MED-RACE-008 and P6-MED-RACE-009`
4. `KNOWN FAIL when knownFail is P6-OBS-MED-002 even if outcome is PASS` (LOAD-009 fixtures, leak 4/5/6)
5. `A/A card is no longer pending when VALID aa verdicts exist`
6. `Twenty card is PENDING on p6-phase4 histograms that still have the default fail`
7. `Medusa pass with suspectedBug stays PASS on the promo card and counts 4, 0, 6, 0, 1 for -005`
8. `the old test title a card with no case ids is always PENDING is replaced` (this is a test update, not a weakened assertion: the v1 test encoded the bug)
9. `MED-RACE-008 title two parallel cancels is not on the promo card`

Existing test `a card with no case ids is always PENDING: A/A and A/B have no committed tolerance yet` is **deleted and replaced**, not skipped. The replacement asserts the released arms make the A/A card PASS.

### 6.9 Findings table, CSP, size (PR-I) — V4, D3, D4, D6

`findingsSection` in `page.ts` reads `loadFindings("docs/findings.json")` at build (committed file). Columns: ID, aliases, product, label, severity, upstream, tests, evidence (release + run ids + file), provenance `source: docs/findings.json, commit <sha>` where `<sha>` is `ctx.sha`. Link run ids as `<repo>/actions/runs/<id>` and observation files as relative `docs/observations/<file>`. Do not add a new `github.com/<owner>/...` URL; `page.ts` already has `REPO` for v1 observation links — PR-I stops using `REPO` for the findings table (relative paths + the run-id form). The observation strip in the summary still lists heading-regex files until PR-I switches that count to `findings.json.length` or drops it; **switch the summary observation count to the findings row count** so the tile is 24, not 2.

Add CSP in `renderSite`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"
/>
```

`style.ts`: delete `transition: color 150ms` and `transition: background-color 150ms` (D4, no animations). Keep 8 px spacing, max-width 1100 px, system fonts, monospace numbers, `prefers-color-scheme`, `@media (max-width: 480px)` (covers 375 px). No gradients, glows, emoji, marketing copy.

Each chart already has a table from its renderer. PR-I test asserts every `<svg role="img">` is followed by a `<table>` in the same `<figure>` or the next sibling.

Size budget test:

```ts
// tests/unit/dashboard-size-budget.test.ts
// After building with the trimmed fixtures, wc -c site/index.html.
// PR-I step 0 records the measured byte count as MEASURED.
// MAX_SITE_BYTES = Math.max(MEASURED + 65536, 163840)  // 64 KiB headroom, never below 2× v1 80.6 KB
it("index.html is at most MAX_SITE_BYTES", () => {
  /* read the built file or a captured byte count committed as tests/fixtures/dashboard/size-budget.json */
});
```

Do not publish the VM timing as a performance number. The budget is a size cap.

### Size budget recorded 2026-10-29

The check rendered an empty model. With `tests/fixtures/dashboard/size-budget.json` absent, MEASURED was that render, so `bytes <= MEASURED + 65536` held for every page.

Recorded after the knee caption and the soak provenance text (2026-10-29 00:55 Asia/Colombo for the published page; the fixture render is from this branch):

- Published page: 393822 bytes. `curl` reported `size_download=393822` and `content-length: 393822`, and `wc -c` reported 393822. HTTP 200. Last-Modified `Wed, 28 Oct 2026 18:57:41 GMT` (00:27 Asia/Colombo on 29 Oct 2026).
- Fixture page: 69994 bytes. `renderSite` of `tests/fixtures/dashboard/{aa,ab,knee,races,soak}` plus six verdict rows, so the summary is the published card states `PASS 6, FAIL 0, KNOWN FAIL 3, PENDING 1, INVALID 0`. The fixtures are trimmed: one Cal knee report, one invalid Documenso report, a 180-sample soak head, and a subset of histograms. The published page is 393822 bytes because it includes every released run. The three LOAD-009 leak counts add 78 bytes to the evidence table (69916 before those cells, 69994 with them).
- On the fixture page the style is 3868 bytes, the findings block is 16739 bytes, the knee card is 7541 bytes, and the twelve charts sum to 23293 bytes. The smallest chart is 702 bytes. A typical chart is about 2.0–2.6 KB. Those section sizes were counted before the 78 leak-count bytes, which sit in the invariants-under-load table.
- Headroom: 4096 bytes, which is `4096 / 69994` = 5.85% of the fixture page. That covers a caption or a short table. A second knee card is 7541 bytes, past this headroom.
- Budget: 74090 bytes (`69994 + 4096`).

Raise the budget when a chart or a table that belongs on the page grows the fixture render by more than 4096 bytes, and record the new measured bytes in the same change. A failing check is a reason to look at the page, and the published 393822 bytes is a different file from this fixture render.

Screenshots (Q-7, dropped): no committed PNGs, no `screenshot.mts`, no Chromium install. Hand-made images drift from the live site. PR-J points the README at the GitHub Pages site of this repository (the README has no `github.io` URL today; write that phrase, do not add a new URL that contains the owner's account name). Contrast is the WCAG unit test, not a screenshot.

Contrast test (`tests/unit/dashboard-contrast.test.ts`): relative luminance of `--fg` on `--bg`, `--pass` on `--card`, `--fail` on `--card`, light and dark, each ≥ 4.5:1 (WCAG 2.2 1.4.3). Helper `contrastRatio(a, b)` in the test file.

PR-I tests:

1. `the findings table has 24 data rows`
2. `provenance line contains source: docs/findings.json, commit`
3. `every svg[role=img] has title, desc, and a table of the same numbers`
4. `index.html has a Content-Security-Policy meta with script-src 'none'`
5. `PAGE_CSS has no transition or animation`

### 6.10 pages.yml (PR-A) — V3, Q-1

Changed lines only. Do not quote any step that calls a GitHub client by writing a client name; cite the step by name.

`on:` becomes:

```yaml
on:
  workflow_run:
    workflows: ["evidence-release"]
    types: [completed]
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - README.md
      - docs/**
      - k6/thresholds/**
      - scripts/dashboard/**
      - src/dashboard/**
      - .github/workflows/pages.yml
```

The same `if:` goes on **both** `build` and the new `scan` job:

```yaml
if: >-
  (github.event_name == 'workflow_run' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.conclusion == 'success') ||
  (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||
  (github.event_name == 'push' && github.ref == 'refs/heads/main')
```

Delete env `EVIDENCE_RELEASE: "p6-phase4a"` (lines 21–24 keep `EVIDENCE_WORKFLOW_IDS` and the gitleaks pins; `scan` still reads those).

**Q-1 (c):** move token scan, gitleaks install, gitleaks, `configure-pages` and `upload-pages-artifact` out of `build` into a new job `scan` that `needs: build`. `build` uploads the `site/` tree as a regular artefact. `scan` downloads it, scans it, and only then uploads the Pages artefact. `deploy` changes `needs: build` to `needs: scan`. Never raise any job timeout.

`build` after (timeout **20** unchanged). Every remaining step gets `timeout-minutes`.

| Step                                                   | Measured on 40660111756 | Today        | After              |
| ------------------------------------------------------ | ----------------------- | ------------ | ------------------ |
| checkout                                               | 1 s                     | (none)       | 1                  |
| setup-node                                             | 3 s                     | (none)       | 1                  |
| Collect the run ids…                                   | 0 s                     | 1            | 1                  |
| Validate each evidence run…                            | 9 s                     | 3            | 1                  |
| List the p6 releases…                                  | 1 s                     | 3            | 1                  |
| Fetch the planned zips…                                | 22 s                    | 5            | 2                  |
| Build the site                                         | 1 s                     | 2            | 1                  |
| Upload the site artefact                               | (new)                   | —            | 1                  |
| Token scan / gitleaks / configure-pages / upload-pages | moved to `scan`         | 2+1+2+1+2    | —                  |
| **sum**                                                |                         | 22 + missing | **9**              |
| job timeout                                            |                         | 20           | **20** (unchanged) |
| margin                                                 |                         | −2           | **11**             |

New `build` step (after **Build the site**, before the job ends):

```yaml
- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: ${{ !cancelled() }}
  timeout-minutes: 1
  with:
    name: site
    path: site
    retention-days: 90
    if-no-files-found: error
```

Delete from `build`: **Token scan of the site**, **Install gitleaks (pinned version, pinned sha256)**, **gitleaks over the built site**, `configure-pages`, `upload-pages-artifact`.

New job `scan` (timeout **20**, new so R11/R12 apply in full). Pin `actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7.0.0` (not yet in this repo; pairs with the existing `upload-artifact` v7.0.2 pin). Checkout is required so `scripts/evidence-token-scan.mjs` and `.gitleaks.toml` are present.

```yaml
scan:
  name: scan the built site
  needs: build
  runs-on: ubuntu-latest
  timeout-minutes: 20
  if: >-
    (github.event_name == 'workflow_run' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.conclusion == 'success') ||
    (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||
    (github.event_name == 'push' && github.ref == 'refs/heads/main')
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      timeout-minutes: 1

    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
      timeout-minutes: 1
      with:
        node-version-file: .nvmrc

    - name: Download the built site
      timeout-minutes: 1
      uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7.0.0
      with:
        name: site
        path: site

    - name: Token scan of the site
      if: ${{ !cancelled() }}
      timeout-minutes: 1
      run: node scripts/evidence-token-scan.mjs site

    - name: Install gitleaks (pinned version, pinned sha256)
      if: ${{ !cancelled() }}
      timeout-minutes: 1
      run: |
        set -euo pipefail
        archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
        curl -sSfL -o "$RUNNER_TEMP/$archive" \
          "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/$archive"
        echo "${GITLEAKS_SHA256}  $RUNNER_TEMP/$archive" | sha256sum -c -
        tar -xzf "$RUNNER_TEMP/$archive" -C "$RUNNER_TEMP" gitleaks
        sudo install "$RUNNER_TEMP/gitleaks" /usr/local/bin/gitleaks

    - name: gitleaks over the built site
      if: ${{ !cancelled() }}
      timeout-minutes: 1
      run: gitleaks dir site --no-banner --redact --exit-code 1

    - name: Job summary
      if: ${{ !cancelled() }}
      timeout-minutes: 1
      run: echo "token scan and gitleaks over site/" >> "$GITHUB_STEP_SUMMARY"

    - uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0
      if: ${{ success() && !cancelled() }}
      timeout-minutes: 1

    - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
      if: ${{ success() && !cancelled() }}
      timeout-minutes: 1
      with:
        path: site
```

| `scan` step                  | Measured (same steps on 40660111756) | Cap    |
| ---------------------------- | ------------------------------------ | ------ |
| checkout                     | 1 s                                  | 1      |
| setup-node                   | 3 s                                  | 1      |
| Download the built site      | (new; zip of ~80 KB)                 | 1      |
| Token scan of the site       | 0 s                                  | 1      |
| Install gitleaks…            | 0 s                                  | 1      |
| gitleaks over the built site | 1 s                                  | 1      |
| Job summary                  | (new)                                | 1      |
| configure-pages              | 1 s                                  | 1      |
| upload-pages-artifact        | 1 s                                  | 1      |
| **sum**                      |                                      | **9**  |
| job timeout                  |                                      | **20** |
| margin                       |                                      | **11** |

No 80% stop: every `scan` step is seconds, well under 80% of a 1-minute cap. Fetch stays on `build` (existing job); do not add a new stop inside that script (X-PAGES-STOP). If a later release grows the zip set past 2 minutes, lower another `build` cap rather than raise 20.

`deploy`: `needs: scan`. Timeout **10** and deploy step **5** unchanged. A 10-minute job cannot have a 10-minute step-cap margin (one step × 1 minute minimum leaves 9). That gap is pre-existing. Do not raise 10 (H4). Record as X-PAGES-DEPLOY-MARGIN.

Industry source: GitHub Docs, Workflow syntax `timeout-minutes`, `needs`, `on.push.paths`, and "Deploying with GitHub Actions" (upload Pages artefact from the job that `deploy` needs).

### 6.11 gate.yml (PR-B) — V9

Job `ab-medusa` only. Do not raise `timeout-minutes: 75`. Do not add a step (the token-scan step already has `timeout-minutes: 2` and `if: ${{ !cancelled() }}`). After the existing flatten loop, copy the verdict and write the arm map **before** flattening so labels are read from directory names `a-1`..`b-3`.

Changed lines of step **Token scan of the A/B results** (keep lines 998–999 exactly):

```yaml
          node scripts/evidence-token-scan.mjs results/ab
          # The release scan (.gitleaks.toml) lets the publishable key through only in .../load-medusa/P6-MED-LOAD-nnn/<attempt>/k6-config.json:
          # each arm keeps its case and attempt folders, and the arm label (a-1, b-2 ...) stays out of the artefact path.
          mkdir -p stage/load-medusa/P6-MED-LOAD-002
          node --input-type=module -e '
            import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
            const arms = [];
            for (const arm of ["a-1","a-2","a-3","b-1","b-2","b-3"]) {
              const root = `results/ab/${arm}/P6-MED-LOAD-002`;
              if (!existsSync(root)) continue;
              for (const name of readdirSync(root)) {
                const p = `${root}/${name}`;
                if (statSync(p).isDirectory()) arms.push({ arm, runId: name });
              }
            }
            writeFileSync("stage/ab-medusa-arm-map.json", JSON.stringify({ product: "medusa", caseId: "P6-MED-LOAD-002", arms }, null, 2) + "\n");
          '
          for d in results/ab/*/P6-MED-LOAD-002/*; do
            [ -d "$d" ] && cp -a "$d" stage/load-medusa/P6-MED-LOAD-002/
          done
          if [ -f results/ab/gate-verdict-medusa.json ]; then
            cp -a results/ab/gate-verdict-medusa.json stage/gate-verdict-medusa.json
          fi
```

The inline module writes **field names and run-folder names only**. No publishable key, no path that contains `a-1` under `load-medusa`. Upload path `p6/stage/` already includes the new files.

The **next** released gate run after this PR then carries labels. Until that release exists, the site uses Q-3 (pending). Do not edit a published release (O3).

### 6.12 Twenty histogram verdict (PR-T) — Q-5

Wave 1, disjoint from A–D (`src/twenty/run-case.ts` + one unit test). Does not edit `src/races/histogram.ts`: the default `"fail"` at line 53 stays so an unfinished histogram is never a silent pass. `tests/unit/histogram.test.ts` keeps `assert.equal(typed.verdict, "fail")` (H3: do not weaken it).

```ts
// src/twenty/run-case.ts  (inside runTwentyTrials, after runner.applyTo and leakCheck, before the return)
const trialsOk = results.every((t) => t.ok);
histogram.verdict = trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
```

That is the same assignment as `src/cal/run-case.ts:267-268`. Put it in the `try` after `const results = await runTrials(...)` and `runner.applyTo(histogram)`, before the `return`. The existing `finally` still calls `writeHistogram`. If `attempt` throws before `results` is set, the default `fail` is correct.

Tests (`tests/unit/twenty-histogram-verdict.test.ts`):

1. `runTwentyTrials sets verdict pass when every trial is ok and invariantViolations is empty`
2. `runTwentyTrials sets verdict fail when a trial throws`

Fixture: a fake `attempt` that returns empty `requests` and `oracle: { companyRowsLeft: 0 }`. `concurrency: 1`. Stub leakCheck omitted. Change cwd to a temp dir so `writeHistogram` does not touch the repo. Expected: after PR-T, `# pass 1338`.

The next `twenty-races` job on `main` after this PR writes real verdicts. Do not edit a published release (O3). The dashboard Twenty card stays PENDING until that later zip is in a new evidence-release.

## 7. Oracles

| Surface            | PASS                                             | FAIL                                             | KNOWN FAIL                                                                                              | PENDING                       | INVALID                                   | NO THRESHOLD YET                                            |
| ------------------ | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Card (computeCard) | all VALID outcomes PASS and no knownFail         | a VALID FAIL that is not known                   | spec.knownFail matches outcome FAIL **or** `knownFail` field **or** suspectedBugCount>0 on a known case | no runs of the case ids       | runs exist, none VALID                    | not a card status                                           |
| Knee chart         | verdict `KNEE` plotted                           | —                                                | —                                                                                                       | no VALID knee report          | listed with `invalid[].code`, not plotted | —                                                           |
| Soak chart         | —                                                | —                                                | —                                                                                                       | no soak.json                  | —                                         | `soak.json.verdict` while `soak-bounds.json` has no product |
| A/A card           | VALID arms in aa-cal / aa-medusa                 | —                                                | —                                                                                                       | no arms                       | none VALID                                | —                                                           |
| A/B Cal            | `gate-verdict-cal.json.verdict === "PASS"`       | that file `FAIL`                                 | —                                                                                                       | file absent                   | —                                         | —                                                           |
| A/B Medusa         | only if `gate-verdict-medusa.json` is in the zip | that file                                        | —                                                                                                       | `verdict file not in release` | —                                         | —                                                           |
| Race tally         | histogram `pass`                                 | histogram `fail` **and** attemptsWithViolation>0 | cancel/invariants as spec.knownFail                                                                     | no histogram                  | —                                         | —                                                           |
| Twenty races       | assigned `pass` in a post-PR-T zip               | assigned `fail` with violations                  | TW-004 via spec.knownFail after that zip                                                                | p6-phase4 default fail        | —                                         | —                                                           |
| V8 LOAD-009        | outcome PASS is ignored for known-fail           | —                                                | `stages.reconcile.data.knownFail === "P6-OBS-MED-002"`                                                  | —                             | —                                         | —                                                           |

A missing source always renders the string `pending: <reason>`, never a guessed number.

## 8. Data isolation

- Build inputs: `$RUNNER_TEMP/evidence/<githubRunId>/` (unzipped, sha256-checked) and committed files `k6/thresholds/*.json`, `docs/findings.json`, `docs/observations/` (observations stay as documents; the table does not parse them), `docs/evidence/pending-release.json`.
- No network in `build-site.ts`. No fetch of issues at build time; upstream text is in `docs/findings.json`.
- Fixtures: trimmed to fields the code reads, plus `_source`. `scripts/evidence-token-scan.mjs tests/fixtures/dashboard` must exit 0.
- **Never copied to `site/`:** `k6-main.log`, `run-meta.json` (may carry environment detail), raw `telemetry-main.json` / `.csv`, `k6-config.json`, anything matching the token-scan patterns. Charts are derived SVG. `chart-main.html` may still be copied as today (linked, not inlined); the token scan covers `site/`.
- INVALID runs listed with their `invalid[].code` / `reasons`, never plotted.

## 9. CI budget

### 9.1 pages `build` (existing job)

See §6.10. Job timeout **20** unchanged. Step-cap sum **22 → 9** (scans moved out). Margin **11**. Measured total ~45 s on run 40660111756 (14:24–14:25 Asia/Colombo). Fetch cap 2 (measured 22 s).

### 9.2 pages `scan` (NEW job, PR-A)

Timeout **20**. Step-cap sum **9**. Margin **11**. `needs: build`. Downloads artefact `site`, token-scans, gitleaks, summary, then uploads the Pages artefact. `if:` same as `build`. Retention 90 on the `site` artefact from `build`.

### 9.3 pages `deploy`

`needs: scan`. Timeout **10**, deploy step **5** unchanged (measured 7 s). Pre-existing X-PAGES-DEPLOY-MARGIN: a 10-minute job cannot hold a 10-minute step-cap margin. Do not raise 10.

### 9.4 gate.yml job `ab-medusa` (existing job, PR-B)

Job timeout **75** unchanged. No new step, no raised cap. Token-scan step stays 2 minutes. Measured on released run 40636843578 (10:44–10:59 Asia/Colombo): six 120 s arms, verdict+scan+upload ~2 s. Latest main gate run 40662432850 skipped this job (docs-only push); do not use it for timings.

Do not edit any `perf.yml` job (H4). Do not raise the Cal 6-minute cap.

## 10. Expected output

`npm run check` after the last PR-I commit (format:check, lint:actions, typecheck, k6:inspect, then unit tests):

```text
> prettier --check .
All matched files use Prettier code style!
> actionlint
> tsc --noEmit && tsc --noEmit -p tsconfig.races.json
> node scripts/k6-inspect.mjs
# tests 1391
# pass 1391
# fail 0
```

(Exact count = B0 + the deltas actually landed. If a PR adds one extra test, record it in DECISIONS and keep the assertion; do not delete a test to hit 1391.)

Build (pages job **Build the site**):

```text
dashboard: site/index.html 1 page, runs <n>, invalid listed 1, observations <k>
token scan: clean
```

Placeholders `<n>` and `<p95_ms>` only. Never invent a number in the expected-output sketch.

Card sketches (text, not numbers):

```text
[knee] PASS
  SVG: three products, rate on x, p95 on y, band, "app_cpu at step <n>", stop square
  INVALID listed: Documenso 20261025T211144Z-2d4c30cb dropped_iterations
  source runs: 40234172872, 40235802167, 40237156783, 40290101719, 40291101493, 40291950598

[soak] PASS (runs VALID) + chart caption NO THRESHOLD YET
  theilSen <mb_per_min> MB/min, plateau ratio <ratio>
  source: soak.json in the soak zips; soak-bounds.json products {}

[aa-noise] PASS
  hollow warm-up, solid counted, spread <s> tolerance <t> from tolerance.json

[ab-gate] PASS (Cal)
  Medusa: pending: verdict file not in release
  self-test slowed: FAIL (REGRESSION)

[two-instance] PASS
  source: P6-MED-RACE-002 histograms and P6-MED-LOAD-007 verdicts in the perf zips

[promo] PASS with suspected-bug counts for -005 / -012
[cancel] KNOWN FAIL (P6-OBS-MED-002)
[invariants] KNOWN FAIL (P6-OBS-CAL-002 / P6-OBS-DOC-002)
[invariants-load] KNOWN FAIL (P6-OBS-MED-002), leak N = 4, 5, 6
[twenty] PENDING
  p6-phase4 histograms still have the default fail; waiting for a release after PR-T
```

Expected summary tiles after the final PR, rebuilt from the current releases (ten cards: knee, soak, two-instance, promo, cancel, invariants, invariants-load, aa-noise, ab-gate, twenty):

- evidence cards: **PASS 6, FAIL 0, KNOWN FAIL 3, PENDING 1, INVALID 0** (PASS: knee, soak, two-instance, promo, aa-noise, ab-gate; KNOWN FAIL: cancel, invariants, invariants-load; PENDING: twenty). ab-gate is PASS when `gate-verdict-cal.json` is in the zip; Medusa stays a caption `pending: verdict file not in release`, not a PENDING card.
- soak thresholds: `0 of 3 products calibrated` (unchanged)
- A/A: `A/A PASS` (no longer "runs pending release")
- findings: 24 rows
- INVALID list: Documenso knee `20261025T211144Z-2d4c30cb`

If a count differs from this forecast, follow the evidence and record it; do not change an assertion to hide it.

## 11. Environment changes

**none.** Q-7 drops the screenshot script, so neither cloud installs Chromium.

`unzip` was missing in the planning image; Python `zipfile` was used. The GitHub-hosted runner already has `unzip` (pages.yml). No repo change.

## 12. Build order

Wave 1 PRs are parallel-safe (disjoint files: T, A, B, C, D). Wave 2 after PR-D, parallel among themselves. Wave 3 after all of the above.

Per-PR loop (every build PR):

1. `git fetch origin main && git checkout -b feat/<date>-p6-dashboard-v2-<slug> origin/main`
2. Tests first, then code, then workflow, then README, one commit per step below.
3. After each commit: `npx prettier --write <the files of the step> && export PATH="/usr/local/bin:$PATH" && npm run check` (exit 0, expected count).
4. Stage explicitly: `git add <path> <path>` (never `git add -A`). `git status --short` before the commit.
5. Subject: the lowercase Conventional Commit in the step table. No body footers, no trailers.
6. `git push -u origin feat/<date>-p6-dashboard-v2-<slug>` (no force).
7. Open one PR against `main`. CI green.
8. CodeRabbit: wait at most 20 minutes per round, at most 3 rounds. Fix real defects in a new commit. Do not reply to review comments through the connector.
9. Merge as a **merge commit** titled `<conventional title> (#n)` with a one-sentence body. Never rewrite history if the merge title is wrong (record it as a known issue).
10. Delete only your own merged branch. If delete returns HTTP 403, do not retry (owner to-do).

### Wave 1

**PR-T** `fix(twenty): set the race histogram verdict` — `src/twenty/run-case.ts` + unit test only. Parallel-safe with A, B, C, D.

| Step | Commit                                              | Files                                         | Tests after |
| ---- | --------------------------------------------------- | --------------------------------------------- | ----------- |
| 1    | `test(twenty): assert runTwentyTrials sets verdict` | `tests/unit/twenty-histogram-verdict.test.ts` | red         |
| 2    | `fix(twenty): set the race histogram verdict`       | `src/twenty/run-case.ts`                      | **1338**    |

**PR-A** `fix(pages): rebuild the site on main pushes and split the scan job` — `pages.yml` only. Parallel-safe with T, B, C, D.

| Step | Commit                                                               | Files                         | Tests after         |
| ---- | -------------------------------------------------------------------- | ----------------------------- | ------------------- |
| 1    | `fix(pages): rebuild the site on main pushes and split the scan job` | `.github/workflows/pages.yml` | 1336 + lint:actions |

**PR-B** `fix(gate): release the medusa a/b verdict and arm map` — `gate.yml` only. Parallel-safe with T, A, C, D. After merge, the **next** evidence-release of a gate run carries labels. Do not dispatch evidence-release from the dashboard session unless the owner sets that later.

| Step | Commit                                                  | Files                        | Tests after |
| ---- | ------------------------------------------------------- | ---------------------------- | ----------- |
| 1    | `fix(gate): release the medusa a/b verdict and arm map` | `.github/workflows/gate.yml` | 1336        |

**PR-C** `feat(dashboard): add the findings data file and its schema test`. Parallel-safe with T, A, B, D.

| Step | Commit                                                                 | Files                                                                                                           | Tests after      |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1    | `test(dashboard): add the findings schema fixtures and the drift test` | `tests/unit/findings-schema.test.ts`, `tests/unit/dashboard-fixtures-scan.test.ts`, `docs/findings.schema.json` | 1336+2 red, then |
| 2    | `feat(dashboard): add findings.json and the loader`                    | `docs/findings.json`, `src/dashboard/findings.ts`                                                               | **1347**         |

**PR-D** `feat(dashboard): add the svg chart primitives`. Parallel-safe with T, A, B, C. **Wave 2 waits on D.**

| Step | Commit                                                          | Files                                                                                                                                                                                                                              | Tests after |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | `test(dashboard): add svg primitive tests`                      | `tests/unit/dashboard-charts.test.ts`, `tests/unit/dashboard-collect.test.ts`                                                                                                                                                      | red         |
| 2    | `feat(dashboard): add svg primitives, collect, and chart stubs` | `src/dashboard/render/charts.ts`, `src/dashboard/verdicts.ts`, `src/dashboard/collect.ts`, stub modules, `scripts/dashboard/build-site.ts`, `src/dashboard/render/page.ts` (hooks only), `src/dashboard/site-model.ts` (re-export) | **1356**    |

### Wave 2 (after PR-D; parallel among themselves)

Counts below assume PR-T is on `main` (+2 → 1338). A Wave 1 PR that merges first records the B0 it actually sees.

**PR-E** `feat(dashboard): read the knee curves and mark the saturated resource` — files in §6.1 PR-E only. Parallel-safe with F, G, H.

| Step | Commit                                                               | Tests after |
| ---- | -------------------------------------------------------------------- | ----------- |
| 1    | `test(dashboard): add knee curve fixtures and assertions`            | red         |
| 2    | `feat(dashboard): plot knee curves and the first saturated resource` | **1362**    |

**PR-F** `feat(dashboard): add the soak trend lines and slope verdicts`. Parallel-safe with E, G, H.

| Step | Commit                                                                         | Tests after |
| ---- | ------------------------------------------------------------------------------ | ----------- |
| 1    | `test(dashboard): add soak downsample fixtures`                                | red         |
| 2    | `feat(dashboard): downsample soak telemetry and print theilSen from soak.json` | **1368**    |

**PR-G** `feat(dashboard): chart the a/a noise and the a/b gate ratios`. Parallel-safe with E, F, H.

| Step | Commit                                                            | Tests after |
| ---- | ----------------------------------------------------------------- | ----------- |
| 1    | `test(dashboard): add a/a and a/b fixtures from the release zips` | red         |
| 2    | `feat(dashboard): chart a/a noise and a/b ratios`                 | **1377**    |

**PR-H** `feat(dashboard): read the race tallies and fix the race card labels`. Parallel-safe with E, F, G (`cards.ts` only here). Adds the Twenty card as PENDING on current zips (Q-5). After a post-PR-T evidence-release, a follow-up can flip it; do not wait for that zip in this PR.

| Step | Commit                                                                                 | Tests after |
| ---- | -------------------------------------------------------------------------------------- | ----------- |
| 1    | `test(dashboard): add race tally fixtures and card tests for knownFail`                | red         |
| 2    | `feat(dashboard): walk race histograms and fix promo, cancel, knownFail, a/a case ids` | **1386**    |

### Wave 3 (after E–H and A–D and T)

**PR-I** `feat(dashboard): render the findings table and the size budget`

| Step | Commit                                                              | Tests after |
| ---- | ------------------------------------------------------------------- | ----------- |
| 1    | `test(dashboard): add findings table, contrast, csp and size tests` | red         |
| 2    | `feat(dashboard): render the findings table, csp, and size budget`  | **1391**    |

**PR-J** `docs(readme): describe dashboard v2 and link the findings data file` — README only.

| Step | Commit                                                                | Tests after |
| ---- | --------------------------------------------------------------------- | ----------- |
| 1    | `docs(readme): describe dashboard v2 and link the findings data file` | **1391**    |

README changes: replace the Dashboard subsection (`README.md:1067-1075`) with a pointer to the GitHub Pages site of this repository, to `docs/findings.json`, and to the five chart families. The README has no `github.io` URL today; write that phrase, do not add a new URL that contains the owner's account name. No screenshot PNGs (Q-7). Keep the Known product bugs table as the human view. Do not add the bare word `capacity`.

## 13. Risks / open decisions

### Q-1 Pages step caps — **recommend (c)**

Options: (a) lower caps so the sum is at most 20 and record the margin gap; (b) merge the scan steps; (c) move token scan and gitleaks into their own job `scan` (`needs: build`) that receives the built site as an artefact.

(a) sum=17, margin=3, needs exception X-PAGES-MARGIN — rejected. R11 wants ≥10 minutes of margin; 3 is not enough. (b) mixes two scanners. (c) `build` sum=9 margin=11, `scan` sum=9 margin=11, no timeout raised. Deploy stays 10/5 (pre-existing X-PAGES-DEPLOY-MARGIN; a 10-minute job cannot hold a 10-minute margin). Never raise 20 or 10.

### Q-2 Findings source — **recommend (a)**

(a) `docs/findings.json` + schema + drift test. (b) parse the README table at build.

(a) is the machine-readable source (JSON Schema 2020-12). README stays human. Drift risk is real and is the test's job. (b) is brittle markdown.

### Q-3 Medusa A/B — **recommend (b)**

(a) recompute from start order and label it inferred. (b) show `verdict file not in release` until a run after PR-B is released.

Evidence: no `gate-verdict-medusa.json` in 40636843578; labels were stripped by the flatten. Never present an inferred `a-1` as released. The six p95 values may appear in a table without arm letters.

### Q-4 Medusa pass + suspectedBug — **PASS with a suspected-bug count**

Evidence: `run-order-case.ts:76-77, 265-266` (D54). KNOWN FAIL only via `spec.knownFail` / `stages.reconcile.data.knownFail`. Never map to FAIL.

### Q-5 Twenty fail + 0 violations — **Wave 1 PR-T, then a PENDING card**

Evidence: `histogram.ts:53` default `"fail"`, `runTwentyTrials` never sets `verdict`, BACKLOG.md:108-111 (TEST BUG in reporting). Fix in PR-T: assign verdict like Cal (`src/cal/run-case.ts:267-268`). Keep the default for unfinished histograms. PR-H shows a Twenty card as PENDING until a post-PR-T release. Findings table still lists `P6-TW-RACE-004`.

### Q-6 Downsampling — **1-minute min/mean/max**

LTTB (Steinarsson 2013) set aside. Source: probed `intervalMs=1000`; Grafana/Prometheus fixed-step min/mean/max. Slopes stay on `soak.json`.

### Q-7 Screenshots — **drop the PNGs**

Hand-made PNGs drift from the live site and cannot be reproduced. A pinned `npm run screenshots` script with dated output under `docs/img/` would need Chromium on both clouds. Drop the PNGs. PR-J links the GitHub Pages site of this repository from the README (no new owner-account URL). No Chromium environment change.

### Proposed extras (out of scope)

- X-PAGES-DEPLOY-MARGIN: deploy job timeout 10 cannot hold a 10-minute step-cap margin; do not raise 10.
- X-PAGES-STOP: 80% stop on the existing fetch step; not added (fetch stays on the existing `build` job).
- X-CI-SHOT: `ci(pages): screenshot the site in a new job` (Q-7 dropped PNGs).
- X-OBS-HEADINGS: `docs(observations): give CAL-005 and DOC-007 a P6-OBS heading` (findings.json already lists them)

## 14. Done when

Measurable, each with the file and test that proves it:

| V   | Closed by                                                        | Test                                                                            |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| V1  | `knee-chart.ts` marks `app_cpu at step n`                        | `the SVG contains the text app_cpu at step 5`                                   |
| V2  | `soak-chart.ts` prints theilSen and `NO THRESHOLD YET`           | soak tests 1–3                                                                  |
| V3  | `pages.yml` push + `scan` job + no `EVIDENCE_RELEASE`            | `lint:actions`; grep the env is gone; `scan` `needs: build`                     |
| V4  | `docs/findings.json` 24 rows rendered                            | findings table has 24 data rows                                                 |
| V5  | `aa-noise` / `ab-gate` caseIds set                               | A/A card is no longer pending                                                   |
| V6  | `readRaceTallies`                                                | CAL-RACE-001 tally test                                                         |
| V7  | promo/cancel caseIds                                             | promo/cancel card tests                                                         |
| V8  | `knownFail` field in `computeCard`                               | LOAD-009 KNOWN FAIL with leak 4, 5, 6                                           |
| V9  | `gate.yml` stages verdict + arm map; site pending until released | Medusa A/B pending test; after the next release, a follow-up can flip the chart |
| Q-5 | PR-T assigns `histogram.verdict` in `runTwentyTrials`            | twenty-histogram-verdict tests 1–2; Twenty card PENDING on p6-phase4            |

Live site after the final PR (pages rebuild on the new push trigger, or an owner dispatch): tiles in §10, each naming its source runs from §3. Size of `index.html` ≤ the budget locked in PR-I. Token scan and gitleaks clean.

## 15. Rule self-check

Industry practice (one line each):

- Workflow `on.push.paths`, `needs`, and `timeout-minutes`: GitHub Docs, Workflow syntax for `on` and `jobs.<job_id>.timeout-minutes` / `jobs.<job_id>.steps[*].timeout-minutes`; "Deploying with GitHub Actions" for uploading the Pages artefact from the job that `deploy` needs.
- Q-1 (c): `build` and `scan` each sum 9 under timeout 20 (margin 11). Deploy timeout 10 is pre-existing X-PAGES-DEPLOY-MARGIN; never a timeout raise.
- SVG charts: W3C WCAG 2.2 Success Criterion 1.1.1 and 1.4.3; WAI-ARIA Graphics `role="img"` with `aria-labelledby` pointing at `<title>` and `<desc>`.
- Colour not the only signal: WCAG 2.2 1.4.1. Shape + dash + text.
- JSON Schema as the findings contract: json-schema.org 2020-12; README as the human view (docs-as-code).
- k6 / SRE: do not invent an SLO; soak stays `NO THRESHOLD YET` until `soak-bounds.json` has a product (k6 thresholds are explicit, not implied).
- Downsample min/mean/max over a fixed step: Prometheus recording-rule / Grafana interval downsample. LTTB not used (non-standard vs some visualisation libraries; logged).

Rules in section 0 of the prompt:

- N1–N4: this file is the plan; the session's only summary is the final report.
- R1/P1: no GitHub client name in this file.
- R2/O1: plan-only; no merge, no dispatch, no labels, no comments.
- R3: merge-commit for build PRs; no force-push, no rebase of pushed work.
- R4: `git add <path>` only.
- R5: commit subjects listed; branch pattern listed.
- R6: "the owner"; `<repo>/actions/runs/<id>`; no new owner-account URLs.
- R7/O5: fixtures trimmed; token scan over them; no `pk_` quoted.
- R8/H3: no assertion weakened; the A/A pending test is replaced because it encoded V5.
- R9: PRODUCT BUG (SUSPECTED) / TEST BUG labelled in findings and Q-5.
- R10: "knee range", never "capacity".
- R11/H4: no `perf.yml` edit, no timeout raise, no Cal cap raise. New job: `scan` (timeout 20, step sum 9, margin 11, `if:`, artefact retention 90, pinned SHAs, `if: ${{ !cancelled() }}` on scan/summary, summary after token scan).
- R12: new `scan` job follows R12 in full. 80% stop not added on the existing fetch step (X-PAGES-STOP).
- R13: extras stay extras.
- R14: no environment change (Q-7 dropped Chromium).
- R15: times in this file are Asia/Colombo.
- R16: names in the file tree are exact.
- O3: no edit of published releases.
- O4: pages.yml GitHub-client line cited by step name only.
- O6: CodeRabbit 20 min × 3 in §12.
- O7: merge title `<conventional title> (#n)`, one-sentence body.
- O8: this session's steps were S0–S7.

Non-standard choices (flagged): X-PAGES-DEPLOY-MARGIN (pre-existing 10-minute deploy job); inline `node --input-type=module` in gate.yml instead of a new script (to keep PR-B `gate.yml` only); Medusa A/B unlabelled values listed without arm letters; D-COLLECT moves `walkVerdicts` into `src/dashboard/verdicts.ts` so `src/` never imports the build CLI; download-artifact v7.0.0 is a new pin (not yet in this repo).
