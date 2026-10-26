# P6 Phase 4b Task 13: dashboard on GitHub Pages and the three showcases (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 717 to 751 (Task 13), D9 (line 823), D10 (line 826). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `86dbbde` (merged into this branch at `fe09ba6`; re-checked 2026-10-26 against main 86dbbde). Probe date 2026-10-25 (UTC). **VM timings prove that a step works; none is a published number or a target.** The site is built only from evidence artefacts, so most showcases depend on Tasks 7, 10 and 11 data that do not exist yet (§3.2).

## 1. Header

- **Task and roadmap line:** Phase 4b Task 13, roadmap lines 717 to 751.
- **Cases:** dashboard publish (master plan §7 and §9); showcases D10 (a) knee chart with the first saturated resource named, (b) soak leak check (slope and plateau verdict), (c) two-instance Medusa conservation (`P6-MED-RACE-002` and `P6-MED-LOAD-007`).
- **Build branch pattern:** `feat/<build date>-p6-dashboard`.
- **Unit-test delta:** **+10 against B 1184** (B0 1102, the bound PR, and Tasks 7 to 12; index §2). Expected after the last step: **1194**.
- **Stop for owner review: yes.** A new workflow (`pages.yml`), a publish to GitHub Pages (external), and a manual repo setting (Settings → Pages → Source "GitHub Actions", owner's act).

## 2. What it proves

- The published numbers are the evidence, with their environment and run links: every number on the site links to its run and its `run-meta.json`.
- INVALID runs are listed and never plotted as results (the roadmap rule).
- The site is free of secrets: the token scan and gitleaks run over the **built site** before deploy, and a hit stops the deploy.
- Transfer: an audit pack a reviewer reads without CI access, with the run, the environment and the verdict in one place.

## 3. Live probe evidence

### 3.1 What was probed

| #   | Roadmap probe item                                              | Command or source                                                                                                                                                                                                       | Output (trimmed)                                                                                                                                                                            | Value it sets                                                                                                                                                                                      |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | Site size                                                       | `wc -c` of the chart HTML from this session's runs: `results/load/P6-MED-LOAD-002/20261025T232345Z-f57779a7/chart-main.html` and `results/load/P6-CAL-LOAD-003/20261025T233524Z-8986f965/chart-main.html`               | **11,963 bytes** and **12,242 bytes** per run                                                                                                                                               | one chart is about 12 KB; a site of twelve charts is about 150 KB before the index: far below any Pages limit                                                                                      |
| S-2 | No CDN, self-contained (D8, D9)                                 | `grep -oE 'src="https?://\|href="https?://' chart-main.html`                                                                                                                                                            | **0 external references** (both products)                                                                                                                                                   | the chart pattern is kept: the site is self-contained, no script or stylesheet from a CDN                                                                                                          |
| S-3 | The token scan and gitleaks used over the artefacts             | `.github/workflows/evidence-release.yml` lines 40 and 41                                                                                                                                                                | `GITLEAKS_VERSION` "8.30.1" and `GITLEAKS_SHA256` "551f6fc8…f2470eb"; the archive name at line 148                                                                                          | gitleaks is pinned and checksum-verified; the site scan uses the same pin (§6.3)                                                                                                                   |
| S-4 | Pages action versions pinned by SHA                             | web read, 2026-10-26: the three commits exist on their upstream repositories (`configure-pages` 45bfe01, `upload-pages-artifact` fc324d3, `deploy-pages` 368f825); the tag association is not shown on the commit pages | the three SHAs and their tags (§6.5, Q-ACTIONPIN resolved); the build PR re-verifies them on the upstream tag pages                                                                         | pinned in the same style as the other workflows (`actions/checkout@…  # v7.0.1`)                                                                                                                   |
| S-5 | Showcase (a), the knee charts with the first saturated resource | the three knee reports (`knee-report-main.json`) read in Task 7 D-2: Documenso `firstSaturated` `app_cpu` at step 2; Cal and Medusa from the 4a knee artefacts (on main as `k6/thresholds/knee-bounds.json` run IDs)    | Documenso: knee range 4 to 5 per second, first saturated `app_cpu` (step 2), stop at step 4 by `p95`; Cal and Medusa knee ranges per `knee-bounds.json` (lower 8 and 1.5, upper 14 and 2.5) | (a) is **available now** for the three products from the artefacts on GitHub (the Cal and Medusa knee artefacts are in the runs listed in `knee-bounds.json`; the Documenso ones were read in D-2) |
| S-6 | Showcase (b), the soak leak check                               | none: Task 7 has not run                                                                                                                                                                                                | —                                                                                                                                                                                           | **pending** until three VALID 30-min soaks exist (Task 7 §14)                                                                                                                                      |
| S-7 | Showcase (c), two-instance conservation                         | the two-instance start works (Task 10 M10-1: both health checks 200, `redis:7`); the conservation run `P6-MED-LOAD-007` does not exist yet                                                                              | —                                                                                                                                                                                           | **pending** until Task 10's `-007` runs exist                                                                                                                                                      |
| S-8 | No chart carries a token or a publishable key                   | `grep -c 'pk_\|token' <chart-main.html>` on the two charts of S-1                                                                                                                                                       | **0** and **0**                                                                                                                                                                             | the chart is publishable as a derived view; the scan still runs over the built site (§6.3)                                                                                                         |

### 3.2 What the probe could not confirm

1. The Pages deploy action versions and their SHAs (S-4): pinned in §6.5 (Q-ACTIONPIN); the build PR re-verifies the tags on the upstream tag pages.
2. The gitleaks run over a built site (the scan itself): UNPROBED; the scanner is available on the VM only through the pinned download in `evidence-release.yml`, which the build step repeats.
3. Showcases (b) and (c): pending their data (S-6, S-7).
4. The Pages publish from a fork or a branch: not applicable; the workflow publishes from `main` only.

## 4. Depends on

Main at `86dbbde` (re-checked 2026-10-26; verified):

- `scripts/evidence-token-scan.mjs` (the scanner; `findHits` is used by `write-knee-bounds` and `write-baseline-band`), `scripts/write-ci-job-summary.ts`.
- `.github/workflows/evidence-release.yml` (`EVIDENCE_WORKFLOW_IDS` line 39, the gitleaks pin lines 40 and 41, the download and checksum at lines 143 to 150, the allowlist `json log csv html txt`, line 140).
- `k6/thresholds/knee-bounds.json`, `k6/thresholds/baseline-band.json`, `k6/thresholds/smoke-p95.json` (the site's numbers come from these files and the run IDs they cite).
- `src/load/knee/knee-report.ts` (the knee report), `src/load/knee/first-saturated.ts` (the first saturated resource, Task 1), `src/load/chart/render-chart.ts` (the chart HTML, Phase 3 Task 5).
- `README.md` "Phase 3 results" (lines 649 to 716) and "How to read a knee" (line 843): the wording the site copies.
- `tests/unit/readme-rules.test.ts` line 8 (the bare word "capacity" is forbidden in README; the same rule applies to the site text).

**Not on main until step 0b (the bound PR):** `products.documenso` in `knee-bounds.json`. Showcase (a) reads the Documenso knee report from its released artefact until then (Task 7 D-2).

**4a lessons applied** (each is checked by the build step it names):

- `DANGEROUS_BYPASS_RATE_LIMITS` defaults to true (`scripts/harness.mjs` line 33, `||=`); the dashboard reads evidence only and runs no limiter case.
- `no_reference` → INVALID: a showcase with a missing reference is pending, never a plotted number (§6.2).
- `low_sample_stop` and INVALID runs are listed, never plotted (§2, §7).
- Config-used tests for every new config field (the site model's inputs, §6.2).
- k6 has no URL global (no k6 code in this task).
- Cleanup never in a limiter window under test (no cleanup in this task).
- Per-intent audit with no slack (the showcase data is the audited verdicts only).
- The F-M2 ghost flag (Medusa) is shown as recorded, never as a site verdict.
- "knee range" wording, never "capacity" (R10; `tests/unit/readme-rules.test.ts`).
- CI budget rules (§6.5, §9, X8): every step capped, retention 90 for any upload.
- The owner dispatches in the UI and pastes the run ids.

## 5. Build-time recheck table

| #   | Check                                                                        | Exact command                                                                        | Expected                     | If it differs                                                                          |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Settings → Pages → Source is "GitHub Actions" (owner, by hand)               | owner confirms; the build PR states it                                               | set                          | the deploy step fails with a clear message; the owner sets it                          |
| 2   | Showcase (b) data present (Task 7 §14, three VALID 30-min soaks per product) | the soak artefacts `soak-<product>-30` in three runs                                 | present                      | the showcase stays "pending" on the site and in the README, never a placeholder number |
| 3   | Showcase (c) data present (Task 10, `P6-MED-LOAD-007` VALID runs)            | the `medusa-invariants` artefacts                                                    | present                      | as row 2                                                                               |
| 4   | Gitleaks pin unchanged                                                       | `grep -n "GITLEAKS_VERSION\|GITLEAKS_SHA256" .github/workflows/evidence-release.yml` | 8.30.1 and the SHA above     | the site scan follows the file                                                         |
| 5   | `npm run check`                                                              | `npm run check`                                                                      | exit 0 with the count of §12 | fix                                                                                    |

## 6. Design

### 6.1 File tree

```text
.github/workflows/pages.yml                   NEW  builds the site from evidence artefacts, scans it, deploys to Pages (main only, after the evidence step or by dispatch)
scripts/dashboard/build-site.ts               NEW  reads the artefact folders and the threshold files, writes site/ (self-contained HTML, no CDN)
scripts/dashboard/showcases.ts                NEW  the three showcases: knee chart with first saturated resource, soak verdict, two-instance conservation; each with its "what this proves" note
src/dashboard/site-model.ts                   NEW  pure: the site model from the artefacts (runs, verdicts, INVALID list, links to run-meta)
tests/unit/build-site.test.ts                 NEW  5 tests (the INVALID list is not plotted; every number links to its run; no external URL; "capacity" absent)
tests/unit/site-model.test.ts                 NEW  3 tests (pending showcase when data is absent; ordering; escape of run labels)
tests/unit/showcases.test.ts                  NEW  2 tests (the three showcases each carry their note; the note text is in the README too)
README.md                                     CHANGED  the three showcase notes and a link to the site (the README carries the same notes, D10)
```

### 6.2 The site model (`src/dashboard/site-model.ts`, NEW)

```ts
// src/dashboard/site-model.ts
export type ShowcaseId = "knee" | "soak" | "two-instance";
export interface ShowcaseState {
  id: ShowcaseId;
  status: "ready" | "pending";
  pending?: string; // the reason, shown on the site and in the README (never a placeholder number)
  note: string; // "what this proves", the same text as the README
  runLinks: string[]; // GitHub Actions run URLs of the evidence used
}
export interface SiteModel {
  generatedFrom: string[]; // the run IDs the site was built from
  showcases: ShowcaseState[];
  invalidRuns: Array<{ runId: string; caseId: string; reasons: string[] }>; // listed, never plotted
}
/** Builds the model from the verdicts and run-meta of each artefact folder. A showcase without its data is pending with its reason. */
export function buildSiteModel(input: {
  verdicts: Array<{
    runId: string;
    caseId: string;
    outcome: string;
    validity: string;
    reasons: string[];
  }>;
  hasSoakData: boolean;
  hasInvariantData: boolean;
}): SiteModel;
/** The escape of a run label before it is put in HTML (no raw label in the page). */
export function escapeLabel(s: string): string;
```

### 6.3 The build and the scans (`scripts/dashboard/build-site.ts`, NEW; `pages.yml`)

The build writes `site/index.html` (one page: the three showcases, the knee table with the first saturated resource, the steady band, the INVALID list, links to every run and its `run-meta.json`). No script or stylesheet from a CDN; the inline chart of each run is reused from the artefact (`chart-main.html`, self-contained, §3.1 S-2).

**Scans before deploy (both, as D9 requires):**

1. `node scripts/evidence-token-scan.mjs site` (the repo scanner, the same as before every artefact upload).
2. gitleaks over the built site: the pinned download of `evidence-release.yml` lines 143 to 150 (`GITLEAKS_VERSION` 8.30.1, `GITLEAKS_SHA256` checked), then `gitleaks dir site --no-banner --redact --exit-code 1`. A hit stops the deploy (the `deploy` step is guarded by both scans' success).

### 6.4 Showcase notes (the same text in the site and in README)

- **(a) Knee chart with the first saturated resource named.** "This shows where each product's knee range sits and which resource gave first (rule in src/load/knee/first-saturated.ts). It proves the stop rule finds a range, not a single maximum: the range and the run IDs are the evidence, and the label is 'knee range, environment-bound'."
- **(b) Soak leak check.** "This shows the RSS, fds and connection slope after warm-up and the plateau verdict, with the DB growth reported separately. It proves that growth which does not plateau is flagged and that data growth is not read as a leak." Pending until Task 7's data exists.
- **(c) Two-instance Medusa conservation.** "This shows that two Medusa backends on one database and one Redis lock sell no more units than stock, and that no cart becomes two orders (P6-MED-RACE-002 and P6-MED-LOAD-007). It proves the lock holds under two instances." Pending until Task 10's data exists.

### 6.5 CI (`pages.yml`, NEW)

```yaml
name: pages

on:
  workflow_run:
    workflows: ["evidence-release"] # decided (Q-PAGESTRIGGER): evidence-release only, plus workflow_dispatch
    types: [completed]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false
```

Jobs: `build` (checkout, setup-node, the evidence zips of the cited releases (`p6-phase4a`, later `p6-phase4`), fetched with curl from the public release assets for the run IDs in `k6/thresholds/*.json` and checked against `SHA256SUMS.txt` before unzip, `scripts/dashboard/build-site.ts`, the two scans, `actions/configure-pages` and `actions/upload-pages-artifact` pinned by SHA (S-4), each step with its `timeout-minutes`), and `deploy` (`actions/deploy-pages` pinned by SHA, `needs: build`, `environment: github-pages`).

**Pins (Q-ACTIONPIN, decided):**

- `actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0`
- `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0`
- `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1`

The three commits exist on their upstream repositories (web read, 2026-10-26). The build PR re-verifies the tags on the upstream tag pages.

**No `actions: read` is needed:** the evidence is public release assets (curl), and `pages.yml` is not an evidence source: it is not in `EVIDENCE_WORKFLOW_IDS`. An unreleased run is the fallback only: `actions/download-artifact` with run-id and github-token (the 90-day artefact expiry applies there). The site is built only from `main`, on both paths: the `workflow_run` trigger runs only when its `head_branch` is `main` (`if: github.event.workflow_run.head_branch == 'main'`), and a `workflow_dispatch` run is guarded by `if: github.ref == 'refs/heads/main'` in the `build` job, so a manual dispatch from another ref stops before any download.

**Each evidence run is validated before its zip is fetched, on both paths.** The `workflow_run` check above validates only the triggering run, not the runs the release contains. For every run ID the build reads from `k6/thresholds/*.json`, a validation step requires all of: (1) `conclusion` is `success`; (2) the run's `workflow_id` is in the `EVIDENCE_WORKFLOW_IDS` list of `evidence-release.yml` (line 39); (3) `head_branch` is `main`; (4) `head_sha` is an ancestor of the Pages target commit (`git merge-base --is-ancestor <head_sha> ${{ github.sha }}`). The run metadata comes from the public REST endpoint `GET /repos/{owner}/{repo}/actions/runs/{id}`. A run that fails any check stops the build with its run ID named, so a stale or unapproved run ID never enters the public dashboard. The zips themselves are checked against `SHA256SUMS.txt` (§6.5).

Budget: `build` 20 min (setup 5, download 5, build 2, scans 3, upload 2, the rest 3); `deploy` 10 min; both far under the 6 h cap.

**Token scan before every Pages publish**: `scripts/evidence-token-scan.mjs site` is the step that guards `deploy`.

## 7. Oracles and assertions

- Each site number traces to a run ID and its `run-meta.json` (a unit test on `buildSiteModel`).
- A run whose `verdict.json` is INVALID is listed in `invalidRuns` and never plotted (a unit test).
- A showcase without its data is `pending`, with its reason on the site and in README (no placeholder number, a unit test).

## 8. Data isolation, cleanup and leak check

The site carries derived values only: no raw points (`*.json.gz` never enters the release, L5), no telemetry JSON, no token. The scans in §6.3 are the check. There is no database and no run prefix in the site.

## 9. CI, token scan and budget

§6.5: `build` 20, `deploy` 10. The token scan runs before deploy; gitleaks runs before deploy; the `deploy` step does not run if either fails (`needs: build` and `if: success()`). Permissions: `contents: read`, `pages: write`, `id-token: write` (the minimum for Pages; justified by the deploy action).

## 10. Expected output

```text
dashboard: site/index.html 1 page, <bytes> bytes, runs <n>, invalid listed <k>, showcases ready <r>, pending <p>
scan token: 0 hits; gitleaks: 0 leaks
deploy: https://<owner-pages-url> (the owner's Pages URL, not written here)
```

Placeholders only.

## 11. Environment changes

- **Repo settings by hand (owner):** Settings → Pages → Source "GitHub Actions" (the one manual step of D9).
- **Cursor Cloud and Claude Code cloud:** none. (The site build needs curl, the pinned gitleaks and the public release assets; no GitHub CLI is used.)

## 12. Build order

| Step | Commit                                                                    | Files                                                                                                    | Unit tests after the step (1184 before this task) |
| ---- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | `feat(dashboard): add the site model and the showcase states`             | `src/dashboard/site-model.ts`, `tests/unit/site-model.test.ts` (3), `tests/unit/showcases.test.ts` (2)   | 1189                                              |
| 2    | `feat(dashboard): build the site from the evidence artefacts`             | `scripts/dashboard/build-site.ts`, `scripts/dashboard/showcases.ts`, `tests/unit/build-site.test.ts` (5) | 1194                                              |
| 3    | `ci(pages): add the pages workflow`                                       | `.github/workflows/pages.yml`                                                                            | 1194 (plus `lint:actions`)                        |
| 4    | `docs(dashboard): add the showcase notes and the site link to the readme` | `README.md`                                                                                              | 1194                                              |

**Expected after the last step: 1194** (B 1184 + 10).

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-PAGESTRIGGER.** Decided: `workflow_run` of `evidence-release` plus `workflow_dispatch`. The alternative, each product workflow, means more builds and less control.
- **Q-SHOWPEND.** Decided: show "pending" with the reason (rejected: omit, which hides the D10 requirement).
- **Q-ACTIONPIN.** Decided: the three SHAs in §6.5 (S-4 resolved by a web read); the build PR re-verifies the tags on the upstream tag pages.

**Proposed extras:** none.

**Risks:**

- Publishing something the scan misses: two scanners (token scan and gitleaks) over the built site; nothing raw is published (§8).
- Stale pages: the site is rebuilt by `workflow_run` on each completed release.
- INVALID runs excluded from the plots: listed, so a reader sees how many runs were not used.

## 14. Done when (roadmap, made measurable)

Roadmap: "The site builds from artefacts, the scans pass over the built site, it deploys to Pages, and it shows the three showcases with their 'what this proves' notes and run links; README carries the same three notes and links the site; `npm run check` green."

Measured: (1) `npm run check` with 1194 tests, `# fail 0`; (2) `pages.yml` run green on `main` with both scans recorded as passed; (3) the Pages URL shows the three showcases (showcases (b) and (c) may show "pending" until their data exists, with the reason; this is recorded, not hidden); (4) the README carries the same three notes and the site link.

## 15. Rule self-check

- **A1 to A5:** plan branch, Conventional Commits, explicit paths, no attribution, environment identity.
- **B7 (probe first):** §3 has S-1 to S-8 with the real sizes and checks; S-4 resolved by a web read (the three commits exist; tags re-verified at build).
- **B9:** §13 lists three open decisions with recommendations.
- **B10:** stop for review (§1).
- **C12:** no pending showcase is filled with a placeholder number.
- **Industry practice:** the static, self-contained site and the scans before publish follow the GitHub Pages docs ("Publishing with a custom GitHub Actions workflow") and the OWASP guidance on not publishing secrets in static output; GitHub `permissions` minimums are GitHub docs ("Workflow syntax", `permissions`).
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §4 (`evidence-release.yml` lines 39, 40, 41, 140, 143 to 150; `tests/unit/readme-rules.test.ts` line 8; the chart file of §3.1); (c) budget in §9; (d) skeletons in §6; (e) no owner answer recorded as given.
